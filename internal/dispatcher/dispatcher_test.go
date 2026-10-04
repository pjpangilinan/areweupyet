package dispatcher

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type MockNotifier struct {
	mu       sync.Mutex
	payloads []models.WebhookPayload
}

func (m *MockNotifier) Notify(_ context.Context, webhookURL, secret string, payload models.WebhookPayload) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.payloads = append(m.payloads, payload)
	return nil
}

func (m *MockNotifier) GetPayloads() []models.WebhookPayload {
	m.mu.Lock()
	defer m.mu.Unlock()
	copied := make([]models.WebhookPayload, len(m.payloads))
	copy(copied, m.payloads)
	return copied
}

func TestDispatcher_IncidentDetectionLifecycle(t *testing.T) {
	ctx := context.Background()
	store := dynamo.NewMemoryStore()
	notifier := &MockNotifier{}

	// Seed tenant webhook settings
	require.NoError(t, store.SaveTenantSettings(ctx, models.TenantSettings{
		TenantID:   "t1",
		WebhookURL: "https://example.com/webhook",
	}))

	d := New(store, notifier, Config{
		WorkerPoolSize:       5,
		NotificationCooldown: 1 * time.Minute,
	})

	now := time.Now()

	// Seed endpoint (uses invalid IP 127.0.0.1 so ssrfguard fails ping intentionally)
	ep := models.Endpoint{
		TenantID:        "t1",
		EndpointID:      "ep-fail",
		Name:            "Failing Service",
		URL:             "http://127.0.0.1/health",
		FrequencyMin:    5,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     now.Add(-1 * time.Minute),
		Status:          "UP",
		ConsecutiveFail: 0,
	}
	require.NoError(t, store.CreateEndpoint(ctx, ep))

	// Cycle 1: 1st failure -> status stays UP, no incident opened yet
	count, err := d.RunOnce(ctx, now)
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	ep1, err := store.GetEndpoint(ctx, "t1", "ep-fail")
	require.NoError(t, err)
	assert.Equal(t, 1, ep1.ConsecutiveFail)
	assert.Equal(t, "UP", ep1.Status)
	assert.Empty(t, notifier.GetPayloads())

	// Fast forward nextCheckAt to simulate next 5m tick
	ep1.NextCheckAt = now.Add(-10 * time.Second)
	_ = store.UpdateEndpoint(ctx, *ep1)

	// Cycle 2: 2nd consecutive failure -> status becomes DOWN, incident opened!
	now2 := now.Add(5 * time.Minute)
	count2, err := d.RunOnce(ctx, now2)
	require.NoError(t, err)
	assert.Equal(t, 1, count2)

	ep2, err := store.GetEndpoint(ctx, "t1", "ep-fail")
	require.NoError(t, err)
	assert.Equal(t, 2, ep2.ConsecutiveFail)
	assert.Equal(t, "DOWN", ep2.Status)

	// Check incident was opened
	openInc, err := store.GetOpenIncident(ctx, "ep-fail")
	require.NoError(t, err)
	require.NotNil(t, openInc)
	assert.Nil(t, openInc.ResolvedAt)

	// Check notification was sent
	payloads := notifier.GetPayloads()
	require.Len(t, payloads, 1)
	assert.Equal(t, "incident.opened", payloads[0].Event)
	assert.Equal(t, "ep-fail", payloads[0].EndpointID)
}

