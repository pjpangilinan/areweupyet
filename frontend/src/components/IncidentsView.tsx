import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import type { Endpoint } from '../types';

interface IncidentRecord {
  id: string;
  endpointId: string;
  endpointName: string;
  url: string;
  status: 'ACTIVE' | 'RESOLVED';
  startedAt: string;
  resolvedAt?: string;
  duration: string;
  rootCause: string;
  signature: string;
}

interface IncidentsViewProps {
  endpoints: Endpoint[];
  onTriggerSimulatedCheck?: () => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({ endpoints }) => {
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');

  const [incidents] = useState<IncidentRecord[]>([
    {
      id: 'inc-9021',
      endpointId: 'ep-api',
      endpointName: 'Telemetry Ingest Gateway',
      url: 'https://api.example.com/v1/ping',
      status: 'RESOLVED',
      startedAt: new Date(Date.now() - 3600000 * 26).toISOString(),
      resolvedAt: new Date(Date.now() - 3600000 * 25.8).toISOString(),
      duration: '12m 14s',
      rootCause: 'HTTP 504 Gateway Timeout during database rolling deployment',
      signature: 'sha256=4f2a7e9b01c3...8d1',
    },
    {
      id: 'inc-8842',
      endpointId: 'ep-auth',
      endpointName: 'Authentication Service',
      url: 'https://auth.example.com/health',
      status: 'RESOLVED',
      startedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      resolvedAt: new Date(Date.now() - 86400000 * 2.95).toISOString(),
      duration: '4m 02s',
      rootCause: 'Connection refused: upstream pod crashed with OOMKilled',
      signature: 'sha256=9b3c1d7e2a...5a0',
    },
    {
      id: 'inc-8120',
      endpointId: 'ep-billing',
      endpointName: 'Billing Webhook Worker',
      url: 'https://billing.example.com/events',
      status: 'RESOLVED',
      startedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      resolvedAt: new Date(Date.now() - 86400000 * 6.98).toISOString(),
      duration: '28m 30s',
      rootCause: 'TCP Handshake Timeout (> 15s) during edge network maintenance',
      signature: 'sha256=1e5d8a9f4c...7b2',
    },
  ]);

  const activeIncidents = incidents.filter((i) => i.status === 'ACTIVE');
  const filtered = incidents.filter((i) => {
    if (filter === 'ACTIVE') return i.status === 'ACTIVE';
    if (filter === 'RESOLVED') return i.status === 'RESOLVED';
    return true;
  });

  return (
    <div className="space-y-6 text-[#e4e1e6]">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-xl text-[#e4e1e6]">
            Incident Command & Downtime Telemetry
          </h2>
          <p className="text-xs font-mono text-[#908fa0]">
            Autonomous outage detection, consecutive failure evaluation, and webhook audit log
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-surface-container border border-[#353438] text-xs font-mono text-tertiary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
            <span>Telemetry Dispatcher Active ({endpoints.length} Monitored)</span>
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-container-low border border-[#353438]">
          <div className="text-xs font-mono text-[#908fa0] flex items-center justify-between">
            <span>ACTIVE OUTAGES</span>
            <AlertTriangle className="w-4 h-4 text-tertiary" />
          </div>
          <div className="font-display text-2xl font-semibold mt-1">
            {activeIncidents.length}
          </div>
          <div className="text-[11px] font-mono text-tertiary mt-0.5">
            {activeIncidents.length === 0 ? 'Zero active incidents' : 'Requires immediate attention'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low border border-[#353438]">
          <div className="text-xs font-mono text-[#908fa0] flex items-center justify-between">
            <span>30-DAY UPTIME</span>
            <CheckCircle2 className="w-4 h-4 text-tertiary" />
          </div>
          <div className="font-display text-2xl font-semibold mt-1 text-tertiary">
            99.94%
          </div>
          <div className="text-[11px] font-mono text-[#908fa0] mt-0.5">
            14.2 minutes total downtime
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low border border-[#353438]">
          <div className="text-xs font-mono text-[#908fa0] flex items-center justify-between">
            <span>AVG RESOLUTION (MTTR)</span>
            <Clock className="w-4 h-4 text-secondary" />
          </div>
          <div className="font-display text-2xl font-semibold mt-1 text-secondary">
            8m 15s
          </div>
          <div className="text-[11px] font-mono text-[#908fa0] mt-0.5">
            Auto-closed on 1st healthy ping
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low border border-[#353438]">
          <div className="text-xs font-mono text-[#908fa0] flex items-center justify-between">
            <span>ALERTS DISPATCHED</span>
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div className="font-display text-2xl font-semibold mt-1 text-primary">
            6 Alerts
          </div>
          <div className="text-[11px] font-mono text-[#908fa0] mt-0.5">
            HMAC-SHA256 authenticated
          </div>
        </div>
      </div>

      {/* Incident Records Table */}
      <div className="rounded-xl bg-surface-container-low border border-[#353438] overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-[#353438] flex items-center justify-between bg-surface-container/50">
          <div className="flex items-center gap-2">
            <span className="font-display font-medium text-sm text-[#e4e1e6]">Historical Incident Timeline</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-[#c7c4d7]">
              {filtered.length} Recorded
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-surface-container-high p-0.5 text-xs font-mono">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'ALL'
                    ? 'bg-surface-container-lowest text-primary font-medium'
                    : 'text-[#908fa0] hover:text-[#e4e1e6]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'ACTIVE'
                    ? 'bg-surface-container-lowest text-error font-medium'
                    : 'text-[#908fa0] hover:text-[#e4e1e6]'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setFilter('RESOLVED')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'RESOLVED'
                    ? 'bg-surface-container-lowest text-tertiary font-medium'
                    : 'text-[#908fa0] hover:text-[#e4e1e6]'
                }`}
              >
                Resolved
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-[#353438]">
          {filtered.map((inc) => (
            <div
              key={inc.id}
              className="p-4 hover:bg-surface-container/60 transition-colors space-y-2.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                      inc.status === 'ACTIVE'
                        ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                        : 'bg-[#002113] text-tertiary border border-[#005236]'
                    }`}
                  >
                    {inc.status}
                  </span>
                  <span className="font-medium text-sm text-[#e4e1e6]">{inc.endpointName}</span>
                  <span className="text-xs font-mono text-[#908fa0]">{inc.url}</span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-[#908fa0]">
                  <span>Duration: <strong className="text-[#e4e1e6]">{inc.duration}</strong></span>
                  <span>{new Date(inc.startedAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-lowest/80 border border-[#353438] text-xs font-mono space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[#c7c4d7]">{inc.rootCause}</span>
                  <span className="text-[11px] text-secondary flex-shrink-0 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{inc.signature}</span>
                  </span>
                </div>
                <div className="text-[10px] text-[#908fa0] flex items-center gap-3">
                  <span>Trigger: 2 consecutive non-2xx responses</span>
                  <span>•</span>
                  <span>Closed by: 1 successful check</span>
                  <span>•</span>
                  <span>Webhook Dispatched (HTTP 200 OK)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
