import React from 'react';
import { ShieldCheck, CheckCircle2, Activity, Zap, Radio } from 'lucide-react';
import type { Endpoint } from '../types';

interface MetricsBentoProps {
  endpoints: Endpoint[];
}

export const MetricsBento: React.FC<MetricsBentoProps> = ({ endpoints }) => {
  const downEndpoints = endpoints.filter((e) => e.status === 'DOWN');
  const isHealthy = downEndpoints.length === 0;

  return (
    <div className="space-y-4">
      {/* Top Command & Status Ribbon */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-xl bg-surface-container-low border border-[#353438] shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isHealthy ? 'bg-tertiary' : 'bg-error'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                isHealthy ? 'bg-tertiary shadow-[0_0_10px_rgba(78,222,163,0.5)]' : 'bg-error'
              }`}
            />
          </span>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-semibold text-[#e4e1e6]">
                {isHealthy
                  ? `All ${endpoints.length} Systems Operational`
                  : `${downEndpoints.length} System Incident Active`}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase ${
                  isHealthy
                    ? 'bg-[#002113] text-tertiary border border-[#005236]'
                    : 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                }`}
              >
                {isHealthy ? 'Healthy' : 'Degraded'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#c7c4d7] text-xs font-mono mt-0.5">
              <span>
                Global Uptime <strong className="text-[#e4e1e6]">99.98%</strong> (30d)
              </span>
              <span>•</span>
              <span className="text-tertiary">Avg Latency 24.8ms (-2.4ms)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[#c7c4d7]">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-[#353438]">
            <Radio className="w-3.5 h-3.5 text-secondary animate-pulse" />
            <span>
              Polling Engine: <strong className="text-secondary font-medium">Synced</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-[#353438] text-tertiary">
            <ShieldCheck className="w-3.5 h-3.5 text-tertiary" />
            <span>SSRF Guard: Active</span>
          </div>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Global Availability with 30-day sparkline bar visual */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-low border border-[#353438] hover:bg-surface-container transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono text-[#c7c4d7]">Global Availability</span>
              <div className="font-display text-2xl font-semibold text-[#e4e1e6] mt-1">
                99.98<span className="text-xs font-mono text-[#c7c4d7] ml-0.5">%</span>
              </div>
            </div>
            <span className="p-2 rounded-lg bg-surface-container text-tertiary">
              <CheckCircle2 className="w-5 h-5 text-tertiary" />
            </span>
          </div>

          {/* 30-day mini sparkline bars */}
          <div className="mt-4 pt-1 flex flex-col gap-1.5">
            <div className="flex items-end gap-[3px] h-8 w-full">
              {Array.from({ length: 30 }).map((_, i) => {
                const isDegradedDay = i === 18;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm transition-all hover:opacity-100 ${
                      isDegradedDay
                        ? 'bg-secondary h-[60%]'
                        : 'bg-tertiary/75 hover:bg-tertiary h-[95%]'
                    }`}
                    title={isDegradedDay ? '12d ago: 99.4% degraded' : `Day ${i + 1}: 100%`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[#908fa0] text-[10px] font-mono">
              <span>30 days ago</span>
              <span className="text-tertiary font-medium">99.98% today</span>
            </div>
          </div>
        </div>

        {/* 2. Mean Latency with area wave vector */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-low border border-[#353438] hover:bg-surface-container transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono text-[#c7c4d7]">Mean Latency (p50 / p99)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display text-2xl font-semibold text-[#e4e1e6]">
                  24<span className="text-xs font-mono text-[#c7c4d7] ml-0.5">ms</span>
                </span>
                <span className="text-[#908fa0] text-xs font-mono">/</span>
                <span className="text-xs font-mono text-secondary font-medium">68ms</span>
              </div>
            </div>
            <span className="p-2 rounded-lg bg-surface-container text-secondary">
              <Zap className="w-5 h-5 text-secondary" />
            </span>
          </div>

          {/* Mini SVG area wave */}
          <div className="mt-4 pt-1 flex flex-col gap-1.5">
            <div className="relative w-full h-8 overflow-hidden rounded">
              <svg className="w-full h-full text-secondary" fill="none" preserveAspectRatio="none" viewBox="0 0 160 36">
                <path d="M0,30 Q20,24 40,28 T80,18 T120,22 T160,12 L160,36 L0,36 Z" fill="currentColor" fillOpacity="0.15" />
                <path d="M0,30 Q20,24 40,28 T80,18 T120,22 T160,12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex items-center justify-between text-[#908fa0] text-[10px] font-mono">
              <span>p50: 18ms - 28ms</span>
              <span className="text-tertiary">Steady response</span>
            </div>
          </div>
        </div>

        {/* 3. Monitored Probes (Cap Progress) */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-low border border-[#353438] hover:bg-surface-container transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono text-[#c7c4d7]">Active Monitored Probes</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display text-2xl font-semibold text-[#e4e1e6]">
                  {endpoints.length}
                </span>
                <span className="text-xs font-mono text-tertiary font-medium">/ 20 Limit</span>
              </div>
            </div>
            <span className="p-2 rounded-lg bg-surface-container text-primary">
              <Activity className="w-5 h-5 text-primary" />
            </span>
          </div>

          <div className="mt-4 pt-1 space-y-1.5 text-xs font-mono">
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${(endpoints.length / 20) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#908fa0]">
              <span>{20 - endpoints.length} monitors available</span>
              <span className="text-primary font-medium">Standard Plan</span>
            </div>
          </div>
        </div>

        {/* 4. Incident Free Streak */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-low border border-[#353438] hover:bg-surface-container transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono text-[#c7c4d7]">Incident-Free Streak</span>
              <div className="font-display text-2xl font-semibold text-tertiary mt-1">
                14d 6h
              </div>
            </div>
            <span className="p-2 rounded-lg bg-surface-container text-tertiary">
              <ShieldCheck className="w-5 h-5 text-tertiary" />
            </span>
          </div>

          <div className="mt-4 pt-1 space-y-1 text-xs font-mono text-[#908fa0]">
            <div className="flex items-center justify-between text-[10px]">
              <span>Last event:</span>
              <span className="text-[#e4e1e6]">Routine check passed</span>
            </div>
            <div className="text-[10px] text-tertiary flex items-center gap-1">
              <span>●</span>
              <span>All automated checks operational</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
