package apipublic

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicAPI_TenantStatusAggregation(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)
	tenant := "acme-corp"

	// 1. Initial empty state -> OPERATIONAL
	req := httptest.NewRequest(http.MethodGet, "/status/"+tenant, nil)
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var res TenantPublicStatus
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	assert.Equal(t, "OPERATIONAL", res.SystemStatus)
	assert.Empty(t, res.Endpoints)

	// 2. Add 1 healthy endpoint
	_ = store.CreateEndpoint(context.Background(), models.Endpoint{
		TenantID:   tenant,
		EndpointID: "ep-up",
		Name:       "Website",
		Status:     "UP",
	})
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	assert.Equal(t, "OPERATIONAL", res.SystemStatus)
	assert.Len(t, res.Endpoints, 1)

	// 3. Add 1 DOWN endpoint -> DEGRADED
	now := time.Now()
	_ = store.CreateEndpoint(context.Background(), models.Endpoint{
		TenantID:   tenant,
		EndpointID: "ep-down",
		Name:       "Payment Gateway",
		Status:     "DOWN",
	})
	_ = store.SaveIncident(context.Background(), models.Incident{
		EndpointID: "ep-down",
		TenantID:   tenant,
		StartedAt:  now.Add(-1 * time.Hour),
		Reason:     "503 Service Unavailable",
	})

	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	assert.Equal(t, "DEGRADED", res.SystemStatus)
	assert.Len(t, res.Endpoints, 2)

	// 4. Query history for ep-down
	reqHist := httptest.NewRequest(http.MethodGet, "/status/"+tenant+"/endpoints/ep-down/history", nil)
	wHist := httptest.NewRecorder()
	server.ServeHTTP(wHist, reqHist)
	assert.Equal(t, http.StatusOK, wHist.Code)

	var hist EndpointHistoryResponse
	require.NoError(t, json.Unmarshal(wHist.Body.Bytes(), &hist))
	assert.Equal(t, "ep-down", hist.EndpointID)
	assert.NotEmpty(t, hist.Timeline)
	assert.Equal(t, "503 Service Unavailable", hist.Timeline[0].Reason)
	assert.True(t, hist.Timeline[0].IsOpen)
	assert.Less(t, hist.Uptime24h.UptimePercentage, 100.0)
}

func TestPublicAPI_LambdaAdapter(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)

	lambdaReq := events.LambdaFunctionURLRequest{
		RequestContext: events.LambdaFunctionURLRequestContext{
			HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
				Method: "GET",
				Path:   "/status/demo",
			},
		},
	}

	res, err := HandleLambdaRequest(context.Background(), server, lambdaReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, "*", res.Headers["Access-Control-Allow-Origin"])
}