func TestDispatcher_NotificationCooldown(t *testing.T) {
	d := New(dynamo.NewMemoryStore(), &MockNotifier{}, Config{
		NotificationCooldown: 5 * time.Minute,
	})

	now := time.Now()
	ep := models.Endpoint{EndpointID: "ep-1"}

	// First notification should succeed
	assert.True(t, d.shouldNotify(ep, "incident.opened", now))

	// Second notification within cooldown should be suppressed
	assert.False(t, d.shouldNotify(ep, "incident.opened", now.Add(2*time.Minute)))

	// After cooldown expires, notification should succeed
	assert.True(t, d.shouldNotify(ep, "incident.opened", now.Add(6*time.Minute)))

	// Persistent notification test: if ep.LastNotifiedAt is within cooldown, suppressed
	pastNotified := now.Add(1 * time.Minute)
	epWithState := models.Endpoint{
		EndpointID:        "ep-persisted",
		LastNotifiedAt:    &pastNotified,
		LastNotifiedEvent: "incident.opened",
	}
	assert.False(t, d.shouldNotify(epWithState, "incident.opened", now.Add(2*time.Minute)))
	assert.True(t, d.shouldNotify(epWithState, "incident.opened", now.Add(7*time.Minute)))
}

func TestDispatcher_SyntheticLoad50Endpoints(t *testing.T) {
	ctx := context.Background()
	store := dynamo.NewMemoryStore()
	notifier := &MockNotifier{}

	d := New(store, notifier, Config{
		WorkerPoolSize: 20,
	})

	now := time.Now()

	// Seed 50 endpoints across multiple tenants
	for i := 0; i < 50; i++ {
		tenantID := fmt.Sprintf("tenant-%d", i/10)
		ep := models.Endpoint{
			TenantID:     tenantID,
			EndpointID:   fmt.Sprintf("ep-%d", i),
			Name:         fmt.Sprintf("Service %d", i),
			URL:          "http://127.0.0.1/test", // Instant SSRF block
			FrequencyMin: 5,
			StatusBucket: "ACTIVE",
			NextCheckAt:  now.Add(-1 * time.Minute),
			Status:       "UP",
		}
		_ = store.CreateEndpoint(ctx, ep)
	}

	start := time.Now()
	count, err := d.RunOnce(ctx, now)
	duration := time.Since(start)

	require.NoError(t, err)
	assert.Equal(t, 50, count)
	// Must finish all 50 endpoints well within 1 second!
	assert.Less(t, duration, 2*time.Second, "50 endpoints took %v", duration)
}

type FailingStore struct {
	dynamo.Store
	claimErr  error
	updateErr error
}

func (f *FailingStore) ClaimDueEndpoints(ctx context.Context, dueBefore time.Time, limit int) ([]models.Endpoint, error) {
	if f.claimErr != nil {
		return nil, f.claimErr
	}
	return f.Store.ClaimDueEndpoints(ctx, dueBefore, limit)
}

func (f *FailingStore) UpdateEndpointStatus(ctx context.Context, tenantID, endpointID, status string, consecutiveFail int, nextCheckAt, updatedAt time.Time, lastNotifiedAt *time.Time, lastNotifiedEvent string) error {
	if f.updateErr != nil {
		return f.updateErr
	}
	return f.Store.UpdateEndpointStatus(ctx, tenantID, endpointID, status, consecutiveFail, nextCheckAt, updatedAt, lastNotifiedAt, lastNotifiedEvent)
}

func TestDispatcher_StoreErrorResilience(t *testing.T) {
	ctx := context.Background()
	mem := dynamo.NewMemoryStore()
	failingStore := &FailingStore{
		Store:    mem,
		claimErr: errors.New("dynamodb throughput exceeded"),
	}

	d := New(failingStore, &MockNotifier{}, Config{WorkerPoolSize: 2})
	count, err := d.RunOnce(ctx, time.Now())
	assert.Error(t, err)
	assert.Equal(t, 0, count)

	// Test update error handling during worker execution
	failingStore.claimErr = nil
	failingStore.updateErr = errors.New("conditional write failed: concurrent update")
	_ = mem.CreateEndpoint(ctx, models.Endpoint{
		TenantID:     "t-fail",
		EndpointID:   "ep-fail",
		NextCheckAt:  time.Now().Add(-1 * time.Minute),
		StatusBucket: "ACTIVE",
		FrequencyMin: 5,
	})

	// Does not panic or crash
	count, err = d.RunOnce(ctx, time.Now())
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

