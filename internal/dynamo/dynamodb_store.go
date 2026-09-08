package dynamo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"areweupyet/internal/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/expression"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// DynamoStore implements Store against real AWS DynamoDB or local DynamoDB with endpoint override.
type DynamoStore struct {
	client           *dynamodb.Client
	endpointsTable   string
	pingResultsTable string
	incidentsTable   string
}

// NewDynamoStore creates a new DynamoStore instance.
func NewDynamoStore(client *dynamodb.Client, endpointsTable, pingResultsTable, incidentsTable string) *DynamoStore {
	return &DynamoStore{
		client:           client,
		endpointsTable:   endpointsTable,
		pingResultsTable: pingResultsTable,
		incidentsTable:   incidentsTable,
	}
}

// CreateEndpoint puts a new endpoint item into the Endpoints table.
func (d *DynamoStore) CreateEndpoint(ctx context.Context, ep models.Endpoint) error {
	// First check 20-endpoint cap
	existing, err := d.ListEndpoints(ctx, ep.TenantID)
	if err != nil {
		return fmt.Errorf("failed to check tenant endpoint count: %w", err)
	}
	if len(existing) >= 20 {
		return ErrTenantLimit
	}

	av, err := attributevalue.MarshalMap(ep)
	if err != nil {
		return fmt.Errorf("failed to marshal endpoint: %w", err)
	}

	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           aws.String(d.endpointsTable),
		Item:                av,
		ConditionExpression: aws.String("attribute_not_exists(tenantId) AND attribute_not_exists(endpointId)"),
	})
	if err != nil {
		var condErr *types.ConditionalCheckFailedException
		if errors.As(err, &condErr) {
			return errors.New("endpoint already exists")
		}
		return fmt.Errorf("failed to put endpoint: %w", err)
	}
	return nil
}

// GetEndpoint retrieves a single endpoint by PK (tenantId) and SK (endpointId).
func (d *DynamoStore) GetEndpoint(ctx context.Context, tenantID, endpointID string) (*models.Endpoint, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.endpointsTable),
		Key: map[string]types.AttributeValue{
			"tenantId":   &types.AttributeValueMemberS{Value: tenantID},
			"endpointId": &types.AttributeValueMemberS{Value: endpointID},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get endpoint: %w", err)
	}
	if out.Item == nil {
		return nil, ErrEndpointNotFound
	}

	var ep models.Endpoint
	if err := attributevalue.UnmarshalMap(out.Item, &ep); err != nil {
		return nil, fmt.Errorf("failed to unmarshal endpoint: %w", err)
	}
	return &ep, nil
}

// ListEndpoints queries all endpoints for a tenant by PK tenantId.
func (d *DynamoStore) ListEndpoints(ctx context.Context, tenantID string) ([]models.Endpoint, error) {
	keyCond := expression.Key("tenantId").Equal(expression.Value(tenantID))
	expr, err := expression.NewBuilder().WithKeyCondition(keyCond).Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build expression: %w", err)
	}

	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:                 aws.String(d.endpointsTable),
		KeyConditionExpression:    expr.KeyCondition(),
		ExpressionAttributeNames:  expr.Names(),
		ExpressionAttributeValues: expr.Values(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to query endpoints: %w", err)
	}

	var endpoints []models.Endpoint
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &endpoints); err != nil {
		return nil, fmt.Errorf("failed to unmarshal endpoints list: %w", err)
	}
	return endpoints, nil
}

// UpdateEndpoint updates an existing endpoint.
func (d *DynamoStore) UpdateEndpoint(ctx context.Context, ep models.Endpoint) error {
	av, err := attributevalue.MarshalMap(ep)
	if err != nil {
		return fmt.Errorf("failed to marshal endpoint: %w", err)
	}

	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           aws.String(d.endpointsTable),
		Item:                av,
		ConditionExpression: aws.String("attribute_exists(tenantId) AND attribute_exists(endpointId)"),
	})
	if err != nil {
		var condErr *types.ConditionalCheckFailedException
		if errors.As(err, &condErr) {
			return ErrEndpointNotFound
		}
		return fmt.Errorf("failed to update endpoint: %w", err)
	}
	return nil
}

// DeleteEndpointCascade deletes the endpoint, all its ping results, and all its incidents.
func (d *DynamoStore) DeleteEndpointCascade(ctx context.Context, tenantID, endpointID string) error {
	// 1. Delete endpoint record
	_, err := d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(d.endpointsTable),
		Key: map[string]types.AttributeValue{
			"tenantId":   &types.AttributeValueMemberS{Value: tenantID},
			"endpointId": &types.AttributeValueMemberS{Value: endpointID},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to delete endpoint: %w", err)
	}

	// 2. Cascade delete PingResults
	pings, err := d.ListPingResults(ctx, endpointID, 500)
	if err == nil {
		for _, ping := range pings {
			checkedAtRFC := ping.CheckedAt.Format(time.RFC3339Nano)
			_, _ = d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
				TableName: aws.String(d.pingResultsTable),
				Key: map[string]types.AttributeValue{
					"endpointId": &types.AttributeValueMemberS{Value: endpointID},
					"checkedAt":  &types.AttributeValueMemberS{Value: checkedAtRFC},
				},
			})
		}
	}

	// 3. Cascade delete Incidents
	incidents, err := d.ListIncidents(ctx, endpointID)
	if err == nil {
		for _, inc := range incidents {
			startedAtRFC := inc.StartedAt.Format(time.RFC3339Nano)
			_, _ = d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
				TableName: aws.String(d.incidentsTable),
				Key: map[string]types.AttributeValue{
					"endpointId": &types.AttributeValueMemberS{Value: endpointID},
					"startedAt":  &types.AttributeValueMemberS{Value: startedAtRFC},
				},
			})
		}
	}

	return nil
}

