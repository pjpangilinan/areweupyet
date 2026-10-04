package checker

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newMockHTTPClient(fn roundTripFunc) *http.Client {
	return &http.Client{
		Transport: fn,
	}
}

func TestCheckEndpoint_SSRFBlocked(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Direct loopback IP is blocked by ssrfguard
	res := CheckEndpoint(context.Background(), CheckOptions{
		URL:        server.URL,
		TimeoutSec: 2,
	})
	assert.False(t, res.Success)
	assert.Contains(t, res.ErrorMessage, "SSRF validation failed")
}

func TestCheckEndpoint_MockClientSuccess(t *testing.T) {
	mockClient := newMockHTTPClient(func(req *http.Request) (*http.Response, error) {
		assert.Equal(t, UserAgent, req.Header.Get("User-Agent"))
		assert.Equal(t, "https://1.1.1.1/health", req.URL.String())
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewBufferString("healthy")),
			Header:     make(http.Header),
		}, nil
	})

	res := CheckEndpointWithClient(context.Background(), CheckOptions{
		URL:            "https://1.1.1.1/health",
		TimeoutSec:     5,
		ExpectedStatus: 200,
	}, mockClient)

	assert.True(t, res.Success)
	assert.Equal(t, 200, res.StatusCode)
	assert.Empty(t, res.ErrorMessage)
	assert.NotZero(t, res.CheckedAt)
	assert.NotZero(t, res.TTL)
}

func TestCheckEndpoint_MockClientStatusMismatch(t *testing.T) {
	mockClient := newMockHTTPClient(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusServiceUnavailable,
			Body:       io.NopCloser(bytes.NewBufferString("degraded")),
			Header:     make(http.Header),
		}, nil
	})

	res := CheckEndpointWithClient(context.Background(), CheckOptions{
		URL:            "https://1.1.1.1/health",
		TimeoutSec:     5,
		ExpectedStatus: 200,
	}, mockClient)

	assert.False(t, res.Success)
	assert.Equal(t, 503, res.StatusCode)
	assert.Equal(t, "status 503 does not match expected 200", res.ErrorMessage)
}

func TestCheckEndpoint_MockClientNetworkError(t *testing.T) {
	mockClient := newMockHTTPClient(func(req *http.Request) (*http.Response, error) {
		return nil, errors.New("connection reset by peer")
	})

	res := CheckEndpointWithClient(context.Background(), CheckOptions{
		URL:        "https://1.1.1.1/health",
		TimeoutSec: 5,
	}, mockClient)

	assert.False(t, res.Success)
	assert.Equal(t, 0, res.StatusCode)
	assert.Contains(t, res.ErrorMessage, "network error")
	assert.Contains(t, res.ErrorMessage, "connection reset by peer")
}
