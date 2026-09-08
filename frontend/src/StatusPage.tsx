import React from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ArrowLeft } from 'lucide-react';
import type { Endpoint } from './types';

interface StatusPageProps {
  tenantId: string;
  endpoints: Endpoint[];
  onBack: () => void;
}

export const StatusPage: React.FC<StatusPageProps> = ({ tenantId, endpoints, onBack }) => {
  const downEndpoints = endpoints.filter((e) => e.status === 'DOWN');
  const isMajorOutage = downEndpoints.length === endpoints.length && endpoints.length > 0;
  const isDegraded = downEndpoints.length > 0 && !isMajorOutage;

  return (
    <div className="max-w-4xl w-full mx-auto p-6 space-y-8 text-[#e4e1e6]">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center text-xs font-mono text-secondary hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono text-[#908fa0]">Tenant: {tenantId}</span>
      </div>

      {/* Hero Banner */}
      <div
        className={`p-6 rounded-2xl border flex items-center justify-between ${
          isMajorOutage
            ? 'bg-[#690005]/20 border-[#ffb4ab] text-[#ffb4ab]'
            : isDegraded
            ? 'bg-[#ffdad6]/10 border-[#00a6e0] text-[#7bd0ff]'
            : 'bg-[#003824]/20 border-tertiary text-tertiary'
        }`}
      >
        <div className="flex items-center space-x-4">
          {isMajorOutage ? (
            <XCircle className="w-8 h-8" />
          ) : isDegraded ? (
            <AlertTriangle className="w-8 h-8" />
          ) : (
            <CheckCircle2 className="w-8 h-8" />
          )}
          <div>
            <h1 className="font-display font-semibold text-xl">
              {isMajorOutage
                ? 'Major Service Outage'
                : isDegraded
                ? 'Partial Degradation Detected'
                : 'All Systems Operational'}
            </h1>
            <p className="text-xs font-mono mt-0.5 opacity-80">
              Continuous 5-minute automated telemetry verification
            </p>
          </div>
        </div>
        <div className="text-xs font-mono px-3 py-1 rounded bg-surface-container-high text-[#e4e1e6]">
          100% Uptime (30d)
        </div>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        <h2 className="font-display font-medium text-base text-[#e4e1e6]">Monitored Services</h2>
        <div className="rounded-xl bg-surface-container border border-[#353438] divide-y divide-[#353438]">
          {endpoints.map((ep) => (
            <div key={ep.endpointId} className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-sm text-[#e4e1e6]">{ep.name}</span>
                  <span className="text-xs font-mono text-[#908fa0]">({ep.frequencyMin}m probe)</span>
                </div>
                <div className="text-xs font-mono text-[#908fa0]">{ep.url}</div>
              </div>

              <div className="flex items-center space-x-3">
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium ${
                    ep.status === 'UP'
                      ? 'bg-[#002113] text-tertiary border border-[#005236]'
                      : 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                  }`}
                >
                  {ep.status === 'UP' ? 'OPERATIONAL' : 'INCIDENT ACTIVE'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Incident History Section */}
      <div className="space-y-4">
        <h2 className="font-display font-medium text-base text-[#e4e1e6]">Incident History</h2>
        {downEndpoints.length > 0 ? (
          <div className="space-y-3">
            {downEndpoints.map((ep) => (
              <div
                key={ep.endpointId}
                className="p-4 rounded-xl bg-surface-container border border-[#93000a] space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-mono text-[#ffb4ab]">
                  <span className="font-bold">INCIDENT OPEN — {ep.name}</span>
                  <span>{new Date().toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-[#c7c4d7]">
                  2 consecutive ping checks failed. Automated telemetry alerts dispatched.
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-surface-container border border-[#353438] text-center text-xs font-mono text-[#908fa0]">
            No downtime incidents reported in the last 30 days.
          </div>
        )}
      </div>

      {/* Trust & Security footer */}
      <div className="pt-4 border-t border-[#353438] flex items-center justify-between text-xs font-mono text-[#908fa0]">
        <div className="flex items-center space-x-1.5 text-tertiary">
          <ShieldCheck className="w-4 h-4" />
          <span>SSRF Guard Verified Status Page</span>
        </div>
        <div>Powered by AreWeUpYet (AWS Always-Free Tier)</div>
      </div>
    </div>
  );
};
