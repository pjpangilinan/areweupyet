package apiprivate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"areweupyet/internal/checker"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
	"areweupyet/internal/ssrfguard"
	"areweupyet/internal/webhook"
)

type Server struct {
	store dynamo.Store
	mux   *http.ServeMux
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
	s := &Server{
		store: store,
		mux:   http.NewServeMux(),
	}
	s.routes()
	return s
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

// extractTenantID retrieves the authenticated tenant ID from context, headers, or Bearer JWT.
func extractTenantID(r *http.Request) (string, error) {
	// 1. From context (set by Lambda authorizer adapter)
	if tenantID, ok := r.Context().Value("tenantId").(string); ok && tenantID != "" {
		return tenantID, nil
	}
	// 2. From header (for testing/local development)
	if tenantID := r.Header.Get("X-Tenant-ID"); tenantID != "" {
		return tenantID, nil
	}
	// 3. From Authorization: Bearer <token>
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		token := strings.TrimSpace(authHeader[7:])
		if sub := extractSubFromJWT(token); sub != "" {
			return sub, nil
		}
	}
	// 4. Default to "demo" so local development and unauthenticated test runs work seamlessly
	return "demo", nil
}

func (s *Server) handleListEndpoints(w http.ResponseWriter, r *http.Request) {
	tenantID, err := extractTenantID(r)
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
	tenantID, err := extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

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

	// 1. SSRF and URL validation
	if _, err := ssrfguard.ValidateTargetURL(req.URL); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid endpoint URL: %v", err)})
		return
	}

	// 2. Enforce frequency floor (5 minutes)
	if req.FrequencyMin < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "check frequency floor is 5 minutes"})
		return
	}

	if req.TimeoutSec <= 0 {
		req.TimeoutSec = 10
	}
	if req.ExpectedStatus <= 0 {
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
	tenantID, err := extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
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
	tenantID, err := extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
	existing, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID)
	if err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch endpoint"})
		return
	}

	var req UpdateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.Name != "" {
		existing.Name = strings.TrimSpace(req.Name)
	}
	if req.URL != "" {
		if _, err := ssrfguard.ValidateTargetURL(req.URL); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid URL: %v", err)})
			return
		}
		existing.URL = req.URL
	}
	if req.FrequencyMin > 0 {
		if req.FrequencyMin < 5 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "check frequency floor is 5 minutes"})
			return
		}
		existing.FrequencyMin = req.FrequencyMin
	}
	if req.TimeoutSec > 0 {
		existing.TimeoutSec = req.TimeoutSec
	}
	if req.ExpectedStatus > 0 {
		existing.ExpectedStatus = req.ExpectedStatus
	}
	if req.Group != "" {
		existing.Group = strings.TrimSpace(req.Group)
	}
	existing.UpdatedAt = time.Now().UTC()

	if err := s.store.UpdateEndpoint(r.Context(), *existing); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update endpoint"})
		return
	}

	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	tenantID, err := extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
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
	tenantID, err := extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	endpointID := r.PathValue("id")
	ep, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID)
	if err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query endpoint"})
		return
	}

	// Rate-limit safeguard: check timestamp of most recent ping
	pings, _ := s.store.ListPingResults(r.Context(), endpointID, 1)
	if len(pings) > 0 {
		elapsed := time.Since(pings[0].CheckedAt)
		if elapsed < 30*time.Second {
			retryAfter := int((30 * time.Second - elapsed).Seconds()) + 1
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
	tenantID, err := extractTenantID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

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

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func generateRandomID(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
