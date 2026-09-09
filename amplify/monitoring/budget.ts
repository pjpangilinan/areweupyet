import { Construct } from 'constructs';
import * as budgets from 'aws-cdk-lib/aws-budgets';

/**
 * FreeTierBudget enforces a hard early-warning safety net in AWS.
 * If spending reaches or is forecasted to reach even $1.00, AWS sends an immediate alert.
 */
export class FreeTierBudget extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Free tier status: AWS Budgets allows 2 free budgets per account.
    new budgets.CfnBudget(this, 'AlwaysFreeBudget', {
      budget: {
        budgetName: 'AreWeUpYet-FreeTier-SafetyAlert',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 1, // .00 USD safety threshold
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'ACTUAL',
            threshold: 100, // 100% of .00 (.00 actual spend)
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              address: 'admin@areweupyet.com',
              subscriptionType: 'EMAIL',
            },
          ],
        },
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'FORECASTED',
            threshold: 100, // 100% of .00 (.00 forecasted spend)
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              address: 'admin@areweupyet.com',
              subscriptionType: 'EMAIL',
            },
          ],
        },
      ],
    });
  }
}
