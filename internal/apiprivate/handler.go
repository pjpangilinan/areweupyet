package apiprivate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"areweupyet/internal/checker"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
	"areweupyet/internal/ssrfguard"
	"areweupyet/internal/webhook"
)

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*clientBucket
}

type clientBucket struct {
	count     int
	resetTime time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{
		buckets: make(map[string]*clientBucket),
	}
}

func (rl *rateLimiter) allow(key string, limit int, window time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	if len(rl.buckets) > 1000 {
		for k, b := range rl.buckets {
			if now.After(b.resetTime) {
				delete(rl.buckets, k)
			}
		}
	}

	b, exists := rl.buckets[key]
	if !exists || now.After(b.resetTime) {
		rl.buckets[key] = &clientBucket{
			count:     1,
			resetTime: now.Add(window),
		}
		return true
	}

	if b.count >= limit {
		return false
	}

	b.count++
	return true
}

type Server struct {
	store              dynamo.Store
	mux                *http.ServeMux
	tenantCheckLimiter *rateLimiter
	webhookTestLimiter *rateLimiter
	verifier           *JWKSVerifier
}

type CreateEndpointRequest struct {
	Name           string `json:"name"`
	URL            string `json:"url"`
	Group          string `json:"group,omitempty"`
	FrequencyMin   int    `json:"frequencyMin"` // Floor: 5 min
	TimeoutSec     int    `json:"timeoutSec"`   // Default: 10s
	ExpectedStatus int    `json:"expectedStatus"`
}

type UpdateEndpointRequest struct {
	Name           string `json:"name"`
	URL            string `json:"url"`
	Group          string `json:"group,omitempty"`
	FrequencyMin   int    `json:"frequencyMin"`
	TimeoutSec     int    `json:"timeoutSec"`
	ExpectedStatus int    `json:"expectedStatus"`
}

type TestWebhookRequest struct {
	URL    string `json:"url"`
	Secret string `json:"secret,omitempty"`
}

// NewServer initializes the HTTP router for private tenant operations.
func NewServer(store dynamo.Store) *Server {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "ap-southeast-1"
	}
	userPoolID := os.Getenv("COGNITO_USER_POOL_ID")
	if userPoolID == "" {
		userPoolID = "ap-southeast-1_2Ojq7re38"
	}

	s := &Server{
		store:              store,
		mux:                http.NewServeMux(),
		tenantCheckLimiter: newRateLimiter(),
		webhookTestLimiter: newRateLimiter(),
		verifier:           NewJWKSVerifier(region, userPoolID),
	}
	s.routes()
	return s
}

// SetVerifier allows injecting a custom or mock JWKSVerifier for testing.
func (s *Server) SetVerifier(v *JWKSVerifier) {
	s.verifier = v
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /endpoints", s.handleListEndpoints)
	s.mux.HandleFunc("POST /endpoints", s.handleCreateEndpoint)
	s.mux.HandleFunc("GET /endpoints/{id}", s.handleGetEndpoint)
	s.mux.HandleFunc("PUT /endpoints/{id}", s.handleUpdateEndpoint)
	s.mux.HandleFunc("DELETE /endpoints/{id}", s.handleDeleteEndpoint)
	s.mux.HandleFunc("POST /endpoints/{id}/check", s.handleManualCheckEndpoint)
	s.mux.HandleFunc("POST /settings/webhook/test", s.handleTestWebhook)
}

// extractTenantID retrieves and cryptographically verifies the authenticated tenant ID.
// In AWS Lambda production, a valid Bearer token signed by Cognito is strictly required.
func (s *Server) extractTenantID(r *http.Request) (string, error) {
	// 1. From context (set by verified Lambda authorizer, if present)
	if tenantID, ok := r.Context().Value("tenantId").(string); ok && tenantID != "" {
		if isValidID(tenantID) {
			return tenantID, nil
		}
	}

	// 2. From Authorization: Bearer <token> (cryptographically verified against Cognito JWKS)
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		token := strings.TrimSpace(authHeader[7:])
		if s.verifier != nil {
			claims, err := s.verifier.VerifyToken(r.Context(), token)
			if err == nil && claims != nil && isValidID(claims.Sub) {
				return claims.Sub, nil
			}
			// In production on AWS Lambda, token validation failure is strictly fatal
			if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
				if err != nil {
					return "", fmt.Errorf("unauthorized: %w", err)
				}
				return "", errors.New("unauthorized: invalid token claims")
			}
		}
	}

	// 3. For local development or unit testing only (when not in AWS Lambda)
	isAWS := os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != ""
	if !isAWS {
		if tenantID := r.Header.Get("X-Tenant-ID"); tenantID != "" && isValidID(tenantID) {
			return tenantID, nil
		}
		return "demo", nil
	}

	return "", errors.New("unauthorized: valid session token required")
}

func (s *Server) handleListEndpoints(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpoints, err := s.store.ListEndpoints(r.Context(), tenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list endpoints"})
		return
	}

	if endpoints == nil {
		endpoints = []models.Endpoint{}
	}
	writeJSON(w, http.StatusOK, endpoints)
}

