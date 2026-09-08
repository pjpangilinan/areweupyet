package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"time"

	"areweupyet/internal/dispatcher"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"

	"github.com/aws/aws-lambda-go/lambda"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type EventBridgeEvent struct {
	ID     string          `json:"id"`
	Source string          `json:"source"`
	Time   string          `json:"time"`
	Detail json.RawMessage `json:"detail"`
}

type LambdaNotifier struct{}

func (n *LambdaNotifier) Notify(ctx context.Context, payload models.WebhookPayload) error {
	slog.Info("notification emitted", "event", payload.Event, "endpointId", payload.EndpointID)
	// In full production, this can invoke the notifier Lambda asynchronously
	return nil
}

var engine *dispatcher.Dispatcher

func init() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	endpointsTable := os.Getenv("ENDPOINTS_TABLE")
	if endpointsTable == "" {
		endpointsTable = "AreWeUpYet-Endpoints"
	}
	pingResultsTable := os.Getenv("PING_RESULTS_TABLE")
	if pingResultsTable == "" {
		pingResultsTable = "AreWeUpYet-PingResults"
	}
	incidentsTable := os.Getenv("INCIDENTS_TABLE")
	if incidentsTable == "" {
		incidentsTable = "AreWeUpYet-Incidents"
	}

	var store dynamo.Store
	if os.Getenv("USE_MEMORY_STORE") == "true" {
		store = dynamo.NewMemoryStore()
	} else {
		cfg, err := awsconfig.LoadDefaultConfig(context.Background())
		if err != nil {
			slog.Error("failed to load AWS config, falling back to memory store", "error", err)
			store = dynamo.NewMemoryStore()
		} else {
			client := dynamodb.NewFromConfig(cfg)
			store = dynamo.NewDynamoStore(client, endpointsTable, pingResultsTable, incidentsTable)
		}
	}

	engine = dispatcher.New(store, &LambdaNotifier{}, dispatcher.Config{
		WorkerPoolSize:       20,
		NotificationCooldown: 5 * time.Minute,
		DefaultTimeoutSec:    10,
	})
}

func HandleRequest(ctx context.Context, event EventBridgeEvent) error {
	slog.Info("dispatcher tick received", "time", event.Time, "source", event.Source)
	processed, err := engine.RunOnce(ctx, time.Now())
	if err != nil {
		slog.Error("dispatcher run error", "error", err)
		return err
	}
	slog.Info("dispatcher run completed", "endpointsProcessed", processed)
	return nil
}

func main() {
	lambda.Start(HandleRequest)
}
