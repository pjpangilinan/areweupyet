package apiprivate

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidToken   = errors.New("invalid token format")
	ErrUnsupportedAlg = errors.New("unsupported signing algorithm")
	ErrKeyNotFound    = errors.New("signing key not found in JWKS")
	ErrTokenExpired   = errors.New("token is expired")
	ErrInvalidIssuer  = errors.New("token issuer does not match Cognito User Pool")
	ErrInvalidUse     = errors.New("token_use must be id or access")
	ErrMissingSub     = errors.New("token missing sub claim")
)

type TokenClaims struct {
	Sub      string `json:"sub"`
	Iss      string `json:"iss"`
	Exp      int64  `json:"exp"`
	TokenUse string `json:"token_use"`
	Email    string `json:"email,omitempty"`
}

type jwksResponse struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKSVerifier verifies Cognito JWT tokens cryptographically against JWKS public keys.
type JWKSVerifier struct {
	region     string
	userPoolID string
	jwksURL    string
	httpClient *http.Client
	mu         sync.RWMutex
	keys       map[string]*rsa.PublicKey
	lastFetch  time.Time
}

// NewJWKSVerifier creates a verifier for an AWS Cognito User Pool.
func NewJWKSVerifier(region, userPoolID string) *JWKSVerifier {
	jwksURL := fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s/.well-known/jwks.json", region, userPoolID)
	return &JWKSVerifier{
		region:     region,
		userPoolID: userPoolID,
		jwksURL:    jwksURL,
		httpClient: &http.Client{Timeout: 5 * time.Second},
		keys:       make(map[string]*rsa.PublicKey),
	}
}

// NewJWKSVerifierWithKeys allows injecting static RSA public keys for unit testing.
func NewJWKSVerifierWithKeys(region, userPoolID string, keys map[string]*rsa.PublicKey) *JWKSVerifier {
	return &JWKSVerifier{
		region:     region,
		userPoolID: userPoolID,
		httpClient: &http.Client{Timeout: 5 * time.Second},
		keys:       keys,
		lastFetch:  time.Now(),
	}
}

func (v *JWKSVerifier) getKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	key, exists := v.keys[kid]
	cacheFresh := time.Since(v.lastFetch) < 1*time.Hour
	v.mu.RUnlock()

	if exists && cacheFresh {
		return key, nil
	}

	// Fetch or refresh JWKS
	v.mu.Lock()
	defer v.mu.Unlock()

	// Double check under write lock
	if key, exists := v.keys[kid]; exists && time.Since(v.lastFetch) < 1*time.Hour {
		return key, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create JWKS request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS request failed with status: %d", resp.StatusCode)
	}

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS: %w", err)
	}

	newKeys := make(map[string]*rsa.PublicKey)
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" || k.N == "" || k.E == "" {
			continue
		}
		pubKey, err := parseRSAPublicKey(k.N, k.E)
		if err == nil {
			newKeys[k.Kid] = pubKey
		}
	}

	v.keys = newKeys
	v.lastFetch = time.Now()

	key, exists = v.keys[kid]
	if !exists {
		return nil, fmt.Errorf("%w: %s", ErrKeyNotFound, kid)
	}
	return key, nil
}

// VerifyToken validates JWT signature, expiration, issuer, and token_use claims.
func (v *JWKSVerifier) VerifyToken(ctx context.Context, tokenString string) (*TokenClaims, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}

	headerJSON, err := decodeBase64URL(parts[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode header: %w", err)
	}

	var header struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("failed to unmarshal header: %w", err)
	}

	if header.Alg != "RS256" {
		return nil, fmt.Errorf("%w: %s (expected RS256)", ErrUnsupportedAlg, header.Alg)
	}
	if header.Kid == "" {
		return nil, errors.New("missing kid in token header")
	}

	pubKey, err := v.getKey(ctx, header.Kid)
	if err != nil {
		return nil, err
	}

	// Verify cryptographic signature
	signedContent := parts[0] + "." + parts[1]
	signatureBytes, err := decodeBase64URL(parts[2])
	if err != nil {
		return nil, fmt.Errorf("failed to decode signature: %w", err)
	}

	hashed := sha256.Sum256([]byte(signedContent))
	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hashed[:], signatureBytes); err != nil {
		return nil, fmt.Errorf("cryptographic signature verification failed: %w", err)
	}

	// Verify claims
	payloadJSON, err := decodeBase64URL(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload: %w", err)
	}

	var claims TokenClaims
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return nil, fmt.Errorf("failed to unmarshal claims: %w", err)
	}

	now := time.Now().Unix()
	if claims.Exp <= now {
		return nil, fmt.Errorf("%w: expired at %d, now %d", ErrTokenExpired, claims.Exp, now)
	}

	expectedIssuer := fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s", v.region, v.userPoolID)
	if v.userPoolID != "" && claims.Iss != expectedIssuer {
		return nil, fmt.Errorf("%w: got %s, expected %s", ErrInvalidIssuer, claims.Iss, expectedIssuer)
	}

	if claims.TokenUse != "id" && claims.TokenUse != "access" {
		return nil, fmt.Errorf("%w: got %s", ErrInvalidUse, claims.TokenUse)
	}

	if claims.Sub == "" {
		return nil, ErrMissingSub
	}

	return &claims, nil
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := decodeBase64URL(nStr)
	if err != nil {
		return nil, err
	}
	eBytes, err := decodeBase64URL(eStr)
	if err != nil {
		return nil, err
	}

	var eInt int
	for _, b := range eBytes {
		eInt = (eInt << 8) | int(b)
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: eInt,
	}, nil
}

func decodeBase64URL(seg string) ([]byte, error) {
	if rem := len(seg) % 4; rem != 0 {
		seg += strings.Repeat("=", 4-rem)
	}
	data, err := base64.URLEncoding.DecodeString(seg)
	if err != nil {
		return base64.RawURLEncoding.DecodeString(strings.TrimRight(seg, "="))
	}
	return data, nil
}