func (s *Server) handleCreateEndpoint(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req CreateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if len(req.Name) > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name cannot exceed 100 characters"})
		return
	}

	req.URL = strings.TrimSpace(req.URL)
	if len(req.URL) > 2048 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL cannot exceed 2048 characters"})
		return
	}

	req.Group = strings.TrimSpace(req.Group)
	if len(req.Group) > 50 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "group cannot exceed 50 characters"})
		return
	}

	// 1. SSRF and URL validation
	if _, err := ssrfguard.ValidateTargetURL(req.URL); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid endpoint URL: %v", err)})
		return
	}

	// 2. Enforce frequency floor (5 minutes) and ceiling (1440 minutes)
	if req.FrequencyMin < 5 || req.FrequencyMin > 1440 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "check frequency floor is 5 minutes (maximum 1440 minutes)"})
		return
	}

	if req.TimeoutSec <= 0 || req.TimeoutSec > 30 {
		req.TimeoutSec = 10
	}
	if req.ExpectedStatus < 100 || req.ExpectedStatus > 599 {
		req.ExpectedStatus = 200
	}

	now := time.Now().UTC()
	endpointID := generateRandomID(8)

	ep := models.Endpoint{
		TenantID:        tenantID,
		EndpointID:      endpointID,
		Name:            req.Name,
		URL:             req.URL,
		Group:           strings.TrimSpace(req.Group),
		FrequencyMin:    req.FrequencyMin,
		TimeoutSec:      req.TimeoutSec,
		ExpectedStatus:  req.ExpectedStatus,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     now,
		Status:          "PENDING",
		ConsecutiveFail: 0,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	// 3. Store creation (enforces 20-endpoint tenant cap)
	if err := s.store.CreateEndpoint(r.Context(), ep); err != nil {
		if errors.Is(err, dynamo.ErrTenantLimit) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "endpoint limit of 20 reached for tenant"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save endpoint"})
		return
	}

	writeJSON(w, http.StatusCreated, ep)
}

func (s *Server) handleGetEndpoint(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
	if !isValidID(endpointID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid endpoint id"})
		return
	}

	ep, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID)
	if err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to get endpoint"})
		return
	}

	writeJSON(w, http.StatusOK, ep)
}

func (s *Server) handleUpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
	if !isValidID(endpointID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid endpoint id"})
		return
	}

	existing, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID)
	if err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch endpoint"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req UpdateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.Name != "" {
		trimmedName := strings.TrimSpace(req.Name)
		if len(trimmedName) > 100 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name cannot exceed 100 characters"})
			return
		}
		existing.Name = trimmedName
	}
	if req.URL != "" {
		trimmedURL := strings.TrimSpace(req.URL)
		if len(trimmedURL) > 2048 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL cannot exceed 2048 characters"})
			return
		}
		if _, err := ssrfguard.ValidateTargetURL(trimmedURL); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid URL: %v", err)})
			return
		}
		existing.URL = trimmedURL
	}
	if req.FrequencyMin > 0 {
		if req.FrequencyMin < 5 || req.FrequencyMin > 1440 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "check frequency floor is 5 minutes (maximum 1440 minutes)"})
			return
		}
		existing.FrequencyMin = req.FrequencyMin
	}
	if req.TimeoutSec > 0 {
		if req.TimeoutSec > 30 {
			req.TimeoutSec = 10
		}
		existing.TimeoutSec = req.TimeoutSec
	}
	if req.ExpectedStatus > 0 {
		if req.ExpectedStatus < 100 || req.ExpectedStatus > 599 {
			req.ExpectedStatus = 200
		}
		existing.ExpectedStatus = req.ExpectedStatus
	}
	if req.Group != "" {
		trimmedGroup := strings.TrimSpace(req.Group)
		if len(trimmedGroup) > 50 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "group cannot exceed 50 characters"})
			return
		}
		existing.Group = trimmedGroup
	}
	existing.UpdatedAt = time.Now().UTC()

	if err := s.store.UpdateEndpoint(r.Context(), *existing); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update endpoint"})
		return
	}

	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
	if !isValidID(endpointID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid endpoint id"})
		return
	}

	// Verify exists and belongs to tenant
	if _, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID); err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to locate endpoint"})
		return
	}

	if err := s.store.DeleteEndpointCascade(r.Context(), tenantID, endpointID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete endpoint"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted", "endpointId": endpointID})
}

