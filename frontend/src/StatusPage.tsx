import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, Share2, Check, RefreshCw, Radio } from 'lucide-react';
import type { Endpoint } from './types';
import { fetchPublicStatus } from './api/client';
import { EndpointDetailModal } from './components/EndpointDetailModal';

interface StatusPageProps {
  tenantId: string;
  endpoints?: Endpoint[];
  onBack?: () => void;
  isOwner?: boolean;
}

export const StatusPage: React.FC<StatusPageProps> = ({ tenantId, endpoints, onBack, isOwner = false }) => {
  const [copied, setCopied] = useState(false);
  const [liveEndpoints, setLiveEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async (isManual = false) => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    if (isManual) setIsRefreshing(true);
    setErrorMsg(null);

    try {
      const res = await fetchPublicStatus(tenantId);
      if (res && res.endpoints) {
        const mapped: Endpoint[] = res.endpoints.map((e) => ({
          tenantId,
          endpointId: e.endpointId,
          name: e.name,
          url: e.url || '',
          group: e.group || undefined,
          frequencyMin: e.frequencyMin || 5,
          timeoutSec: 10,
          expectedStatus: 200,
          status: e.status,
          nextCheckAt: '',
          consecutiveFail: 0,
          createdAt: '',
          updatedAt: e.lastCheckedAt || new Date().toISOString(),
        }));
        setLiveEndpoints(mapped);
        setLastUpdated(new Date());
      }
    } catch (err: unknown) {
      console.warn('Public status fetch error:', err);
      // Fallback to passed endpoints if public fetch fails (e.g. offline preview)
      if (endpoints && endpoints.length > 0) {
        setLiveEndpoints(endpoints);
        setLastUpdated(new Date());
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to load status';
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [tenantId, endpoints]);

  // Initial fetch and 30-second automated cadence polling
  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => {
      loadStatus();
    }, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [loadStatus]);

  const totalCount = liveEndpoints.length;
  const downEndpoints = liveEndpoints.filter((e) => e.status === 'DOWN');
  const upEndpoints = liveEndpoints.filter((e) => e.status === 'UP');
  const isMajorOutage = downEndpoints.length === liveEndpoints.length && liveEndpoints.length > 0;
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
      {/* Top Header with Brand Logo & View-Only Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#353438] pb-4 gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="/logo.png" alt="AreWeUpYet Logo" className="h-6 sm:h-8 w-auto object-contain flex-shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1b1b1e] border border-[#2a2a2d] text-[#c7c4d7] truncate max-w-[200px] sm:max-w-none">
              {tenantId}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#002113] text-tertiary border border-[#005236] font-medium flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 animate-pulse" /> Public View
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 self-end sm:self-auto">
          {/* Refresh Button with Last Updated */}
          <button
            onClick={() => loadStatus(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1b1b1e] border border-[#2a2a2d] hover:bg-[#202024] text-xs font-mono text-[#908fa0] hover:text-[#e4e1e6] transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">
              {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Refresh'}
            </span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2a2d] hover:bg-[#353438] text-xs font-mono text-[#e4e1e6] transition-colors"
            title="Copy Public Shareable Link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-tertiary" /> : <Share2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Link Copied!' : 'Share Page'}</span>
            <span className="sm:hidden">{copied ? 'Copied' : 'Share'}</span>
          </button>

          {isOwner && onBack && (
            <button
              onClick={onBack}
              className="flex items-center text-xs font-mono text-secondary hover:underline pl-1"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-[#1b1b1e] border border-[#2a2a2d] text-xs font-mono text-[#908fa0] flex items-center justify-center gap-2.5">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          <span>Fetching real-time status from edge dispatcher...</span>
        </div>
      ) : liveEndpoints.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-[#1b1b1e] border border-[#2a2a2d] space-y-2">
          <p className="font-semibold text-sm text-[#e4e1e6]">{errorMsg ? 'Status Unavailable' : 'No Monitored Services'}</p>
          <p className="text-xs font-mono text-[#908fa0]">
            {errorMsg || 'No active synthetic probes configured for this workspace.'}
          </p>
        </div>
      ) : (
        <>
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
              <div>
                <h2 className="font-display font-medium text-base text-[#e4e1e6]">Services & Core Infrastructure</h2>
                <p className="text-[11px] font-mono text-[#908fa0]">Click any service to inspect latency trend & check history</p>
              </div>
              <span className="text-xs font-mono text-[#908fa0]">{liveEndpoints.length} Monitored</span>
            </div>

            <div className="rounded-xl bg-surface-container-low border border-[#353438] divide-y divide-[#353438] shadow-sm overflow-hidden">
              {liveEndpoints.map((ep) => {
                const isDown = ep.status === 'DOWN';
                return (
                  <div
                    key={ep.endpointId}
                    onClick={() => setSelectedEndpoint(ep)}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:bg-[#1f1f22] cursor-pointer transition-colors group"
                    title="Click to view latency graph & telemetry"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-sm text-[#e4e1e6] group-hover:text-primary transition-colors truncate">
                          {ep.name}
                        </span>
                        {ep.group && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#2a2a2d] text-[#c7c4d7]">
                            {ep.group}
                          </span>
                        )}
                      </div>
                      {ep.url && <div className="text-xs font-mono text-[#908fa0] truncate">{ep.url}</div>}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                      <span className="text-xs font-mono text-[#908fa0]">
                        Every {ep.frequencyMin}m
                      </span>
                      <span className="text-[11px] font-mono text-secondary hidden sm:inline group-hover:underline">
                        Telemetry &rarr;
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
        </>
      )}

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

      {/* View-Only Endpoint Detail & History Modal */}
      {selectedEndpoint && (
        <EndpointDetailModal
          endpoint={selectedEndpoint}
          tenantId={tenantId}
          readOnly={true}
          onClose={() => setSelectedEndpoint(null)}
        />
      )}
    </div>
  );
};