// ClaimDueEndpoints queries DueCheck GSI (PK statusBucket="ACTIVE" AND SK nextCheckAt <= now)
// and updates nextCheckAt conditionally to prevent dispatcher overlap.
func (d *DynamoStore) ClaimDueEndpoints(ctx context.Context, now time.Time, limit int) ([]models.Endpoint, error) {
	nowStr := now.Format(time.RFC3339Nano)
	keyCond := expression.Key("statusBucket").Equal(expression.Value("ACTIVE")).
		And(expression.Key("nextCheckAt").LessThanEqual(expression.Value(nowStr)))

	expr, err := expression.NewBuilder().WithKeyCondition(keyCond).Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build expression: %w", err)
	}

	var limit32 *int32
	if limit > 0 {
		l := int32(limit)
		limit32 = &l
	}

	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:                 aws.String(d.endpointsTable),
		IndexName:                 aws.String("DueCheck"),
		KeyConditionExpression:    expr.KeyCondition(),
		ExpressionAttributeNames:  expr.Names(),
		ExpressionAttributeValues: expr.Values(),
		Limit:                     limit32,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to query DueCheck GSI: %w", err)
	}

	var candidateList []models.Endpoint
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &candidateList); err != nil {
		return nil, fmt.Errorf("failed to unmarshal candidate endpoints: %w", err)
	}

	var claimed []models.Endpoint
	for _, ep := range candidateList {
		// Conditional update to claim this endpoint:
		// Only succeed if nextCheckAt has not been changed by a concurrent dispatcher run
		oldNextCheck := ep.NextCheckAt.Format(time.RFC3339Nano)
		newNextCheck := now.Add(time.Duration(ep.FrequencyMin) * time.Minute).Format(time.RFC3339Nano)

		_, err := d.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName: aws.String(d.endpointsTable),
			Key: map[string]types.AttributeValue{
				"tenantId":   &types.AttributeValueMemberS{Value: ep.TenantID},
				"endpointId": &types.AttributeValueMemberS{Value: ep.EndpointID},
			},
			UpdateExpression:    aws.String("SET nextCheckAt = :newNext"),
			ConditionExpression: aws.String("nextCheckAt = :oldNext"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":newNext": &types.AttributeValueMemberS{Value: newNextCheck},
				":oldNext": &types.AttributeValueMemberS{Value: oldNextCheck},
			},
		})
		if err == nil {
			claimed = append(claimed, ep)
		}
	}

	return claimed, nil
}

// RecordPingResult writes a single ping result with TTL for automatic free-tier storage cleanup.
func (d *DynamoStore) RecordPingResult(ctx context.Context, res models.PingResult) error {
	av, err := attributevalue.MarshalMap(res)
	if err != nil {
		return fmt.Errorf("failed to marshal ping result: %w", err)
	}

	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.pingResultsTable),
		Item:      av,
	})
	if err != nil {
		return fmt.Errorf("failed to put ping result: %w", err)
	}
	return nil
}

// ListPingResults fetches latest ping results for an endpoint.
func (d *DynamoStore) ListPingResults(ctx context.Context, endpointID string, limit int) ([]models.PingResult, error) {
	keyCond := expression.Key("endpointId").Equal(expression.Value(endpointID))
	expr, err := expression.NewBuilder().WithKeyCondition(keyCond).Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build expression: %w", err)
	}

	var limit32 *int32
	if limit > 0 {
		l := int32(limit)
		limit32 = &l
	}

	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:                 aws.String(d.pingResultsTable),
		KeyConditionExpression:    expr.KeyCondition(),
		ExpressionAttributeNames:  expr.Names(),
		ExpressionAttributeValues: expr.Values(),
		ScanIndexForward:          aws.Bool(false), // Most recent first
		Limit:                     limit32,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to query ping results: %w", err)
	}

	var results []models.PingResult
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &results); err != nil {
		return nil, fmt.Errorf("failed to unmarshal ping results: %w", err)
	}
	return results, nil
}

// SaveIncident creates or updates an incident.
func (d *DynamoStore) SaveIncident(ctx context.Context, inc models.Incident) error {
	av, err := attributevalue.MarshalMap(inc)
	if err != nil {
		return fmt.Errorf("failed to marshal incident: %w", err)
	}

	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.incidentsTable),
		Item:      av,
	})
	if err != nil {
		return fmt.Errorf("failed to put incident: %w", err)
	}
	return nil
}

// GetOpenIncident finds any incident with resolvedAt = null.
func (d *DynamoStore) GetOpenIncident(ctx context.Context, endpointID string) (*models.Incident, error) {
	incidents, err := d.ListIncidents(ctx, endpointID)
	if err != nil {
		return nil, err
	}
	for _, inc := range incidents {
		if inc.ResolvedAt == nil {
			return &inc, nil
		}
	}
	return nil, nil
}

// ListIncidents returns all incidents for an endpoint.
func (d *DynamoStore) ListIncidents(ctx context.Context, endpointID string) ([]models.Incident, error) {
	keyCond := expression.Key("endpointId").Equal(expression.Value(endpointID))
	expr, err := expression.NewBuilder().WithKeyCondition(keyCond).Build()
	if err != nil {
		return nil, fmt.Errorf("failed to build expression: %w", err)
	}

	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:                 aws.String(d.incidentsTable),
		KeyConditionExpression:    expr.KeyCondition(),
		ExpressionAttributeNames:  expr.Names(),
		ExpressionAttributeValues: expr.Values(),
		ScanIndexForward:          aws.Bool(false),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to query incidents: %w", err)
	}

	var list []models.Incident
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &list); err != nil {
		return nil, fmt.Errorf("failed to unmarshal incidents: %w", err)
	}
	return list, nil
}
