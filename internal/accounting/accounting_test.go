package accounting

import (
	"testing"
	"time"

	"areweupyet/internal/models"

	"github.com/stretchr/testify/assert"
)

func TestCalculateUptime_NoIncidents(t *testing.T) {
	now := time.Now()
	start := now.Add(-24 * time.Hour)

	stats := CalculateUptime(nil, start, now)
	assert.Equal(t, 100.0, stats.UptimePercentage)
	assert.Equal(t, "100.00%", stats.FormattedUptime)
	assert.Equal(t, int64(0), stats.DowntimeSeconds)
	assert.Equal(t, 0, stats.IncidentCount)
}

func TestCalculateUptime_WithContainedIncident(t *testing.T) {
	now := time.Now()
	start := now.Add(-24 * time.Hour) // 86400 seconds

	// 1 hour downtime = 3600s
	incStart := now.Add(-10 * time.Hour)
	incEnd := now.Add(-9 * time.Hour)

	incidents := []models.Incident{
		{
			EndpointID:      "ep-1",
			StartedAt:       incStart,
			ResolvedAt:      &incEnd,
			DurationSeconds: 3600,
		},
	}

	stats := CalculateUptime(incidents, start, now)
	assert.Equal(t, int64(3600), stats.DowntimeSeconds)
	assert.Equal(t, 1, stats.IncidentCount)
	// (86400 - 3600) / 86400 * 100 = 82800 / 86400 * 100 = 95.83%
	assert.Equal(t, 95.83, stats.UptimePercentage)
	assert.Equal(t, "95.83%", stats.FormattedUptime)
}

func TestCalculateUptime_StraddlingWindow(t *testing.T) {
	now := time.Now()
	start := now.Add(-1 * time.Hour) // 3600 second window

	// Incident started 30 min before window and ended 30 min into window
	incStart := start.Add(-30 * time.Minute)
	incEnd := start.Add(30 * time.Minute)

	incidents := []models.Incident{
		{
			EndpointID: "ep-straddle",
			StartedAt:  incStart,
			ResolvedAt: &incEnd,
		},
	}

	stats := CalculateUptime(incidents, start, now)
	// Only 30 minutes (1800s) fell inside the window
	assert.Equal(t, int64(1800), stats.DowntimeSeconds)
	assert.Equal(t, 50.0, stats.UptimePercentage)
}

func TestFormatDuration(t *testing.T) {
	assert.Equal(t, "45s", formatDuration(45))
	assert.Equal(t, "5m", formatDuration(300))
	assert.Equal(t, "5m 30s", formatDuration(330))
	assert.Equal(t, "2h", formatDuration(7200))
	assert.Equal(t, "2h 15m", formatDuration(8100))
}
