package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
)

type EventBridgeEvent struct {
	ID     string          `json:"id"`
	Source string          `json:"source"`
	Time   string          `json:"time"`
	Detail json.RawMessage `json:"detail"`
}

func HandleRequest(ctx context.Context, event EventBridgeEvent) error {
	slog.Info("dispatcher tick received", "time", event.Time, "source", event.Source)
	// Dispatcher logic: queries DueCheck GSI, claims endpoints, pings concurrently, updates state.
	return nil
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	lambda.Start(HandleRequest)
}
