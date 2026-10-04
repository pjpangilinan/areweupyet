package dynamo

import (
	"context"
	"fmt"
	"testing"
	"time"

	"areweupyet/internal/models"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMemoryStore_CRUDAndCascade(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	ep := models.Endpoint{
		TenantID:     "tenant-1",
		EndpointID:   "ep-1",
		Name:         "Production API",
		URL:          "https://example.com/health",
		FrequencyMin: 5,
		StatusBucket: "ACTIVE",
		NextCheckAt:  time.Now().Add(-1 * time.Minute),
		Status:       "PENDING",
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

func TestDynamo_AttributeValueSerialization(t *testing.T) {
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	ep := models.Endpoint{
		TenantID:        "test-tenant",
		EndpointID:      "test-ep",
		Name:            "Gateway",
		URL:             "https://example.com",
		FrequencyMin:    5,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     now,
		ConsecutiveFail: 0,
		Status:          "UP",
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	av, err := attributevalue.MarshalMap(ep)
	require.NoError(t, err)
	assert.NotNil(t, av["tenantId"])
	assert.NotNil(t, av["endpointId"])
	assert.NotNil(t, av["statusBucket"])
	assert.NotNil(t, av["nextCheckAt"])

	// Verify unmarshaling round-trip
	var unmarshaled models.Endpoint
	err = attributevalue.UnmarshalMap(av, &unmarshaled)
	require.NoError(t, err)
	assert.Equal(t, ep.EndpointID, unmarshaled.EndpointID)
	assert.True(t, ep.NextCheckAt.Equal(unmarshaled.NextCheckAt))

	// Verify PingResult serialization with numeric TTL
	ttlVal := now.Add(90 * 24 * time.Hour).Unix()
	ping := models.PingResult{
		EndpointID: "test-ep",
		CheckedAt:  now,
		StatusCode: 200,
		LatencyMs:  45,
		Success:    true,
		TTL:        ttlVal,
	}
	pingAv, err := attributevalue.MarshalMap(ping)
	require.NoError(t, err)
	assert.NotNil(t, pingAv["ttl"])

	var unmarshaledPing models.PingResult
	err = attributevalue.UnmarshalMap(pingAv, &unmarshaledPing)
	require.NoError(t, err)
	assert.Equal(t, ttlVal, unmarshaledPing.TTL)
}

func TestMemoryStore_UpdateEndpointStatusAndSettings(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	// 1. Settings CRUD
	settings, err := store.GetTenantSettings(ctx, "tenant-settings")
	require.NoError(t, err)
	assert.Nil(t, settings)

	s := models.TenantSettings{
		TenantID:      "tenant-settings",
		WebhookURL:    "https://example.com/alerts",
		WebhookSecret: "test-secret-123",
	}
	err = store.SaveTenantSettings(ctx, s)
	require.NoError(t, err)

	gotSettings, err := store.GetTenantSettings(ctx, "tenant-settings")
	require.NoError(t, err)
	require.NotNil(t, gotSettings)
	assert.Equal(t, "https://example.com/alerts", gotSettings.WebhookURL)
	assert.Equal(t, "test-secret-123", gotSettings.WebhookSecret)

	// Ensure _settings is not listed as an endpoint
	endpoints, err := store.ListEndpoints(ctx, "tenant-settings")
	require.NoError(t, err)
	assert.Empty(t, endpoints)

	// 2. UpdateEndpointStatus atomic check
	now := time.Now()
	ep := models.Endpoint{
		TenantID:        "tenant-settings",
		EndpointID:      "ep-status",
		Name:            "Original Name",
		URL:             "https://original.com",
		FrequencyMin:    5,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     now,
		Status:          "PENDING",
		ConsecutiveFail: 0,
	}
	require.NoError(t, store.CreateEndpoint(ctx, ep))

	next := now.Add(5 * time.Minute)
	err = store.UpdateEndpointStatus(ctx, "tenant-settings", "ep-status", "UP", 0, next, now, &now, "incident.resolved")
	require.NoError(t, err)

	updated, err := store.GetEndpoint(ctx, "tenant-settings", "ep-status")
	require.NoError(t, err)
	assert.Equal(t, "UP", updated.Status)
	assert.Equal(t, 0, updated.ConsecutiveFail)
	assert.Equal(t, "Original Name", updated.Name) // preserved!
	assert.Equal(t, "https://original.com", updated.URL) // preserved!
	assert.Equal(t, "incident.resolved", updated.LastNotifiedEvent)
	require.NotNil(t, updated.LastNotifiedAt)
}
