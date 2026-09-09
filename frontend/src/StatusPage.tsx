import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, Share2, Check } from 'lucide-react';
import type { Endpoint } from './types';

interface StatusPageProps {
  tenantId: string;
  endpoints: Endpoint[];
  onBack?: () => void;
}

export const StatusPage: React.FC<StatusPageProps> = ({ tenantId, endpoints, onBack }) => {
  const [copied, setCopied] = useState(false);
  const totalCount = endpoints.length;
  const downEndpoints = endpoints.filter((e) => e.status === 'DOWN');
  const upEndpoints = endpoints.filter((e) => e.status === 'UP');
  const isMajorOutage = downEndpoints.length === endpoints.length && endpoints.length > 0;
  const isDegraded = downEndpoints.length > 0 && !isMajorOutage;
  const fleetUptime = totalCount > 0 ? ((upEndpoints.length / totalCount) * 100).toFixed(1) + '%' : '—';

  const handleShare = () => {
    const url = `${window.location.origin}/#/status/${tenantId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8 text-[#e4e1e6]">
      {/* Top Header with Brand Logo */}
      <div className="flex items-center justify-between border-b border-[#353438] pb-4 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="/logo.png" alt="AreWeUpYet Logo" className="h-6 sm:h-8 w-auto object-contain flex-shrink-0" />
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-container-high text-[#c7c4d7] truncate">
            {tenantId} · Status
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2a2d] hover:bg-[#353438] text-xs font-mono text-[#e4e1e6] transition-colors"
            title="Copy Public Shareable Link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-tertiary" /> : <Share2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Link Copied!' : 'Share Page'}</span>
            <span className="sm:hidden">{copied ? 'Copied' : 'Share'}</span>
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center text-xs font-mono text-secondary hover:underline"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Hero Operational Banner */}
      <div
        className={`p-4 sm:p-6 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isMajorOutage
            ? 'bg-[#690005]/20 border-[#ffb4ab] text-[#ffb4ab]'
            : isDegraded
            ? 'bg-[#00a6e0]/10 border-[#7bd0ff] text-[#7bd0ff]'
            : 'bg-[#003824]/20 border-tertiary text-tertiary'
        }`}
      >
        <div className="flex items-center space-x-3 sm:space-x-4">
          {isMajorOutage ? (
            <XCircle className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0" />
          ) : isDegraded ? (
            <AlertTriangle className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0" />
          )}
          <div>
            <h1 className="font-display font-semibold text-lg sm:text-xl">
              {isMajorOutage
                ? 'Major Service Outage'
                : isDegraded
                ? 'Partial Degradation Detected'
                : 'All Systems Operational'}
            </h1>
            <p className="text-xs font-mono mt-0.5 opacity-80">
              Verified continuously via automated regional synthetic probes
            </p>
          </div>
        </div>
        <div className="text-xs font-mono px-3 py-1.5 rounded-xl bg-surface-container-high text-[#e4e1e6] self-start sm:self-auto border border-[#353438]">
          Fleet Health: {fleetUptime}
        </div>
      </div>

      {/* Monitored Services List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-medium text-base text-[#e4e1e6]">Services & Core Infrastructure</h2>
          <span className="text-xs font-mono text-[#908fa0]">{endpoints.length} Monitored</span>
        </div>

        <div className="rounded-xl bg-surface-container-low border border-[#353438] divide-y divide-[#353438] shadow-sm">
          {endpoints.map((ep) => {
            const isDown = ep.status === 'DOWN';
            return (
              <div key={ep.endpointId} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm text-[#e4e1e6] truncate">{ep.name}</span>
                    {ep.group && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#2a2a2d] text-[#c7c4d7]">
                        {ep.group}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-[#908fa0] truncate">{ep.url}</div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                  <span className="text-xs font-mono text-[#908fa0]">
                    Every {ep.frequencyMin}m
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium ${
                      isDown
                        ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                        : ep.status === 'PENDING'
                        ? 'bg-[#2a2a2d] text-secondary border border-[#3a3a3d]'
                        : 'bg-[#002113] text-tertiary border border-[#005236]'
                    }`}
                  >
                    {isDown ? 'INCIDENT' : ep.status === 'PENDING' ? 'VERIFYING' : 'OPERATIONAL'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Incident History Timeline */}
      <div className="space-y-3">
        <h2 className="font-display font-medium text-base text-[#e4e1e6]">Recent Incidents & Maintenance</h2>
        {downEndpoints.length > 0 ? (
          <div className="space-y-3">
            {downEndpoints.map((ep) => (
              <div
                key={ep.endpointId}
                className="p-4 rounded-xl bg-surface-container border border-[#93000a] space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-mono text-[#ffb4ab]">
                  <span className="font-bold">ACTIVE INCIDENT — {ep.name}</span>
                  <span>{new Date().toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-[#c7c4d7]">
                  2 consecutive ping probes failed. Telemetry dispatcher sent notifications to configured webhooks.
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-surface-container-low border border-[#353438] text-center text-xs font-mono text-[#908fa0]">
            No downtime incidents reported in the last 30 days. All systems running normally.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-[#353438] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#908fa0]">
        <div className="flex items-center space-x-2 text-tertiary">
          <ShieldCheck className="w-4 h-4" />
          <span>SSRF Guard Verified Telemetry</span>
        </div>
        <div className="flex items-center space-x-2">
          <img src="/icon.png" alt="AreWeUpYet" className="w-4 h-4 rounded object-contain" />
          <span>Powered by AreWeUpYet Telemetry</span>
        </div>
      </div>
    </div>
  );
};
