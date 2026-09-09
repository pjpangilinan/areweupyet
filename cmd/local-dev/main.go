package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"areweupyet/internal/apiprivate"
	"areweupyet/internal/apipublic"
	"areweupyet/internal/dispatcher"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
)

type ConsoleNotifier struct{}

func (n *ConsoleNotifier) Notify(_ context.Context, payload models.WebhookPayload) error {
	slog.Info("WEBHOOK NOTIFICATION DISPATCHED",
		"event", payload.Event,
		"endpointId", payload.EndpointID,
		"endpointUrl", payload.EndpointURL,
		"incidentId", payload.IncidentID,
		"durationSeconds", payload.DurationSeconds,
	)
	return nil
}

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))

	store := dynamo.NewMemoryStore()

	// Seed sample endpoints
	now := time.Now().UTC()
	_ = store.CreateEndpoint(context.Background(), models.Endpoint{
		TenantID:        "demo",
		EndpointID:      "ep-google",
		Name:            "Google Public DNS / Web",
		URL:             "https://www.google.com",
		FrequencyMin:    5,
		TimeoutSec:      5,
		ExpectedStatus:  200,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     now,
		Status:          "PENDING",
		ConsecutiveFail: 0,
		CreatedAt:       now,
		UpdatedAt:       now,
	})

	_ = store.CreateEndpoint(context.Background(), models.Endpoint{
		TenantID:        "demo",
		EndpointID:      "ep-httpstat",
		Name:            "Example Domain",
		URL:             "https://example.com",
		FrequencyMin:    5,
		TimeoutSec:      5,
		ExpectedStatus:  200,
		StatusBucket:    "ACTIVE",
		NextCheckAt:     now,
		Status:          "PENDING",
		ConsecutiveFail: 0,
		CreatedAt:       now,
		UpdatedAt:       now,
	})

	// Initialize engines
	dispEngine := dispatcher.New(store, &ConsoleNotifier{}, dispatcher.Config{
		WorkerPoolSize:       10,
		NotificationCooldown: 1 * time.Minute,
		DefaultTimeoutSec:    5,
	})

	privateServer := apiprivate.NewServer(store)
	publicServer := apipublic.NewServer(store)

	// Background dispatcher ticker: checks every 10 seconds in local dev
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		// Run immediately on start
		slog.Info("Running initial dispatcher check...")
		count, err := dispEngine.RunOnce(context.Background(), time.Now().UTC())
		if err != nil {
			slog.Error("Initial check failed", "error", err)
		} else {
			slog.Info("Initial check finished", "endpointsChecked", count)
		}

		for tick := range ticker.C {
			count, err := dispEngine.RunOnce(context.Background(), tick.UTC())
			if err != nil {
				slog.Error("Ticker run failed", "error", err)
			} else if count > 0 {
				slog.Info("Dispatcher ticked", "endpointsChecked", count)
			}
		}
	}()

	// Combined HTTP router with CORS
	mux := http.NewServeMux()

	// Public routes
	mux.Handle("/status/", withCORS(publicServer))

	// Private routes
	mux.Handle("/endpoints", withCORS(privateServer))
	mux.Handle("/endpoints/", withCORS(privateServer))
	mux.Handle("/settings/", withCORS(privateServer))

	// Root status check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().Format(time.RFC3339))
	})

	port := "8080"
	slog.Info(fmt.Sprintf("======================================================"))
	slog.Info(fmt.Sprintf(" AreWeUpYet Local Test Server Running on :%s", port))
	slog.Info(fmt.Sprintf(" - Health:          http://localhost:%s/health", port))
	slog.Info(fmt.Sprintf(" - Public Status:   http://localhost:%s/status/demo", port))
	slog.Info(fmt.Sprintf(" - Private API:     http://localhost:%s/endpoints", port))
	slog.Info(fmt.Sprintf("======================================================"))

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		slog.Error("Server stopped", "error", err)
	}
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-ID")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		h.ServeHTTP(w, r)
	})
}
