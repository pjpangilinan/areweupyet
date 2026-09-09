import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { Endpoint } from '../types';
import { fetchEndpointHistory, type EndpointHistoryResponse } from '../api/client';

interface EndpointDetailModalProps {
  endpoint: Endpoint;
  tenantId: string;
  onClose: () => void;
}

export const EndpointDetailModal: React.FC<EndpointDetailModalProps> = ({
  endpoint,
  tenantId,
  onClose,
}) => {
  const isDown = endpoint.status === 'DOWN';
  const [history, setHistory] = useState<EndpointHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetchEndpointHistory(tenantId || 'demo', endpoint.endpointId);
        if (mounted) {
          setHistory(res);
        }
      } catch (err: unknown) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Could not fetch check history';
          setFetchError(msg);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [endpoint.endpointId, tenantId]);

  const pings = history?.recentPings || [];
  const hasPings = pings.length > 0;
  const avgLatency = hasPings
    ? Math.round(pings.reduce((sum, p) => sum + p.latencyMs, 0) / pings.length)
    : 0;

  // Generate SVG path from real pings if available
  const generatePath = () => {
    if (pings.length < 2) {
      return {
        line: 'M0,30 L240,30',
        fill: 'M0,30 L240,30 L240,60 L0,60 Z',
      };
    }
    const maxLat = Math.max(...pings.map((p) => p.latencyMs), 50);
    const minLat = Math.min(...pings.map((p) => p.latencyMs), 0);
    const range = maxLat - minLat || 1;

    const step = 240 / (pings.length - 1);
    const coords = pings.map((p, i) => {
      const x = Math.round(i * step);
      // Invert Y: higher latency = higher on chart (lower Y pixel)
      const y = Math.round(50 - ((p.latencyMs - minLat) / range) * 40);
      return `${x},${y}`;
    });

    const line = `M${coords.join(' L')}`;
    const fill = `${line} L240,60 L0,60 Z`;
    return { line, fill };
  };

  const chartPaths = generatePath();

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#1b1b1e] border border-[#2a2a2d] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#2a2a2d] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg text-[#e4e1e6]">{endpoint.name}</h3>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                  isDown
                    ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                    : 'bg-[#002113] text-tertiary border border-[#005236]'
                }`}
              >
                {endpoint.status}
              </span>
              {endpoint.group && (
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-[#2a2a2d] text-secondary">
                  {endpoint.group}
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-[#908fa0]">{endpoint.url}</div>
          </div>
          <button onClick={onClose} className="text-[#908fa0] hover:text-[#e4e1e6] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-[#131316] border border-[#2a2a2d]">
            <div className="text-[11px] font-mono text-[#908fa0]">CHECK FREQUENCY</div>
            <div className="text-base font-semibold text-[#e4e1e6] mt-0.5">
              Every {endpoint.frequencyMin}m
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#131316] border border-[#2a2a2d]">
            <div className="text-[11px] font-mono text-[#908fa0]">AVG RESPONSE</div>
            <div className="text-base font-semibold text-secondary mt-0.5">
              {hasPings ? `${avgLatency} ms` : '—'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#131316] border border-[#2a2a2d]">
            <div className="text-[11px] font-mono text-[#908fa0]">24H UPTIME</div>
            <div className="text-base font-semibold text-tertiary mt-0.5">
              {history?.uptime24h?.formattedUptime || (isDown ? '0.00%' : '100.00%')}
            </div>
          </div>
        </div>

        {/* The Response Time Graph */}
        <div className="p-4 rounded-xl bg-[#131316] border border-[#2a2a2d] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#c7c4d7]">Response Time History & Latency Trend</span>
            <span className="text-secondary">{hasPings ? `Average: ${avgLatency}ms` : 'Awaiting Check'}</span>
          </div>

          <div className="relative w-full h-28 overflow-hidden rounded bg-[#0e0e11]/60 p-2 flex items-center justify-center">
            {hasPings ? (
              <svg className="w-full h-full text-secondary" fill="none" preserveAspectRatio="none" viewBox="0 0 240 60">
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7bd0ff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#7bd0ff" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={chartPaths.fill} fill="url(#latencyGradient)" />
                <path d={chartPaths.line} stroke="#7bd0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="text-xs font-mono text-[#908fa0] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#908fa0]" />
                <span>No ping samples logged yet. Local dispatcher runs every 10 seconds.</span>
              </div>
            )}
          </div>

          {hasPings && (
            <div className="flex items-center justify-between text-[10px] font-mono text-[#908fa0]">
              <span>First Sample: {pings[0]?.latencyMs}ms</span>
              <span>{pings.length} checks recorded</span>
              <span>Latest: {pings[pings.length - 1]?.latencyMs}ms</span>
            </div>
          )}
        </div>

        {/* Recent Pings Table (Real Outbound HTTP Checks) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#c7c4d7]">Recent Synthetic Pings (Live Dispatcher)</span>
            {loading && (
              <span className="text-[11px] text-[#908fa0] flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Fetching...
              </span>
            )}
          </div>

          {fetchError && (
            <div className="p-3 rounded-lg bg-[#690005]/20 border border-[#ffb4ab] text-xs font-mono text-[#ffdad6]">
              {fetchError}
            </div>
          )}

          <div className="rounded-xl border border-[#2a2a2d] bg-[#131316] overflow-hidden divide-y divide-[#2a2a2d] max-h-48 overflow-y-auto">
            {!hasPings ? (
              <div className="p-6 text-center text-xs font-mono text-[#908fa0] space-y-1">
                <p>No checks recorded yet in Go backend.</p>
                <p className="text-[11px] text-[#717079]">The dispatcher checks due endpoints every 10 seconds locally.</p>
              </div>
            ) : (
              pings.map((p, idx) => {
                const pass = p.success && p.statusCode >= 200 && p.statusCode < 400;
                return (
                  <div
                    key={idx}
                    className="p-2.5 px-4 flex items-center justify-between text-xs font-mono hover:bg-[#1b1b1e] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {pass ? (
                        <CheckCircle2 className="w-4 h-4 text-tertiary flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
                      )}
                      <div>
                        <span className="text-[#e4e1e6] font-medium">HTTP {p.statusCode || 'FAIL'}</span>
                        <span className="text-[11px] text-[#908fa0] ml-2">
                          {new Date(p.checkedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded bg-[#2a2a2d] text-[#c7c4d7]">
                        {p.latencyMs} ms
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          pass ? 'text-tertiary' : 'text-error'
                        }`}
                      >
                        {pass ? 'PASS' : (p.errorMessage || 'FAIL')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Security / SSL Guard Status */}
        <div className="p-3 rounded-xl bg-[#131316] border border-[#2a2a2d] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-tertiary">
            <ShieldCheck className="w-4 h-4" />
            <span>SSRF Guard active & connect-time IP validated</span>
          </div>
          <span className="text-[#908fa0]">Agent: AreWeUpYet-Monitor/1.0</span>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#2a2a2d] text-[#c7c4d7] hover:bg-[#353438] text-xs font-mono transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
