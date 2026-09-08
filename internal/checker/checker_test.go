package checker

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCheckEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, UserAgent, r.Header.Get("User-Agent"))
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	// Direct loopback IP is blocked by ssrfguard
	res := CheckEndpoint(context.Background(), CheckOptions{
		URL:        server.URL,
		TimeoutSec: 2,
	})
	// Should fail SSRF guard because server.URL uses 127.0.0.1
	assert.False(t, res.Success)
	assert.Contains(t, res.ErrorMessage, "SSRF validation failed")
}
