export interface Endpoint {
  tenantId: string;
  endpointId: string;
  name: string;
  url: string;
  frequencyMin: number;
  timeoutSec: number;
  expectedStatus: number;
  status: 'UP' | 'DOWN' | 'PENDING';
  group?: string;
  nextCheckAt: string;
  consecutiveFail: number;
  createdAt: string;
  updatedAt: string;
}

export interface PingResult {
  endpointId: string;
  checkedAt: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface Incident {
  endpointId: string;
  startedAt: string;
  resolvedAt?: string;
  durationSeconds: number;
  reason: string;
}
