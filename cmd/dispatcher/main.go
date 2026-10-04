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
	"areweupyet/internal/webhook"

	"github.com/aws/aws-lambda-go/lambda"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	lambdatypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"
)

type EventBridgeEvent struct {
	ID     string          `json:"id"`
	Source string          `json:"source"`
	Time   string          `json:"time"`
	Detail json.RawMessage `json:"detail"`
}

type LambdaInvoker interface {
	Invoke(ctx context.Context, params *awslambda.InvokeInput, optFns ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error)
}

type DispatcherNotifier struct {
	lambdaClient LambdaInvoker
	functionName string
}

func (n *DispatcherNotifier) Notify(ctx context.Context, webhookURL, secret string, payload models.WebhookPayload) error {
	slog.Info("delivering notification", "event", payload.Event, "endpointId", payload.EndpointID, "target", webhookURL)
	if n.lambdaClient != nil && n.functionName != "" {
		reqData, err := json.Marshal(map[string]any{
			"webhookUrl": webhookURL,
			"secret":     secret,
			"payload":    payload,
		})
		if err == nil {
			_, err = n.lambdaClient.Invoke(ctx, &awslambda.InvokeInput{
				FunctionName:   &n.functionName,
				InvocationType: lambdatypes.InvocationTypeEvent,
				Payload:        reqData,
			})
			if err == nil {
				return nil
			}
			slog.Warn("async lambda notification failed, falling back to direct delivery", "error", err)
		}
	}
	return webhook.Deliver(ctx, webhookURL, secret, payload)
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
	var lambdaClient *awslambda.Client

	if os.Getenv("USE_MEMORY_STORE") == "true" {
		store = dynamo.NewMemoryStore()
	} else {
		cfg, err := awsconfig.LoadDefaultConfig(context.Background())
		if err != nil {
			if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
				slog.Error("fatal: failed to load AWS config for DynamoDB", "error", err)
				panic("failed to load AWS config: " + err.Error())
			}
			slog.Warn("failed to load AWS config, falling back to memory store", "error", err)
			store = dynamo.NewMemoryStore()
		} else {
			client := dynamodb.NewFromConfig(cfg)
			store = dynamo.NewDynamoStore(client, endpointsTable, pingResultsTable, incidentsTable)
			lambdaClient = awslambda.NewFromConfig(cfg)
		}
	}

	notifierFnName := os.Getenv("NOTIFIER_FUNCTION_NAME")
	notifier := &DispatcherNotifier{
		lambdaClient: lambdaClient,
		functionName: notifierFnName,
	}

	engine = dispatcher.New(store, notifier, dispatcher.Config{
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
