package main

import (
	"context"
	"log/slog"
	"os"

	"areweupyet/internal/apipublic"
	"areweupyet/internal/dynamo"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

var server *apipublic.Server

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

	server = apipublic.NewServer(store)
}

func Handler(ctx context.Context, request events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	return apipublic.HandleLambdaRequest(ctx, server, request)
}

func main() {
	lambda.Start(Handler)
}