// handleManualCheckEndpoint triggers an immediate rate-limited synthetic ping.
// Hard safeguard: minimum 30-second cooldown per endpoint to prevent ping spam and DDoS.
func (s *Server) handleManualCheckEndpoint(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
	if !isValidID(endpointID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid endpoint id"})
		return
	}

	ep, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID)
	if err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query endpoint"})
		return
	}

	// 1. Workspace-wide rate limit safeguard: max 1 manual check every 5 seconds across tenant
	if !s.tenantCheckLimiter.allow(tenantID, 1, 5*time.Second) {
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error":             "Rate limit guard: please wait at least 5 seconds between manual checks across your workspace.",
			"retryAfterSeconds": 5,
		})
		return
	}

	// Rate-limit safeguard: check timestamp of most recent ping
	pings, _ := s.store.ListPingResults(r.Context(), endpointID, 1)
	if len(pings) > 0 {
		elapsed := time.Since(pings[0].CheckedAt)
		if elapsed < 30*time.Second {
			retryAfter := int((30*time.Second - elapsed).Seconds()) + 1
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"error":             fmt.Sprintf("Rate limit guard: please wait %d seconds before checking again", retryAfter),
				"retryAfterSeconds": retryAfter,
			})
			return
		}
	}

	timeoutSec := ep.TimeoutSec
	if timeoutSec <= 0 || timeoutSec > 10 {
		timeoutSec = 5
	}

	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeoutSec+2)*time.Second)
	defer cancel()

	checkRes := checker.CheckEndpoint(ctx, checker.CheckOptions{
		URL:            ep.URL,
		TimeoutSec:     timeoutSec,
		ExpectedStatus: ep.ExpectedStatus,
	})

	now := time.Now().UTC()
	ttl := now.Add(30 * 24 * time.Hour).Unix() // 30-day Always-Free TTL

	pingRecord := models.PingResult{
		EndpointID:   ep.EndpointID,
		CheckedAt:    now,
		StatusCode:   checkRes.StatusCode,
		LatencyMs:    checkRes.LatencyMs,
		Success:      checkRes.Success,
		ErrorMessage: checkRes.ErrorMessage,
		TTL:          ttl,
	}
	_ = s.store.RecordPingResult(r.Context(), pingRecord)

	// State transition logic (2-fail open, 1-pass close)
	incidentStateChanged := false
	if !checkRes.Success {
		ep.ConsecutiveFail++
		if ep.ConsecutiveFail >= 2 && ep.Status != "DOWN" {
			ep.Status = "DOWN"
			openInc := models.Incident{
				EndpointID: ep.EndpointID,
				StartedAt:  now,
				ResolvedAt: nil,
			}
			_ = s.store.SaveIncident(r.Context(), openInc)
			incidentStateChanged = true
		}
	} else {
		if ep.Status == "DOWN" {
			openInc, _ := s.store.GetOpenIncident(r.Context(), ep.EndpointID)
			if openInc != nil {
				openInc.ResolvedAt = &now
				_ = s.store.SaveIncident(r.Context(), *openInc)
				incidentStateChanged = true
			}
		}
		ep.ConsecutiveFail = 0
		ep.Status = "UP"
	}

	ep.NextCheckAt = now.Add(time.Duration(ep.FrequencyMin) * time.Minute)
	ep.UpdatedAt = now
	_ = s.store.UpdateEndpoint(r.Context(), *ep)

	writeJSON(w, http.StatusOK, map[string]any{
		"result":               pingRecord,
		"endpoint":             ep,
		"incidentStateChanged": incidentStateChanged,
	})
}

// handleTestWebhook delivers a test webhook payload with SSRF protection and HMAC signature.
func (s *Server) handleTestWebhook(w http.ResponseWriter, r *http.Request) {
	tenantID, err := s.extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req TestWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.URL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "webhook URL is required"})
		return
	}

	// SSRF validation safeguard
	if _, err := ssrfguard.ValidateTargetURL(req.URL); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "SSRF Guard: Webhook destination blocked: " + err.Error(),
		})
		return
	}

	// Rate limit safeguard: max 2 webhook tests every 10 seconds per tenant
	if !s.webhookTestLimiter.allow(tenantID, 2, 10*time.Second) {
		w.Header().Set("Retry-After", "10")
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error":             "Rate limit: Please wait 10 seconds between webhook tests.",
			"retryAfterSeconds": 10,
		})
		return
	}

	secret := req.Secret
	if secret == "" {
		secret = "sec_live_" + tenantID
	}

	testPayload := models.WebhookPayload{
		Event:           "incident.test",
		TenantID:        tenantID,
		EndpointID:      "test-probe",
		EndpointURL:     "https://example.com/health",
		IncidentID:      "inc-test-" + generateRandomID(4),
		StartedAt:       time.Now().UTC(),
		ResolvedAt:      nil,
		DurationSeconds: 0,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()

	if err := webhook.Deliver(ctx, req.URL, secret, testPayload); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": "Webhook delivery failed: " + err.Error(),
		})
		return
	}

	bodyBytes, _ := json.Marshal(testPayload)
	signature := webhook.SignPayload(bodyBytes, secret)

	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"message":       "Test webhook delivered successfully",
		"event":         testPayload.Event,
		"signatureSent": signature,
	})
}

// isValidID validates that an identifier (tenantId or endpointId) is a safe alphanumeric string.
func isValidID(id string) bool {
	if len(id) == 0 || len(id) > 64 {
		return false
	}
	for _, c := range id {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func generateRandomID(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
