package apiprivate

import (
	"bytes"
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

func TestPrivateAPI_CRUDAndGuards(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)

	tenantA := "tenant-alpha"
	tenantB := "tenant-beta"

	// 1. Create with frequency < 5 min -> Rejection
	badFreqBody, _ := json.Marshal(CreateEndpointRequest{
		Name:         "Too Fast",
		URL:          "https://example.com/fast",
		FrequencyMin: 1, // Below 5 min floor
	})
	req := httptest.NewRequest(http.MethodPost, "/endpoints", bytes.NewReader(badFreqBody))
	req.Header.Set("X-Tenant-ID", tenantA)
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "frequency floor is 5 minutes")

	// 2. Create with SSRF URL -> Rejection
	ssrfBody, _ := json.Marshal(CreateEndpointRequest{
		Name:         "Metadata Attack",
		URL:          "http://169.254.169.254/latest/meta-data",
		FrequencyMin: 5,
	})
	req = httptest.NewRequest(http.MethodPost, "/endpoints", bytes.NewReader(ssrfBody))
	req.Header.Set("X-Tenant-ID", tenantA)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "invalid endpoint URL")

	// 3. Create Valid Endpoint -> 201 Created
	validBody, _ := json.Marshal(CreateEndpointRequest{
		Name:         "Main API Gateway",
		URL:          "https://example.com/health",
		FrequencyMin: 5,
	})
	req = httptest.NewRequest(http.MethodPost, "/endpoints", bytes.NewReader(validBody))
	req.Header.Set("X-Tenant-ID", tenantA)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	var created models.Endpoint
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	assert.Equal(t, "Main API Gateway", created.Name)
	assert.Equal(t, tenantA, created.TenantID)
	assert.NotEmpty(t, created.EndpointID)

	// 4. List Endpoints for Tenant A -> 1 item
	req = httptest.NewRequest(http.MethodGet, "/endpoints", nil)
	req.Header.Set("X-Tenant-ID", tenantA)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var listA []models.Endpoint
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &listA))
	assert.Len(t, listA, 1)

	// 5. Tenant Isolation: Tenant B lists -> 0 items
	req = httptest.NewRequest(http.MethodGet, "/endpoints", nil)
	req.Header.Set("X-Tenant-ID", tenantB)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var listB []models.Endpoint
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &listB))
	assert.Empty(t, listB)

	// Tenant B tries to get Tenant A's endpoint -> 404 Not Found
	req = httptest.NewRequest(http.MethodGet, "/endpoints/"+created.EndpointID, nil)
	req.Header.Set("X-Tenant-ID", tenantB)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)

	// 6. Update Endpoint
	updateBody, _ := json.Marshal(UpdateEndpointRequest{
		Name:         "Renamed Gateway",
		FrequencyMin: 10,
	})
	req = httptest.NewRequest(http.MethodPut, "/endpoints/"+created.EndpointID, bytes.NewReader(updateBody))
	req.Header.Set("X-Tenant-ID", tenantA)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var updated models.Endpoint
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &updated))
	assert.Equal(t, "Renamed Gateway", updated.Name)
	assert.Equal(t, 10, updated.FrequencyMin)

	// 7. Delete Endpoint -> 200 OK
	req = httptest.NewRequest(http.MethodDelete, "/endpoints/"+created.EndpointID, nil)
	req.Header.Set("X-Tenant-ID", tenantA)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify deleted
	req = httptest.NewRequest(http.MethodGet, "/endpoints/"+created.EndpointID, nil)
	req.Header.Set("X-Tenant-ID", tenantA)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestPrivateAPI_TenantCapEnforcement(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)
	tenant := "cap-tenant"

	// Seed 20 endpoints
	for i := 0; i < 20; i++ {
		body, _ := json.Marshal(CreateEndpointRequest{
			Name:         "Service",
			URL:          "https://example.com/test",
			FrequencyMin: 5,
		})
		req := httptest.NewRequest(http.MethodPost, "/endpoints", bytes.NewReader(body))
		req.Header.Set("X-Tenant-ID", tenant)
		w := httptest.NewRecorder()
		server.ServeHTTP(w, req)
		require.Equal(t, http.StatusCreated, w.Code)
	}

	// 21st attempt must return 403 Forbidden
	body, _ := json.Marshal(CreateEndpointRequest{
		Name:         "Over Limit",
		URL:          "https://example.com/test",
		FrequencyMin: 5,
	})
	req := httptest.NewRequest(http.MethodPost, "/endpoints", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", tenant)
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "endpoint limit of 20 reached")
}

