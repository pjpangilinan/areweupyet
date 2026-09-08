import React, { useState } from 'react';
import { Trash2, BarChart2 } from 'lucide-react';
import type { Endpoint } from '../types';

interface MonitorsTableProps {
  endpoints: Endpoint[];
  searchQuery: string;
  onSelectEndpoint: (ep: Endpoint) => void;
  onDeleteEndpoint: (id: string) => void;
}

export const MonitorsTable: React.FC<MonitorsTableProps> = ({
  endpoints,
  searchQuery,
  onSelectEndpoint,
  onDeleteEndpoint,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'DEGRADED' | 'DOWN'>('ALL');

  const filtered = endpoints
    .filter((ep) => {
      if (filter === 'DOWN') return ep.status === 'DOWN';
      if (filter === 'DEGRADED') return ep.consecutiveFail > 0 && ep.status !== 'DOWN';
      return true;
    })
    .filter((ep) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return ep.name.toLowerCase().includes(q) || ep.url.toLowerCase().includes(q);
    });

  return (
    <div className="rounded-xl bg-surface-container-low border border-[#353438] overflow-hidden shadow-sm">
      {/* Table Header Controls */}
      <div className="px-5 py-3.5 border-b border-[#353438] flex flex-wrap items-center justify-between gap-3 bg-surface-container/50">
        <div className="flex items-center gap-2">
          <span className="font-display font-medium text-sm text-[#e4e1e6]">Monitored Endpoints</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-[#c7c4d7]">
            {filtered.length} Probes
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-lowest border border-[#353438] text-xs font-mono">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filter === 'ALL'
                ? 'bg-surface-container-high text-[#e4e1e6] font-medium shadow-sm'
                : 'text-[#908fa0] hover:text-[#e4e1e6]'
            }`}
          >
            All ({endpoints.length})
          </button>
          <button
            onClick={() => setFilter('DOWN')}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filter === 'DOWN'
                ? 'bg-error-container text-[#ffdad6] font-medium shadow-sm'
                : 'text-[#908fa0] hover:text-error'
            }`}
          >
            Down ({endpoints.filter((e) => e.status === 'DOWN').length})
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#353438]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-[#908fa0]">
            No monitors match the current query or filter.
          </div>
        ) : (
          filtered.map((ep) => {
            const isDown = ep.status === 'DOWN';
            const isPending = ep.status === 'PENDING';

            return (
              <div
                key={ep.endpointId}
                className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-surface-container/60 transition-colors group"
              >
                {/* Left: Identity & Status */}
                <div className="flex items-start gap-3 min-w-[280px]">
                  <span
                    className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isDown ? 'bg-error' : isPending ? 'bg-primary' : 'bg-tertiary'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectEndpoint(ep)}
                        className="font-display font-medium text-sm text-[#e4e1e6] hover:text-primary transition-colors text-left"
                      >
                        {ep.name}
                      </button>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface-container-high text-[#908fa0] uppercase">
                        GET
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#908fa0] mt-0.5">
                      <span className="truncate max-w-[240px]">{ep.url}</span>
                      <span>·</span>
                      <span>Every {ep.frequencyMin}m</span>
                    </div>
                  </div>
                </div>

                {/* Center: 30-Day mini uptime bar strip */}
                <div className="hidden lg:flex flex-col items-center gap-1 w-48">
                  <div className="flex items-center gap-[2px] w-full h-4">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-[1px] h-full ${
                          isDown && i === 23
                            ? 'bg-error'
                            : 'bg-tertiary/75 hover:bg-tertiary'
                        }`}
                        title={`Check segment ${i + 1}: ${isDown && i === 23 ? 'Incident' : '100% Up'}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between w-full text-[9px] font-mono text-[#908fa0]">
                    <span>30d history</span>
                    <span className={isDown ? 'text-error' : 'text-tertiary'}>
                      {isDown ? '99.40%' : '100.0%'}
                    </span>
                  </div>
                </div>

                {/* Right: Latency, Status Pill & Actions */}
                <div className="flex items-center justify-between md:justify-end gap-5">
                  <div className="text-right font-mono text-xs">
                    <div className="text-[#e4e1e6] font-medium">24 ms</div>
                    <div className="text-[10px] text-[#908fa0]">HTTP {ep.expectedStatus}</div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium ${
                      isDown
                        ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                        : isPending
                        ? 'bg-surface-container-high text-[#c7c4d7]'
                        : 'bg-[#002113] text-tertiary border border-[#005236]'
                    }`}
                  >
                    {isDown ? 'DOWN' : isPending ? 'PENDING' : 'HEALTHY'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onSelectEndpoint(ep)}
                      className="p-1.5 rounded-lg text-[#908fa0] hover:text-[#e4e1e6] hover:bg-surface-container-high transition-colors"
                      title="View Detailed Telemetry"
                    >
                      <BarChart2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteEndpoint(ep.endpointId)}
                      className="p-1.5 rounded-lg text-[#908fa0] hover:text-error hover:bg-surface-container-high transition-colors"
                      title="Delete Monitor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
