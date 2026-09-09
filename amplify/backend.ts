import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { DynamoDbTables } from './data/dynamodb';
import { LambdaFunctions } from './functions/lambdas';
import { DispatcherMonitoring } from './monitoring/alarms';
import { FreeTierBudget } from './monitoring/budget';

/**
 * AreWeUpYet Amplify Gen 2 Backend Definition
 * Free tier status notes:
 * - Auth (Cognito): Always-free up to 50k MAUs.
 * - Compute (Go Lambdas): Always-free up to 1M invocations / 3.2M seconds compute per month.
 * - Storage (DynamoDB): Always-free up to 25 GB storage and 25 RCU / 25 WCU.
 * - Network (Function URLs): No API Gateway charges.
 * - Monitoring (CloudWatch): 10 metric alarms Always-Free.
 * - Budget Safety Alert: $1.00 threshold notification via AWS Budgets (2 free budgets).
 */
export const backend = defineBackend({
  auth,
});

// Custom CDK DynamoDB stack (Always-Free tier DynamoDB tables)
const dataStack = backend.createStack('DynamoDbStack');
const dataTables = new DynamoDbTables(dataStack, 'AreWeUpYetData');

// Custom CDK Go Lambda functions (Dispatcher, Private API, Public API, Notifier)
const functionsStack = backend.createStack('FunctionsStack');
new LambdaFunctions(functionsStack, 'AreWeUpYetFunctions', {
  endpointsTable: dataTables.endpointsTable,
  pingResultsTable: dataTables.pingResultsTable,
  incidentsTable: dataTables.incidentsTable,
});

// Watch the watcher: CloudWatch alarm on dispatcher failure
new DispatcherMonitoring(backend.createStack('MonitoringStack'), 'AreWeUpYetMonitoring');

// Enforce AWS Free Tier budget safety alert
new FreeTierBudget(backend.createStack('BudgetStack'), 'AreWeUpYetBudget');


