import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Duration } from 'aws-cdk-lib';

export class DispatcherMonitoring extends Construct {
  public readonly errorAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Free tier status: Always-Free tier (AWS provides 10 free CloudWatch metric alarms).
    // Monitors the dispatcher Lambda error metric across 5-minute evaluation periods.
    const errorMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensionsMap: {
        FunctionName: 'AreWeUpYet-Dispatcher',
      },
      period: Duration.minutes(5),
      statistic: 'Sum',
    });

    this.errorAlarm = new cloudwatch.Alarm(this, 'DispatcherErrorAlarm', {
      alarmName: 'AreWeUpYet-Dispatcher-Errors',
      alarmDescription: 'Alerts if dispatcher fails or errors during polling execution',
      metric: errorMetric,
      threshold: 2,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
