package main

import (
	"context"
	"testing"
	"time"

	"areweupyet/internal/models"

	"github.com/stretchr/testify/assert"
)

func TestNotifierHandler_SSRFBlocked(t *testing.T) {
	req := NotificationRequest{
		WebhookURL: "http://169.254.169.254/latest/meta-data",
		Secret:     "secret-1234",
		Payload: models.WebhookPayload{
			Event:       "incident.opened",
			TenantID:    "t-1",
			EndpointID:  "ep-1",
			EndpointURL: "https://example.com",
			StartedAt:   time.Now().UTC(),
		},
	}

	err := Handler(context.Background(), req)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "blocked")
}

func TestNotifierHandler_InvalidURL(t *testing.T) {
	req := NotificationRequest{
		WebhookURL: "ftp://invalid-scheme.com",
		Secret:     "secret-1234",
		Payload: models.WebhookPayload{
			Event:    "incident.opened",
			TenantID: "t-1",
		},
	}

	err := Handler(context.Background(), req)
	assert.Error(t, err)
}
