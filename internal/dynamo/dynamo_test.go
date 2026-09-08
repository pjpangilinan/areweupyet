package dynamo

import (
	"context"
	"fmt"
	"testing"
	"time"

	"areweupyet/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMemoryStore_CRUDAndCascade(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	ep := models.Endpoint{
		TenantID:        "tenant-1",
		EndpointID:      "ep-1",
		Name:            "Production API",
		URL:             "https://example.com/health",
		FrequencyMin:    5,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     time.Now().Add(-1 * time.Minute),
		Status:          "PENDING",
	}

	// Create
	err := store.CreateEndpoint(ctx, ep)
	require.NoError(t, err)

	// Read
	read, err := store.GetEndpoint(ctx, "tenant-1", "ep-1")
	require.NoError(t, err)
	assert.Equal(t, "Production API", read.Name)

	// Record Ping
	err = store.RecordPingResult(ctx, models.PingResult{
		EndpointID: "ep-1",
		CheckedAt:  time.Now(),
		StatusCode: 200,
		Success:    true,
	})
	require.NoError(t, err)

	// Record Incident
	now := time.Now()
	err = store.SaveIncident(ctx, models.Incident{
		EndpointID: "ep-1",
		StartedAt:  now,
		Reason:     "500 Internal Server Error",
		TenantID:   "tenant-1",
	})
	require.NoError(t, err)

	// Verify before delete
	pings, err := store.ListPingResults(ctx, "ep-1", 10)
	require.NoError(t, err)
	assert.Len(t, pings, 1)

	incs, err := store.ListIncidents(ctx, "ep-1")
	require.NoError(t, err)
	assert.Len(t, incs, 1)

	// Cascade Delete
	err = store.DeleteEndpointCascade(ctx, "tenant-1", "ep-1")
	require.NoError(t, err)

	// Verify cascade
	_, err = store.GetEndpoint(ctx, "tenant-1", "ep-1")
	assert.ErrorIs(t, err, ErrEndpointNotFound)

	pingsAfter, _ := store.ListPingResults(ctx, "ep-1", 10)
	assert.Empty(t, pingsAfter)

	incsAfter, _ := store.ListIncidents(ctx, "ep-1")
	assert.Empty(t, incsAfter)
}

func TestMemoryStore_TenantCap(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	// Fill up to 20 endpoints
	for i := 0; i < 20; i++ {
		err := store.CreateEndpoint(ctx, models.Endpoint{
			TenantID:   "tenant-cap",
			EndpointID: fmt.Sprintf("ep-%d", i),
		})
		require.NoError(t, err)
	}

	// 21st must fail
	err := store.CreateEndpoint(ctx, models.Endpoint{
		TenantID:   "tenant-cap",
		EndpointID: "ep-21",
	})
	assert.ErrorIs(t, err, ErrTenantLimit)
}

func TestMemoryStore_ClaimDueEndpoints(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	past := time.Now().Add(-10 * time.Minute)
	future := time.Now().Add(10 * time.Minute)

	// Due
	_ = store.CreateEndpoint(ctx, models.Endpoint{
		TenantID:     "t1",
		EndpointID:   "ep-due",
		StatusBucket: "ACTIVE",
		FrequencyMin: 5,
		NextCheckAt:  past,
	})

	// Not due
	_ = store.CreateEndpoint(ctx, models.Endpoint{
		TenantID:     "t1",
		EndpointID:   "ep-not-due",
		StatusBucket: "ACTIVE",
		FrequencyMin: 5,
		NextCheckAt:  future,
	})

	due, err := store.ClaimDueEndpoints(ctx, time.Now(), 10)
	require.NoError(t, err)
	assert.Len(t, due, 1)
	assert.Equal(t, "ep-due", due[0].EndpointID)

	// Second immediate claim should return 0 (overlap protection)
	dueSecond, err := store.ClaimDueEndpoints(ctx, time.Now(), 10)
	require.NoError(t, err)
	assert.Empty(t, dueSecond)
}
