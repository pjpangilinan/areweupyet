import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { DynamoDbTables } from './data/dynamodb';

/**
 * AreWeUpYet Amplify Gen 2 Backend Definition
 * Free tier status notes:
 * - Auth (Cognito): Always-free up to 50k MAUs.
 * - Compute (Go Lambdas): Always-free up to 1M invocations / 3.2M seconds compute per month.
 * - Storage (DynamoDB): Always-free up to 25 GB storage and 25 RCU / 25 WCU.
 * - Network (Function URLs): No API Gateway charges.
 */
export const backend = defineBackend({
  auth,
});

// Custom CDK DynamoDB stack (Always-Free tier DynamoDB tables)
new DynamoDbTables(backend.createStack('DynamoDbStack'), 'AreWeUpYetData');
