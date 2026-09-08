import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export class DynamoDbTables extends Construct {
  public readonly endpointsTable: dynamodb.Table;
  public readonly pingResultsTable: dynamodb.Table;
  public readonly incidentsTable: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Free tier status: Always-Free tier (up to 25 GB storage and 25 RCU/WCU).
    this.endpointsTable = new dynamodb.Table(this, 'EndpointsTable', {
      tableName: 'AreWeUpYet-Endpoints',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'endpointId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // GSI for polling dispatcher: query statusBucket="ACTIVE" AND nextCheckAt <= now
    this.endpointsTable.addGlobalSecondaryIndex({
      indexName: 'DueCheck',
      partitionKey: { name: 'statusBucket', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'nextCheckAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Free tier status: Always-Free tier. TTL attribute 'ttl' auto-expires old pings to stay under 25GB ceiling.
    this.pingResultsTable = new dynamodb.Table(this, 'PingResultsTable', {
      tableName: 'AreWeUpYet-PingResults',
      partitionKey: { name: 'endpointId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'checkedAt', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Free tier status: Always-Free tier. Incidents retained indefinitely for historical uptime calculation.
    this.incidentsTable = new dynamodb.Table(this, 'IncidentsTable', {
      tableName: 'AreWeUpYet-Incidents',
      partitionKey: { name: 'endpointId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'startedAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
