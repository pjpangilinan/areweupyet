package dispatcher

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"areweupyet/internal/checker"
	"areweupyet/internal/dynamo"
	"areweupyet/internal/models"
)

// Notifier defines the interface for dispatching state-change alerts.
type Notifier interface {
	Notify(ctx context.Context, payload models.WebhookPayload) error
}

// Config tunes dispatcher execution.
type Config struct {
	WorkerPoolSize       int           // Default: 20 concurrent pings
	NotificationCooldown time.Duration // Default: 5 minutes per endpoint
	DefaultTimeoutSec    int           // Default: 10s
}

// Dispatcher coordinates claiming due endpoints, pinging them, and updating state.
type Dispatcher struct {
	store          dynamo.Store
	notifier       Notifier
	cfg            Config
	lastNotifyMu   sync.Mutex
	lastNotifyTime map[string]time.Time // key: endpointId:event
}

// New creates a new Dispatcher instance.
func New(store dynamo.Store, notifier Notifier, cfg Config) *Dispatcher {
	if cfg.WorkerPoolSize <= 0 {
		cfg.WorkerPoolSize = 20
	}
	if cfg.NotificationCooldown <= 0 {
		cfg.NotificationCooldown = 5 * time.Minute
	}
	if cfg.DefaultTimeoutSec <= 0 {
		cfg.DefaultTimeoutSec = 10
	}

	return &Dispatcher{
		store:          store,
		notifier:       notifier,
		cfg:            cfg,
		lastNotifyTime: make(map[string]time.Time),
	}
}

// RunOnce executes a single polling cycle (invoked every 1 minute by EventBridge).
func (d *Dispatcher) RunOnce(ctx context.Context, now time.Time) (int, error) {
	// 1. Claim due endpoints via DueCheck query with conditional write
	dueEndpoints, err := d.store.ClaimDueEndpoints(ctx, now, 100)
	if err != nil {
		return 0, fmt.Errorf("failed to claim due endpoints: %w", err)
	}

	if len(dueEndpoints) == 0 {
		return 0, nil
	}

	slog.Info("claimed due endpoints", "count", len(dueEndpoints), "at", now)

	// 2. Concurrently ping claimed endpoints using a bounded worker pool
	var wg sync.WaitGroup
	sem := make(chan struct{}, d.cfg.WorkerPoolSize)

	for _, ep := range dueEndpoints {
		wg.Add(1)
		sem <- struct{}{}

		go func(endpoint models.Endpoint) {
			defer wg.Done()
			defer func() { <-sem }()

			d.processEndpoint(ctx, endpoint, now)
		}(ep)
	}

	wg.Wait()
	return len(dueEndpoints), nil
}

func (d *Dispatcher) processEndpoint(ctx context.Context, ep models.Endpoint, now time.Time) {
	// Execute check
	timeout := ep.TimeoutSec
	if timeout <= 0 {
		timeout = d.cfg.DefaultTimeoutSec
	}

	pingResult := checker.CheckEndpoint(ctx, checker.CheckOptions{
		URL:            ep.URL,
		TimeoutSec:     timeout,
		ExpectedStatus: ep.ExpectedStatus,
	})
	pingResult.EndpointID = ep.EndpointID

	// Record ping result
	if err := d.store.RecordPingResult(ctx, pingResult); err != nil {
		slog.Error("failed to record ping result", "endpointId", ep.EndpointID, "error", err)
	}

	// Update endpoint state and detect incident transitions
	ep.UpdatedAt = now

	if pingResult.Success {
		// Successful check
		if ep.Status == "DOWN" {
			// Transition: DOWN -> UP (1 success closes incident)
			d.handleIncidentClose(ctx, ep, now)
		}
		ep.Status = "UP"
		ep.ConsecutiveFail = 0
	} else {
		// Failed check
		ep.ConsecutiveFail++
		if ep.ConsecutiveFail >= 2 && ep.Status != "DOWN" {
			// Transition: UP/PENDING -> DOWN (2 consecutive failures opens incident)
			ep.Status = "DOWN"
			d.handleIncidentOpen(ctx, ep, now, pingResult.ErrorMessage)
		}
	}

	// Schedule next check
	freq := ep.FrequencyMin
	if freq < 5 {
		freq = 5 // Floor: 5 min
	}
	ep.NextCheckAt = now.Add(time.Duration(freq) * time.Minute)

	if err := d.store.UpdateEndpoint(ctx, ep); err != nil {
		slog.Error("failed to update endpoint status", "endpointId", ep.EndpointID, "error", err)
	}
}

func (d *Dispatcher) handleIncidentOpen(ctx context.Context, ep models.Endpoint, now time.Time, reason string) {
	slog.Warn("incident opened", "endpointId", ep.EndpointID, "reason", reason)

	inc := models.Incident{
		EndpointID: ep.EndpointID,
		StartedAt:  now,
		Reason:     reason,
		TenantID:   ep.TenantID,
	}

	if err := d.store.SaveIncident(ctx, inc); err != nil {
		slog.Error("failed to save incident", "endpointId", ep.EndpointID, "error", err)
	}

	if d.shouldNotify(ep.EndpointID, "incident.opened", now) && d.notifier != nil {
		payload := models.WebhookPayload{
			Event:       "incident.opened",
			TenantID:    ep.TenantID,
			EndpointID:  ep.EndpointID,
			EndpointURL: ep.URL,
			IncidentID:  fmt.Sprintf("%s-%d", ep.EndpointID, now.Unix()),
			StartedAt:   now,
		}
		_ = d.notifier.Notify(ctx, payload)
	}
}

func (d *Dispatcher) handleIncidentClose(ctx context.Context, ep models.Endpoint, now time.Time) {
	slog.Info("incident resolved", "endpointId", ep.EndpointID)

	openInc, err := d.store.GetOpenIncident(ctx, ep.EndpointID)
	if err != nil || openInc == nil {
		return
	}

	resolvedAt := now
	openInc.ResolvedAt = &resolvedAt
	openInc.DurationSeconds = int64(now.Sub(openInc.StartedAt).Seconds())

	if err := d.store.SaveIncident(ctx, *openInc); err != nil {
		slog.Error("failed to close incident", "endpointId", ep.EndpointID, "error", err)
	}

	if d.shouldNotify(ep.EndpointID, "incident.resolved", now) && d.notifier != nil {
		payload := models.WebhookPayload{
			Event:           "incident.resolved",
			TenantID:        ep.TenantID,
			EndpointID:      ep.EndpointID,
			EndpointURL:     ep.URL,
			IncidentID:      fmt.Sprintf("%s-%d", ep.EndpointID, openInc.StartedAt.Unix()),
			StartedAt:       openInc.StartedAt,
			ResolvedAt:      &resolvedAt,
			DurationSeconds: openInc.DurationSeconds,
		}
		_ = d.notifier.Notify(ctx, payload)
	}
}

// shouldNotify checks the notification cooldown to prevent alert flooding on flapping endpoints.
func (d *Dispatcher) shouldNotify(endpointID, event string, now time.Time) bool {
	d.lastNotifyMu.Lock()
	defer d.lastNotifyMu.Unlock()

	key := fmt.Sprintf("%s:%s", endpointID, event)
	last, exists := d.lastNotifyTime[key]
	if exists && now.Sub(last) < d.cfg.NotificationCooldown {
		slog.Warn("notification suppressed by cooldown", "endpointId", endpointID, "event", event)
		return false
	}

	d.lastNotifyTime[key] = now
	return true
}
