package apiprivate

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
	"areweupyet/internal/ssrfguard"
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
