package accounting

import (
	"fmt"
	"math"
	"sort"
	"time"

	"areweupyet/internal/models"
)

// UptimeStats contains downtime accounting metrics for an endpoint.
type UptimeStats struct {
	TotalWindowSeconds int64   `json:"totalWindowSeconds"`
	DowntimeSeconds    int64   `json:"downtimeSeconds"`
	UptimePercentage   float64 `json:"uptimePercentage"`
	FormattedUptime    string  `json:"formattedUptime"`
	IncidentCount      int     `json:"incidentCount"`
}

// TimelineEntry represents a formatted incident record for UI display.
type TimelineEntry struct {
	EndpointID        string    `json:"endpointId"`
	StartedAt         time.Time `json:"startedAt"`
	ResolvedAt        *time.Time `json:"resolvedAt,omitempty"`
	DurationSeconds   int64     `json:"durationSeconds"`
	FormattedDuration string    `json:"formattedDuration"`
	Reason            string    `json:"reason"`
	IsOpen            bool      `json:"isOpen"`
}

// CalculateUptime computes exact uptime percentage within a specified time window.
func CalculateUptime(incidents []models.Incident, windowStart, windowEnd time.Time) UptimeStats {
	totalWindow := int64(windowEnd.Sub(windowStart).Seconds())
	if totalWindow <= 0 {
		return UptimeStats{
			TotalWindowSeconds: 0,
			DowntimeSeconds:    0,
			UptimePercentage:   100.0,
			FormattedUptime:    "100.00%",
			IncidentCount:      0,
		}
	}

	var totalDowntime int64
	incidentCount := 0

	for _, inc := range incidents {
		incStart := inc.StartedAt
		incEnd := windowEnd
		if inc.ResolvedAt != nil {
			incEnd = *inc.ResolvedAt
		}

		// Check overlap with [windowStart, windowEnd]
		if incEnd.Before(windowStart) || incStart.After(windowEnd) {
			continue
		}

		incidentCount++

		effectiveStart := incStart
		if effectiveStart.Before(windowStart) {
			effectiveStart = windowStart
		}

		effectiveEnd := incEnd
		if effectiveEnd.After(windowEnd) {
			effectiveEnd = windowEnd
		}

		overlap := int64(effectiveEnd.Sub(effectiveStart).Seconds())
		if overlap > 0 {
			totalDowntime += overlap
		}
	}

	if totalDowntime > totalWindow {
		totalDowntime = totalWindow
	}

	uptimeSeconds := totalWindow - totalDowntime
	pct := (float64(uptimeSeconds) / float64(totalWindow)) * 100.0
	pct = math.Max(0.0, math.Min(100.0, pct))

	return UptimeStats{
		TotalWindowSeconds: totalWindow,
		DowntimeSeconds:    totalDowntime,
		UptimePercentage:   math.Round(pct*100) / 100,
		FormattedUptime:    fmt.Sprintf("%.2f%%", pct),
		IncidentCount:      incidentCount,
	}
}

// FormatTimeline converts raw incidents into chronological timeline entries.
func FormatTimeline(incidents []models.Incident) []TimelineEntry {
	sorted := make([]models.Incident, len(incidents))
	copy(sorted, incidents)

	// Sort newest first
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].StartedAt.After(sorted[j].StartedAt)
	})

	entries := make([]TimelineEntry, len(sorted))
	for i, inc := range sorted {
		dur := inc.DurationSeconds
		isOpen := inc.ResolvedAt == nil
		if isOpen {
			dur = int64(time.Since(inc.StartedAt).Seconds())
		}

		entries[i] = TimelineEntry{
			EndpointID:        inc.EndpointID,
			StartedAt:         inc.StartedAt,
			ResolvedAt:        inc.ResolvedAt,
			DurationSeconds:   dur,
			FormattedDuration: formatDuration(dur),
			Reason:            inc.Reason,
			IsOpen:            isOpen,
		}
	}

	return entries
}

func formatDuration(seconds int64) string {
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}
	minutes := seconds / 60
	remainingSec := seconds % 60
	if minutes < 60 {
		if remainingSec > 0 {
			return fmt.Sprintf("%dm %ds", minutes, remainingSec)
		}
		return fmt.Sprintf("%dm", minutes)
	}
	hours := minutes / 60
	remainingMin := minutes % 60
	if remainingMin > 0 {
		return fmt.Sprintf("%dh %dm", hours, remainingMin)
	}
	return fmt.Sprintf("%dh", hours)
}
