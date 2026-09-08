import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import type { Endpoint } from '../types';

interface EndpointDetailModalProps {
  endpoint: Endpoint;
  onClose: () => void;
}

export const EndpointDetailModal: React.FC<EndpointDetailModalProps> = ({ endpoint, onClose }) => {
  const isDown = endpoint.status === 'DOWN';

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-surface-container border border-[#353438] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[#353438] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-lg text-[#e4e1e6]">{endpoint.name}</h3>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                  isDown
                    ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                    : 'bg-[#002113] text-tertiary border border-[#005236]'
                }`}
              >
                {isDown ? 'INCIDENT' : 'HEALTHY'}
              </span>
            </div>
            <div className="text-xs font-mono text-[#908fa0]">{endpoint.url}</div>
          </div>
          <button onClick={onClose} className="text-[#908fa0] hover:text-[#e4e1e6] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438]">
            <div className="text-[11px] font-mono text-[#908fa0]">CHECK FREQUENCY</div>
            <div className="text-base font-display font-semibold text-[#e4e1e6] mt-0.5">
              Every {endpoint.frequencyMin}m
            </div>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438]">
            <div className="text-[11px] font-mono text-[#908fa0]">AVG LATENCY</div>
            <div className="text-base font-display font-semibold text-secondary mt-0.5">
              24 ms
            </div>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438]">
            <div className="text-[11px] font-mono text-[#908fa0]">30D UPTIME</div>
            <div className="text-base font-display font-semibold text-tertiary mt-0.5">
              {isDown ? '99.40%' : '100.0%'}
            </div>
          </div>
        </div>

        {/* Response Latency Vector Chart */}
        <div className="p-4 rounded-xl bg-surface-container-low border border-[#353438] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#c7c4d7]">Response Latency Trend (24h)</span>
            <span className="text-tertiary">p50: 24ms</span>
          </div>
          <div className="relative w-full h-24 overflow-hidden rounded">
            <svg className="w-full h-full text-secondary" fill="none" preserveAspectRatio="none" viewBox="0 0 200 60">
              <path
                d="M0,45 Q25,30 50,40 T100,25 T150,35 T200,18 L200,60 L0,60 Z"
                fill="currentColor"
                fillOpacity="0.12"
              />
              <path
                d="M0,45 Q25,30 50,40 T100,25 T150,35 T200,18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#908fa0]">
            <span>24 hours ago</span>
            <span>12 hours ago</span>
            <span>Now</span>
          </div>
        </div>

        {/* Regional Mesh Breakdown */}
        <div className="space-y-2">
          <div className="text-xs font-mono text-[#c7c4d7]">Regional Latency Distribution</div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-[#353438] flex items-center justify-between">
              <span className="text-[#908fa0]">🇺🇸 US-East (N. Virginia)</span>
              <span className="text-tertiary font-medium">18ms</span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-[#353438] flex items-center justify-between">
              <span className="text-[#908fa0]">🇺🇸 US-West (Oregon)</span>
              <span className="text-tertiary font-medium">28ms</span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-[#353438] flex items-center justify-between">
              <span className="text-[#908fa0]">🇪🇺 EU-West (Ireland)</span>
              <span className="text-secondary font-medium">54ms</span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-[#353438] flex items-center justify-between">
              <span className="text-[#908fa0]">🇸🇬 AP-Southeast (Singapore)</span>
              <span className="text-secondary font-medium">88ms</span>
            </div>
          </div>
        </div>

        {/* SSL & Security Badge */}
        <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-tertiary">
            <ShieldCheck className="w-4 h-4" />
            <span>SSL Certificate Valid (Expires in 214 days)</span>
          </div>
          <span className="text-[#908fa0]">TLS 1.3</span>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-[#c7c4d7] hover:bg-[#39393c] text-xs font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
