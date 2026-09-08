package models

import "time"

// Endpoint represents a monitored HTTP(S) endpoint.
type Endpoint struct {
	TenantID        string    `json:"tenantId" dynamodbav:"tenantId"`
	EndpointID      string    `json:"endpointId" dynamodbav:"endpointId"`
	Name            string    `json:"name" dynamodbav:"name"`
	URL             string    `json:"url" dynamodbav:"url"`
	FrequencyMin    int       `json:"frequencyMin" dynamodbav:"frequencyMin"` // Floor: 5 minutes
	TimeoutSec      int       `json:"timeoutSec" dynamodbav:"timeoutSec"`     // Default: 10s
	ExpectedStatus  int       `json:"expectedStatus" dynamodbav:"expectedStatus"`
	StatusBucket    string    `json:"statusBucket" dynamodbav:"statusBucket"` // Constant "ACTIVE" for GSI
	NextCheckAt     time.Time `json:"nextCheckAt" dynamodbav:"nextCheckAt"`
	ConsecutiveFail int       `json:"consecutiveFail" dynamodbav:"consecutiveFail"`
	Status          string    `json:"status" dynamodbav:"status"` // "UP" | "DOWN" | "PENDING"
	CreatedAt       time.Time `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt" dynamodbav:"updatedAt"`
}

// PingResult represents the result of a single check.
type PingResult struct {
	EndpointID   string        `json:"endpointId" dynamodbav:"endpointId"`
	CheckedAt    time.Time     `json:"checkedAt" dynamodbav:"checkedAt"`
	StatusCode   int           `json:"statusCode" dynamodbav:"statusCode"`
	LatencyMs    int64         `json:"latencyMs" dynamodbav:"latencyMs"`
	Success      bool          `json:"success" dynamodbav:"success"`
	ErrorMessage string        `json:"errorMessage,omitempty" dynamodbav:"errorMessage,omitempty"`
	TTL          int64         `json:"ttl" dynamodbav:"ttl"` // Unix timestamp for auto-cleanup
}

// Incident tracks downtime when 2 consecutive pings fail until 1 passes.
type Incident struct {
	EndpointID      string     `json:"endpointId" dynamodbav:"endpointId"`
	StartedAt       time.Time  `json:"startedAt" dynamodbav:"startedAt"`
	ResolvedAt      *time.Time `json:"resolvedAt,omitempty" dynamodbav:"resolvedAt,omitempty"`
	DurationSeconds int64      `json:"durationSeconds" dynamodbav:"durationSeconds"`
	Reason          string     `json:"reason" dynamodbav:"reason"`
	TenantID        string     `json:"tenantId" dynamodbav:"tenantId"`
}

// WebhookPayload sent on state transitions.
type WebhookPayload struct {
	Event           string     `json:"event"` // "incident.opened" | "incident.resolved"
	TenantID        string     `json:"tenantId"`
	EndpointID      string     `json:"endpointId"`
	EndpointURL     string     `json:"endpointUrl"`
	IncidentID      string     `json:"incidentId"`
	StartedAt       time.Time  `json:"startedAt"`
	ResolvedAt      *time.Time `json:"resolvedAt"`
	DurationSeconds int64      `json:"durationSeconds"`
}
