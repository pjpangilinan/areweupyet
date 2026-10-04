package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"areweupyet/internal/models"

	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	lambdatypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockLambdaInvoker struct {
	invoked      bool
	lastInput    *awslambda.InvokeInput
	returnError  error
	returnOutput *awslambda.InvokeOutput
}

func (m *mockLambdaInvoker) Invoke(_ context.Context, params *awslambda.InvokeInput, _ ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error) {
	m.invoked = true
	m.lastInput = params
	if m.returnError != nil {
		return nil, m.returnError
	}
	return m.returnOutput, nil
}

func TestDispatcherNotifier_AsyncLambdaSuccess(t *testing.T) {
	mockInvoker := &mockLambdaInvoker{
		returnOutput: &awslambda.InvokeOutput{
			StatusCode: 202,
		},
	}

	notifier := &DispatcherNotifier{
		lambdaClient: mockInvoker,
		functionName: "AreWeUpYet-Notifier",
	}

	payload := models.WebhookPayload{
		Event:           "incident.opened",
		TenantID:        "test-tenant",
		EndpointID:      "ep-123",
		EndpointURL:     "https://example.com/api",
		IncidentID:      "inc-456",
		StartedAt:       time.Now().UTC(),
		DurationSeconds: 0,
	}

	err := notifier.Notify(context.Background(), "https://example.com/webhook", "test-secret", payload)
	require.NoError(t, err)

	assert.True(t, mockInvoker.invoked)
	require.NotNil(t, mockInvoker.lastInput)
	assert.Equal(t, "AreWeUpYet-Notifier", *mockInvoker.lastInput.FunctionName)
	assert.Equal(t, lambdatypes.InvocationTypeEvent, mockInvoker.lastInput.InvocationType)
	assert.Contains(t, string(mockInvoker.lastInput.Payload), "test-tenant")
	assert.Contains(t, string(mockInvoker.lastInput.Payload), "test-secret")
}

func TestDispatcherNotifier_FallbackToDirectDeliveryOnLambdaError(t *testing.T) {
	mockInvoker := &mockLambdaInvoker{
		returnError: errors.New("rate exceeded or lambda failure"),
	}

	notifier := &DispatcherNotifier{
		lambdaClient: mockInvoker,
		functionName: "AreWeUpYet-Notifier",
	}

	payload := models.WebhookPayload{
		Event:       "incident.opened",
		TenantID:    "test-tenant",
		EndpointID:  "ep-123",
		EndpointURL: "https://example.com/api",
	}

	// Loopback address fails SSRF guard safely during fallback delivery
	err := notifier.Notify(context.Background(), "http://127.0.0.1/hook", "test-secret", payload)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "blocked")
	assert.True(t, mockInvoker.invoked)
}

func TestDispatcherNotifier_DirectDeliveryWhenNoLambda(t *testing.T) {
	notifier := &DispatcherNotifier{
		lambdaClient: nil,
		functionName: "",
	}

	payload := models.WebhookPayload{
		Event:       "incident.opened",
		TenantID:    "test-tenant",
		EndpointID:  "ep-123",
		EndpointURL: "https://example.com/api",
	}

	// Falls back directly to webhook.Deliver, which blocks 127.0.0.1
	err := notifier.Notify(context.Background(), "http://127.0.0.1/hook", "test-secret", payload)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "blocked")
}
