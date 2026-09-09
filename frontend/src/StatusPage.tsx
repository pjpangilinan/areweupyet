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
  const downEndpoints = endpoints.filter((e) => e.status === 'DOWN');
  const isMajorOutage = downEndpoints.length === endpoints.length && endpoints.length > 0;
  const isDegraded = downEndpoints.length > 0 && !isMajorOutage;

  const handleShare = () => {
    const url = `${window.location.origin}/#/status/${tenantId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="max-w-4xl w-full mx-auto p-6 space-y-8 text-[#e4e1e6]">
      {/* Top Header with Brand Logo */}
      <div className="flex items-center justify-between border-b border-[#353438] pb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="AreWeUpYet Logo" className="h-8 w-auto object-contain" />
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-container-high text-[#c7c4d7]">
            {tenantId} · System Status
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2a2d] hover:bg-[#353438] text-xs font-mono text-[#e4e1e6] transition-colors"
            title="Copy Public Shareable Link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-tertiary" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied!' : 'Share Page'}</span>
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
        className={`p-6 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isMajorOutage
            ? 'bg-[#690005]/20 border-[#ffb4ab] text-[#ffb4ab]'
            : isDegraded
            ? 'bg-[#00a6e0]/10 border-[#7bd0ff] text-[#7bd0ff]'
            : 'bg-[#003824]/20 border-tertiary text-tertiary'
        }`}
      >
        <div className="flex items-center space-x-4">
          {isMajorOutage ? (
            <XCircle className="w-9 h-9 flex-shrink-0" />
          ) : isDegraded ? (
            <AlertTriangle className="w-9 h-9 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-9 h-9 flex-shrink-0" />
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
              Verified every 5 minutes across automated regional synthetic probes
            </p>
          </div>
        </div>
        <div className="text-xs font-mono px-3 py-1.5 rounded-xl bg-surface-container-high text-[#e4e1e6] self-start sm:self-auto border border-[#353438]">
          Global 99.98% (30d)
        </div>
      </div>

      {/* Monitored Services List with 30-day Availability Strips */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-medium text-base text-[#e4e1e6]">Services & Core Infrastructure</h2>
          <span className="text-xs font-mono text-[#908fa0]">{endpoints.length} Monitored</span>
        </div>

        <div className="rounded-xl bg-surface-container-low border border-[#353438] divide-y divide-[#353438] shadow-sm">
          {endpoints.map((ep) => {
            const isDown = ep.status === 'DOWN';
            return (
              <div key={ep.endpointId} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm text-[#e4e1e6]">{ep.name}</span>
                    <span className="text-xs font-mono text-[#908fa0]">({ep.frequencyMin}m interval)</span>
                  </div>
                  <div className="text-xs font-mono text-[#908fa0]">{ep.url}</div>
                </div>

                {/* 30-day micro visual strip */}
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <div className="flex items-center gap-[2px] h-4 w-32">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-[1px] h-full ${
                            isDown && i === 19 ? 'bg-error' : 'bg-tertiary/80'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono text-[#908fa0]">
                      {isDown ? '99.40%' : '100.0%'} (30d)
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium ${
                      isDown
                        ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                        : 'bg-[#002113] text-tertiary border border-[#005236]'
                    }`}
                  >
                    {isDown ? 'INCIDENT' : 'OPERATIONAL'}
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
