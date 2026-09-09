import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Duration, CfnOutput } from 'aws-cdk-lib';

export interface LambdaFunctionsProps {
  endpointsTable: dynamodb.ITable;
  pingResultsTable: dynamodb.ITable;
  incidentsTable: dynamodb.ITable;
}

export class LambdaFunctions extends Construct {
  public readonly dispatcherFn: lambda.Function;
  public readonly apiPrivateFn: lambda.Function;
  public readonly apiPublicFn: lambda.Function;
  public readonly notifierFn: lambda.Function;
  public readonly apiPrivateUrl: lambda.FunctionUrl;
  public readonly apiPublicUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
    super(scope, id);

    const commonEnv = {
      ENDPOINTS_TABLE: props.endpointsTable.tableName,
      PING_RESULTS_TABLE: props.pingResultsTable.tableName,
      INCIDENTS_TABLE: props.incidentsTable.tableName,
    };

    // 1. Dispatcher Function (ticks every 1 min via EventBridge)
    // Free tier status: Always-Free tier (128MB memory, runs ~1s per invocation = well under 3.2M sec/mo).
    this.dispatcherFn = new lambda.Function(this, 'DispatcherFunction', {
      functionName: 'AreWeUpYet-Dispatcher',
      description: 'Continuous synthetic uptime polling dispatcher',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.X86_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset('dist/dispatcher'),
      memorySize: 128,
      timeout: Duration.seconds(55),
      environment: commonEnv,
    });

    // 2. Private Authenticated API Function (Lambda Function URL, Cognito authenticated)
    // Free tier status: Always-Free tier (Lambda Function URL has $0 separate charge vs API Gateway).
    this.apiPrivateFn = new lambda.Function(this, 'ApiPrivateFunction', {
      functionName: 'AreWeUpYet-ApiPrivate',
      description: 'Private tenant CRUD API for uptime monitors and manual check triggers',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.X86_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset('dist/api-private'),
      memorySize: 128,
      timeout: Duration.seconds(15),
      environment: commonEnv,
    });

    this.apiPrivateUrl = this.apiPrivateFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE, // Handler verifies Cognito JWT session token
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [
          lambda.HttpMethod.GET,
          lambda.HttpMethod.POST,
          lambda.HttpMethod.PUT,
          lambda.HttpMethod.DELETE,
        ],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
      },
    });

    // 3. Public Status API Function (Lambda Function URL, unauthenticated public read)
    // Free tier status: Always-Free tier.
    this.apiPublicFn = new lambda.Function(this, 'ApiPublicFunction', {
      functionName: 'AreWeUpYet-ApiPublic',
      description: 'Public read API for status pages and incident history',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.X86_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset('dist/api-public'),
      memorySize: 128,
      timeout: Duration.seconds(10),
      environment: commonEnv,
    });

    this.apiPublicUrl = this.apiPublicFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
      },
    });

    // 4. Webhook Notifier Function
    // Free tier status: Always-Free tier.
    this.notifierFn = new lambda.Function(this, 'NotifierFunction', {
      functionName: 'AreWeUpYet-Notifier',
      description: 'Asynchronous webhook delivery with HMAC signature',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.X86_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset('dist/notifier'),
      memorySize: 128,
      timeout: Duration.seconds(30),
      environment: commonEnv,
    });

    // EventBridge 1-minute rate trigger for Dispatcher
    // Free tier status: Always-Free tier (EventBridge custom rules).
    const dispatcherSchedule = new events.Rule(this, 'DispatcherScheduleRule', {
      ruleName: 'AreWeUpYet-Dispatcher-EveryMinute',
      description: 'Fires dispatcher synthetic check polling every 1 minute',
      schedule: events.Schedule.rate(Duration.minutes(1)),
    });
    dispatcherSchedule.addTarget(new targets.LambdaFunction(this.dispatcherFn));

    // Grant DynamoDB Table Permissions (least privilege)
    props.endpointsTable.grantReadWriteData(this.dispatcherFn);
    props.pingResultsTable.grantWriteData(this.dispatcherFn);
    props.incidentsTable.grantReadWriteData(this.dispatcherFn);

    props.endpointsTable.grantReadWriteData(this.apiPrivateFn);
    props.pingResultsTable.grantReadWriteData(this.apiPrivateFn);
    props.incidentsTable.grantReadWriteData(this.apiPrivateFn);

    props.endpointsTable.grantReadData(this.apiPublicFn);
    props.pingResultsTable.grantReadData(this.apiPublicFn);
    props.incidentsTable.grantReadData(this.apiPublicFn);

    // Outputs for Amplify deployment
    new CfnOutput(this, 'PrivateApiUrl', {
      value: this.apiPrivateUrl.url,
      description: 'Function URL for authenticated tenant operations',
    });

    new CfnOutput(this, 'PublicApiUrl', {
      value: this.apiPublicUrl.url,
      description: 'Function URL for public status page and incident telemetry',
    });
  }
}
