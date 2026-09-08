package checker

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"areweupyet/internal/models"
	"areweupyet/internal/ssrfguard"
)

const UserAgent = "AreWeUpYet-Monitor/1.0 (+https://areweupyet.com/bot)"

// CheckOptions configures a ping execution.
type CheckOptions struct {
	URL            string
	TimeoutSec     int
	ExpectedStatus int
}

// CheckEndpoint performs an HTTP GET request with SSRF protection and latency measurement.
func CheckEndpoint(ctx context.Context, opts CheckOptions) models.PingResult {
	start := time.Now()

	timeout := time.Duration(opts.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	result := models.PingResult{
		CheckedAt: start.UTC(),
		TTL:       start.AddDate(0, 0, 90).Unix(), // 90 days DynamoDB TTL
	}

	// SSRF check
	if _, err := ssrfguard.ValidateTargetURL(opts.URL); err != nil {
		result.LatencyMs = time.Since(start).Milliseconds()
		result.Success = false
		result.ErrorMessage = fmt.Sprintf("SSRF validation failed: %v", err)
		return result
	}

	client := ssrfguard.SafeHTTPClient(timeout)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, opts.URL, nil)
	if err != nil {
		result.LatencyMs = time.Since(start).Milliseconds()
		result.Success = false
		result.ErrorMessage = fmt.Sprintf("failed to build request: %v", err)
		return result
	}

	req.Header.Set("User-Agent", UserAgent)

	resp, err := client.Do(req)
	result.LatencyMs = time.Since(start).Milliseconds()

	if err != nil {
		result.Success = false
		result.ErrorMessage = fmt.Sprintf("network error: %v", err)
		return result
	}
	defer resp.Body.Close()

	// Drain small body to allow connection reuse
	_, _ = io.CopyN(io.Discard, resp.Body, 4096)

	result.StatusCode = resp.StatusCode

	expected := opts.ExpectedStatus
	if expected <= 0 {
		// Default: any 2xx status is healthy
		result.Success = resp.StatusCode >= 200 && resp.StatusCode < 300
	} else {
		result.Success = resp.StatusCode == expected
	}

	if !result.Success {
		result.ErrorMessage = fmt.Sprintf("status %d does not match expected %d", resp.StatusCode, expected)
	}

	return result
}
