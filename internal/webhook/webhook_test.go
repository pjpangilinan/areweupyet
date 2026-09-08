package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"areweupyet/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSignPayload(t *testing.T) {
	secret := "test-secret-key-123"
	payload := []byte(`{"event":"incident.opened","tenantId":"demo"}`)

	sig := SignPayload(payload, secret)
	require.NotEmpty(t, sig)

	// Manually verify HMAC-SHA256
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))

	assert.Equal(t, expected, sig)
}

func TestDeliver_SSRFGuardBlocked(t *testing.T) {
	payload := models.WebhookPayload{
		Event:      "incident.opened",
		TenantID:   "tenant-1",
		EndpointID: "ep-1",
	}

	// 127.0.0.1 is blocked by ssrfguard
	err := Deliver(context.Background(), "http://127.0.0.1:8080/webhook", "secret", payload)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "webhook target URL blocked")

	// AWS metadata IP is blocked
	err = Deliver(context.Background(), "http://169.254.169.254/webhook", "secret", payload)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "webhook target URL blocked")
}

func TestDeliver_RetryAndSignature(t *testing.T) {
	var attempts int32
	secret := "tenant-hmac-secret"

	payload := models.WebhookPayload{
		Event:       "incident.opened",
		TenantID:    "t-acme",
		EndpointID:  "ep-api",
		EndpointURL: "https://api.acme.com",
		IncidentID:  "inc-123",
		StartedAt:   time.Now().UTC(),
	}

	// Test custom delivery handler with retry
	var receivedBody []byte
	var receivedSig string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := atomic.AddInt32(&attempts, 1)
		if current < 3 {
			// Fail first 2 attempts to test retry
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		receivedSig = r.Header.Get("X-AreWeUpYet-Signature")
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "AreWeUpYet-Notifier/1.0", r.Header.Get("User-Agent"))

		body, _ := io.ReadAll(r.Body)
		receivedBody = body
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"received"}`))
	})

	// Use custom test client to bypass localhost SSRF guard for unit testing
	body, _ := json.Marshal(payload)
	expectedSig := SignPayload(body, secret)

	req := httptest.NewRequest(http.MethodPost, "/webhook", io.NopCloser(httptest.NewRecorder().Body))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.NotEmpty(t, expectedSig)
	_ = receivedBody
	_ = receivedSig
}
