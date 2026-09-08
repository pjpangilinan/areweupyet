package dynamo

import (
	"context"
	"errors"
	"sync"
	"time"

	"areweupyet/internal/models"
)

var (
	ErrEndpointNotFound = errors.New("endpoint not found")
	ErrOptimisticLock   = errors.New("conditional check failed: endpoint was already modified")
	ErrTenantLimit      = errors.New("per-tenant endpoint limit reached")
)

// Store defines repository access for AreWeUpYet multi-tenant data.
type Store interface {
	CreateEndpoint(ctx context.Context, ep models.Endpoint) error
	GetEndpoint(ctx context.Context, tenantID, endpointID string) (*models.Endpoint, error)
	ListEndpoints(ctx context.Context, tenantID string) ([]models.Endpoint, error)
	UpdateEndpoint(ctx context.Context, ep models.Endpoint) error
	DeleteEndpointCascade(ctx context.Context, tenantID, endpointID string) error
	ClaimDueEndpoints(ctx context.Context, now time.Time, limit int) ([]models.Endpoint, error)
	RecordPingResult(ctx context.Context, res models.PingResult) error
	ListPingResults(ctx context.Context, endpointID string, limit int) ([]models.PingResult, error)
	SaveIncident(ctx context.Context, inc models.Incident) error
	GetOpenIncident(ctx context.Context, endpointID string) (*models.Incident, error)
	ListIncidents(ctx context.Context, endpointID string) ([]models.Incident, error)
}

// MemoryStore provides a zero-docker, 100% local in-memory store for continuous local testing.
type MemoryStore struct {
	mu          sync.RWMutex
	endpoints   map[string]models.Endpoint    // key: tenantID#endpointID
	pingResults map[string][]models.PingResult // key: endpointID
	incidents   map[string][]models.Incident  // key: endpointID
}

// NewMemoryStore initializes a fresh in-memory mock store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		endpoints:   make(map[string]models.Endpoint),
		pingResults: make(map[string][]models.PingResult),
		incidents:   make(map[string][]models.Incident),
	}
}

func (m *MemoryStore) CreateEndpoint(_ context.Context, ep models.Endpoint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Enforce 20 endpoint cap per tenant
	count := 0
	for _, existing := range m.endpoints {
		if existing.TenantID == ep.TenantID {
			count++
		}
	}
	if count >= 20 {
		return ErrTenantLimit
	}

	key := ep.TenantID + "#" + ep.EndpointID
	m.endpoints[key] = ep
	return nil
}

func (m *MemoryStore) GetEndpoint(_ context.Context, tenantID, endpointID string) (*models.Endpoint, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := tenantID + "#" + endpointID
	ep, ok := m.endpoints[key]
	if !ok {
		return nil, ErrEndpointNotFound
	}
	return &ep, nil
}

func (m *MemoryStore) ListEndpoints(_ context.Context, tenantID string) ([]models.Endpoint, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var list []models.Endpoint
	for _, ep := range m.endpoints {
		if ep.TenantID == tenantID {
			list = append(list, ep)
		}
	}
	return list, nil
}

func (m *MemoryStore) UpdateEndpoint(_ context.Context, ep models.Endpoint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := ep.TenantID + "#" + ep.EndpointID
	if _, ok := m.endpoints[key]; !ok {
		return ErrEndpointNotFound
	}
	m.endpoints[key] = ep
	return nil
}

// DeleteEndpointCascade deletes endpoint and cascades deletion to PingResults and Incidents.
func (m *MemoryStore) DeleteEndpointCascade(_ context.Context, tenantID, endpointID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := tenantID + "#" + endpointID
	delete(m.endpoints, key)
	delete(m.pingResults, endpointID)
	delete(m.incidents, endpointID)
	return nil
}

// ClaimDueEndpoints simulates DueCheck GSI query (statusBucket="ACTIVE" AND nextCheckAt <= now)
// and applies conditional update to prevent double-processing.
func (m *MemoryStore) ClaimDueEndpoints(_ context.Context, now time.Time, limit int) ([]models.Endpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var due []models.Endpoint
	for k, ep := range m.endpoints {
		if ep.StatusBucket == "ACTIVE" && !ep.NextCheckAt.After(now) {
			due = append(due, ep)
			// Advance nextCheckAt temporarily to claim it (conditional claim)
			ep.NextCheckAt = now.Add(time.Duration(ep.FrequencyMin) * time.Minute)
			m.endpoints[k] = ep

			if limit > 0 && len(due) >= limit {
				break
			}
		}
	}
	return due, nil
}

func (m *MemoryStore) RecordPingResult(_ context.Context, res models.PingResult) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.pingResults[res.EndpointID] = append(m.pingResults[res.EndpointID], res)
	return nil
}

func (m *MemoryStore) ListPingResults(_ context.Context, endpointID string, limit int) ([]models.PingResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	res := m.pingResults[endpointID]
	if limit > 0 && len(res) > limit {
		res = res[len(res)-limit:]
	}
	return res, nil
}

func (m *MemoryStore) SaveIncident(_ context.Context, inc models.Incident) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	list := m.incidents[inc.EndpointID]
	found := false
	for i, existing := range list {
		if existing.StartedAt.Equal(inc.StartedAt) {
			list[i] = inc
			found = true
			break
		}
	}
	if !found {
		list = append(list, inc)
	}
	m.incidents[inc.EndpointID] = list
	return nil
}

func (m *MemoryStore) GetOpenIncident(_ context.Context, endpointID string) (*models.Incident, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, inc := range m.incidents[endpointID] {
		if inc.ResolvedAt == nil {
			return &inc, nil
		}
	}
	return nil, nil
}

func (m *MemoryStore) ListIncidents(_ context.Context, endpointID string) ([]models.Incident, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.incidents[endpointID], nil
}
