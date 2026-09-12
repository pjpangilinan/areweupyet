package apipublic

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"areweupyet/internal/accounting"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
)

type Server struct {
	store       dynamo.Store
	mux         *http.ServeMux
	rateLimiter *rateLimiter
}

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

func (rl *rateLimiter) allow(ip string, limit int, window time.Duration) bool {
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

	b, exists := rl.buckets[ip]
	if !exists || now.After(b.resetTime) {
		rl.buckets[ip] = &clientBucket{
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

func extractClientIP(r *http.Request) string {
	// 1. Prefer verified RemoteAddr set from Lambda SourceIP or direct TCP socket
	if r.RemoteAddr != "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil && host != "" {
			return host
		}
		return r.RemoteAddr
	}
	// 2. Fallback to first hop of X-Forwarded-For if behind a proxy
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		first := strings.TrimSpace(parts[0])
		if first != "" {
			return first
		}
	}
	return "unknown"
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

// PublicEndpointSummary exposes safe public status without sensitive configuration.
type PublicEndpointSummary struct {
	EndpointID     string           `json:"endpointId"`
	Name           string           `json:"name"`
	URL            string           `json:"url,omitempty"`
	Group          string           `json:"group,omitempty"`
	FrequencyMin   int              `json:"frequencyMin,omitempty"`
	Status         string           `json:"status"` // "UP" | "DOWN" | "PENDING"
	LastCheckedAt  time.Time        `json:"lastCheckedAt"`
	ActiveIncident *models.Incident `json:"activeIncident,omitempty"`
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
		store:       store,
		mux:         http.NewServeMux(),
		rateLimiter: newRateLimiter(),
	}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ip := extractClientIP(r)
	if !s.rateLimiter.allow(ip, 60, 1*time.Minute) {
		w.Header().Set("Retry-After", "60")
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": "Rate limit exceeded. Please wait before making more requests.",
		})
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /status/{tenantId}", s.handleGetTenantStatus)
	s.mux.HandleFunc("GET /status/{tenantId}/endpoints/{id}/history", s.handleGetEndpointHistory)
}

func (s *Server) handleGetTenantStatus(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("tenantId")
	if !isValidID(tenantID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid tenantId format"})
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
			URL:           ep.URL,
			Group:         ep.Group,
			FrequencyMin:  ep.FrequencyMin,
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
	if !isValidID(tenantID) || !isValidID(endpointID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid tenantId or endpointId format"})
		return
	}

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

	pings, _ := s.store.ListPingResults(r.Context(), ep.EndpointID, 5)
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
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
