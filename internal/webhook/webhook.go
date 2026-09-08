package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"areweupyet/internal/models"
	"areweupyet/internal/ssrfguard"
)

// SignPayload computes HMAC-SHA256 signature of body using secret.
func SignPayload(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// Deliver sends a signed webhook payload with exponential retry and SSRF checking.
func Deliver(ctx context.Context, targetURL string, secret string, payload models.WebhookPayload) error {
	if _, err := ssrfguard.ValidateTargetURL(targetURL); err != nil {
		return fmt.Errorf("webhook target URL blocked: %w", err)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	signature := SignPayload(body, secret)
	backoffs := []time.Duration{1 * time.Second, 5 * time.Second, 25 * time.Second}
	client := ssrfguard.SafeHTTPClient(10 * time.Second)

	for attempt, delay := range backoffs {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-AreWeUpYet-Signature", signature)
		req.Header.Set("User-Agent", "AreWeUpYet-Notifier/1.0")

		resp, err := client.Do(req)
		if err == nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			resp.Body.Close()
			return nil
		}

		if resp != nil {
			resp.Body.Close()
		}

		slog.Warn("webhook delivery attempt failed",
			"target", targetURL,
			"attempt", attempt+1,
			"error", err,
		)

		if attempt < len(backoffs)-1 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}
	}

	return fmt.Errorf("failed to deliver webhook after %d attempts", len(backoffs))
}
