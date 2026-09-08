package apipublic

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"areweupyet/internal/accounting"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
)

type Server struct {
	store dynamo.Store
	mux   *http.ServeMux
}

// PublicEndpointSummary exposes safe public status without sensitive configuration.
type PublicEndpointSummary struct {
	EndpointID      string           `json:"endpointId"`
	Name            string           `json:"name"`
	Status          string           `json:"status"` // "UP" | "DOWN" | "PENDING"
	LastCheckedAt   time.Time        `json:"lastCheckedAt"`
	ActiveIncident  *models.Incident `json:"activeIncident,omitempty"`
}

// TenantPublicStatus aggregates whole-system health for a tenant.
type TenantPublicStatus struct {
	TenantID     string                  `json:"tenantId"`
	SystemStatus string                  `json:"systemStatus"` // "OPERATIONAL" | "DEGRADED" | "MAJOR_OUTAGE"
	Endpoints    []PublicEndpointSummary `json:"endpoints"`
	GeneratedAt  time.Time               `json:"generatedAt"`
}

// EndpointHistoryResponse provides latency, uptime metrics, and incident history for public inspection.
type EndpointHistoryResponse struct {
	EndpointID  string                     `json:"endpointId"`
	Uptime24h   accounting.UptimeStats     `json:"uptime24h"`
	Uptime7d    accounting.UptimeStats     `json:"uptime7d"`
	Uptime30d   accounting.UptimeStats     `json:"uptime30d"`
	Timeline    []accounting.TimelineEntry `json:"timeline"`
	RecentPings []models.PingResult        `json:"recentPings"`
}

// NewServer initializes public unauthenticated status server.
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
	s.mux.HandleFunc("GET /status/{tenantId}", s.handleGetTenantStatus)
	s.mux.HandleFunc("GET /status/{tenantId}/endpoints/{id}/history", s.handleGetEndpointHistory)
}

func (s *Server) handleGetTenantStatus(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("tenantId")
	if tenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "tenantId is required"})
		return
	}

	endpoints, err := s.store.ListEndpoints(r.Context(), tenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query endpoints"})
		return
	}

	systemStatus := "OPERATIONAL"
	downCount := 0

	var summaries []PublicEndpointSummary
	for _, ep := range endpoints {
		summary := PublicEndpointSummary{
			EndpointID:    ep.EndpointID,
			Name:          ep.Name,
			Status:        ep.Status,
			LastCheckedAt: ep.UpdatedAt,
		}

		if ep.Status == "DOWN" {
			downCount++
			inc, _ := s.store.GetOpenIncident(r.Context(), ep.EndpointID)
			summary.ActiveIncident = inc
		}

		summaries = append(summaries, summary)
	}

	if downCount > 0 {
		if downCount == len(endpoints) && len(endpoints) > 0 {
			systemStatus = "MAJOR_OUTAGE"
		} else {
			systemStatus = "DEGRADED"
		}
	}

	if summaries == nil {
		summaries = []PublicEndpointSummary{}
	}

	response := TenantPublicStatus{
		TenantID:     tenantID,
		SystemStatus: systemStatus,
		Endpoints:    summaries,
		GeneratedAt:  time.Now().UTC(),
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleGetEndpointHistory(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("tenantId")
	endpointID := r.PathValue("id")

	// Verify endpoint belongs to tenant
	ep, err := s.store.GetEndpoint(r.Context(), tenantID, endpointID)
	if err != nil {
		if errors.Is(err, dynamo.ErrEndpointNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query endpoint"})
		return
	}

	pings, _ := s.store.ListPingResults(r.Context(), ep.EndpointID, 30)
	if pings == nil {
		pings = []models.PingResult{}
	}

	incidents, _ := s.store.ListIncidents(r.Context(), ep.EndpointID)
	if incidents == nil {
		incidents = []models.Incident{}
	}

	now := time.Now().UTC()
	u24h := accounting.CalculateUptime(incidents, now.Add(-24*time.Hour), now)
	u7d := accounting.CalculateUptime(incidents, now.Add(-7*24*time.Hour), now)
	u30d := accounting.CalculateUptime(incidents, now.Add(-30*24*time.Hour), now)
	timeline := accounting.FormatTimeline(incidents)

	response := EndpointHistoryResponse{
		EndpointID:  endpointID,
		Uptime24h:   u24h,
		Uptime7d:    u7d,
		Uptime30d:   u30d,
		Timeline:    timeline,
		RecentPings: pings,
	}

	writeJSON(w, http.StatusOK, response)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