func TestPrivateAPI_LambdaFunctionURLAdapter(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)

	// Test 1: With IAM Authorizer
	lambdaReq := events.LambdaFunctionURLRequest{
		RequestContext: events.LambdaFunctionURLRequestContext{
			HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
				Method: "GET",
				Path:   "/endpoints",
			},
			Authorizer: &events.LambdaFunctionURLRequestContextAuthorizerDescription{
				IAM: &events.LambdaFunctionURLRequestContextAuthorizerIAMDescription{
					CallerID: "cognito-iam-caller-123",
				},
			},
		},
	}

	res, err := HandleLambdaRequest(context.Background(), server, lambdaReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, "[]\n", res.Body)

	// Test 2: With Bearer Token (header.payload.signature)
	// payload: {"sub":"jwt-tenant-456"} in base64url is eyJzdWIiOiJqd3QtdGVuYW50LTQ1NiJ9
	fakeJWT := "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJqd3QtdGVuYW50LTQ1NiJ9.signature"
	jwtReq := events.LambdaFunctionURLRequest{
		RequestContext: events.LambdaFunctionURLRequestContext{
			HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
				Method: "GET",
				Path:   "/endpoints",
			},
		},
		Headers: map[string]string{
			"authorization": "Bearer " + fakeJWT,
		},
	}
	resJWT, err := HandleLambdaRequest(context.Background(), server, jwtReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resJWT.StatusCode)
	assert.Equal(t, "[]\n", resJWT.Body)
}

func TestPrivateAPI_ManualCheckAndRateLimit(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)
	tenant := "rate-tenant"

	// 1. Create a test endpoint
	ep := models.Endpoint{
		TenantID:        tenant,
		EndpointID:      "ep-rate-test",
		Name:            "Rate Test Probe",
		URL:             "https://example.com",
		FrequencyMin:    5,
		TimeoutSec:      5,
		ExpectedStatus:  200,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     time.Now().UTC(),
		Status:          "PENDING",
		ConsecutiveFail: 0,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	require.NoError(t, store.CreateEndpoint(context.Background(), ep))

	// 2. First check -> 200 OK
	req := httptest.NewRequest(http.MethodPost, "/endpoints/ep-rate-test/check", nil)
	req.Header.Set("X-Tenant-ID", tenant)
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "latencyMs")

	// 3. Immediate second check -> 429 Too Many Requests (Rate limit guard)
	req2 := httptest.NewRequest(http.MethodPost, "/endpoints/ep-rate-test/check", nil)
	req2.Header.Set("X-Tenant-ID", tenant)
	w2 := httptest.NewRecorder()
	server.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusTooManyRequests, w2.Code)
	assert.NotEmpty(t, w2.Header().Get("Retry-After"))
	assert.Contains(t, w2.Body.String(), "Rate limit guard")
}

func TestPrivateAPI_WebhookTestSSRFGuard(t *testing.T) {
	store := dynamo.NewMemoryStore()
	server := NewServer(store)
	tenant := "ssrf-tenant"

	// 1. Webhook pointing to cloud metadata -> 400 Bad Request
	body, _ := json.Marshal(TestWebhookRequest{
		URL: "http://169.254.169.254/latest/meta-data",
	})
	req := httptest.NewRequest(http.MethodPost, "/settings/webhook/test", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", tenant)
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "SSRF Guard")

	// 2. Webhook pointing to loopback -> 400 Bad Request
	bodyLoopback, _ := json.Marshal(TestWebhookRequest{
		URL: "http://127.0.0.1:9090/hook",
	})
	req2 := httptest.NewRequest(http.MethodPost, "/settings/webhook/test", bytes.NewReader(bodyLoopback))
	req2.Header.Set("X-Tenant-ID", tenant)
	w2 := httptest.NewRecorder()
	server.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusBadRequest, w2.Code)
	assert.Contains(t, w2.Body.String(), "SSRF Guard")
}

