import type { Endpoint } from '../types';
import outputs from '../amplify_outputs.json';

const PRIVATE_API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  (outputs.custom?.privateApiUrl as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:8080';

const PUBLIC_API_BASE =
  (import.meta.env.VITE_PUBLIC_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  (outputs.custom?.publicApiUrl as string | undefined)?.replace(/\/+$/, '') ||
  PRIVATE_API_BASE;

export interface PublicStatusResponse {
  tenantId: string;
  systemStatus: 'OPERATIONAL' | 'DEGRADED' | 'MAJOR_OUTAGE';
  endpoints: Array<{
    endpointId: string;
    name: string;
    url?: string;
    group?: string;
    frequencyMin?: number;
    status: 'UP' | 'DOWN' | 'PENDING';
    lastCheckedAt?: string;
    incidentCount?: number;
  }>;
}

export interface PingResult {
  endpointId: string;
  checkedAt: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface EndpointHistoryResponse {
  endpointId: string;
  uptime24h: {
    totalWindowSeconds: number;
    downtimeSeconds: number;
    uptimePercentage: number;
    formattedUptime: string;
    incidentCount: number;
  };
  uptime7d: {
    totalWindowSeconds: number;
    downtimeSeconds: number;
    uptimePercentage: number;
    formattedUptime: string;
    incidentCount: number;
  };
  uptime30d: {
    totalWindowSeconds: number;
    downtimeSeconds: number;
    uptimePercentage: number;
    formattedUptime: string;
    incidentCount: number;
  };
  timeline: Array<{
    incidentId: string;
    startedAt: string;
    resolvedAt?: string;
    duration: string;
    status: string;
    reason: string;
  }>;
  recentPings: PingResult[];
}

export async function fetchEndpoints(token?: string, tenantId?: string): Promise<Endpoint[]> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    const res = await fetch(`${PRIVATE_API_BASE}/endpoints`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch endpoints: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('API fetchEndpoints failed:', err);
    throw err;
  }
}

export async function createEndpoint(
  input: {
    name: string;
    url: string;
    group?: string;
    frequencyMin: number;
    timeoutSec?: number;
    expectedStatus?: number;
  },
  token?: string,
  tenantId?: string
): Promise<Endpoint> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }

  const res = await fetch(`${PRIVATE_API_BASE}/endpoints`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `Failed to create endpoint (${res.status})`);
  }

  return res.json();
}

export async function deleteEndpoint(endpointId: string, token?: string, tenantId?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }

  const res = await fetch(`${PRIVATE_API_BASE}/endpoints/${endpointId}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete endpoint: ${res.statusText}`);
  }
}

export async function fetchPublicStatus(tenantId: string): Promise<PublicStatusResponse> {
  const res = await fetch(`${PUBLIC_API_BASE}/status/${tenantId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch public status: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchEndpointHistory(
  tenantId: string,
  endpointId: string
): Promise<EndpointHistoryResponse> {
  const res = await fetch(`${PUBLIC_API_BASE}/status/${tenantId}/endpoints/${endpointId}/history`);
  if (!res.ok) {
    throw new Error(`Failed to fetch endpoint history: ${res.statusText}`);
  }
  return res.json();
}

export interface ManualCheckResponse {
  result: {
    endpointId: string;
    checkedAt: string;
    statusCode: number;
    latencyMs: number;
    success: boolean;
    errorMessage?: string;
  };
  endpoint: Endpoint;
  incidentStateChanged: boolean;
}

export async function triggerManualCheck(
  endpointId: string,
  token?: string,
  tenantId?: string
): Promise<ManualCheckResponse> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  const res = await fetch(`${PRIVATE_API_BASE}/endpoints/${endpointId}/check`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      throw new Error(data.error || 'Rate limit: Please wait 30 seconds between manual checks.');
    }
    throw new Error(data.error || `Failed to run check: ${res.statusText}`);
  }

  return res.json();
}

export interface WebhookTestResponse {
  success: boolean;
  message: string;
  event: string;
  signatureSent: string;
}

export async function testWebhook(
  url: string,
  secret?: string,
  token?: string,
  tenantId?: string
): Promise<WebhookTestResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  const res = await fetch(`${PRIVATE_API_BASE}/settings/webhook/test`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, secret }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Webhook test failed: ${res.statusText}`);
  }

  return res.json();
}

