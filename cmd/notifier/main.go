package main

import (
	"context"
	"log/slog"
	"os"

	"areweupyet/internal/models"
	"areweupyet/internal/webhook"

	"github.com/aws/aws-lambda-go/lambda"
)

type NotificationRequest struct {
	WebhookURL string                `json:"webhookUrl"`
	Secret     string                `json:"secret"`
	Payload    models.WebhookPayload `json:"payload"`
}

func Handler(ctx context.Context, req NotificationRequest) error {
	slog.Info("delivering notification", "tenantId", req.Payload.TenantID, "event", req.Payload.Event)
	return webhook.Deliver(ctx, req.WebhookURL, req.Secret, req.Payload)
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	lambda.Start(Handler)
}
