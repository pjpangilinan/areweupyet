import type { Endpoint } from '../types';

const API_BASE = 'http://localhost:8080';

export interface PublicStatusResponse {
  tenantId: string;
  systemStatus: 'OPERATIONAL' | 'DEGRADED' | 'MAJOR_OUTAGE';
  endpoints: Array<{
    endpointId: string;
    name: string;
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

export async function fetchEndpoints(token?: string): Promise<Endpoint[]> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/endpoints`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch endpoints: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('API fetchEndpoints failed, falling back to local state:', err);
    throw err;
  }
}

export async function createEndpoint(
  input: {
    name: string;
    url: string;
    frequencyMin: number;
    timeoutSec?: number;
    expectedStatus?: number;
  },
  token?: string
): Promise<Endpoint> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/endpoints`, {
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

export async function deleteEndpoint(endpointId: string, token?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/endpoints/${endpointId}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete endpoint: ${res.statusText}`);
  }
}

export async function fetchPublicStatus(tenantId: string): Promise<PublicStatusResponse> {
  const res = await fetch(`${API_BASE}/status/${tenantId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch public status: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchEndpointHistory(
  tenantId: string,
  endpointId: string
): Promise<EndpointHistoryResponse> {
  const res = await fetch(`${API_BASE}/status/${tenantId}/endpoints/${endpointId}/history`);
  if (!res.ok) {
    throw new Error(`Failed to fetch endpoint history: ${res.statusText}`);
  }
  return res.json();
}
