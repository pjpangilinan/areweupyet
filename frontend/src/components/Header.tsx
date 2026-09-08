import React from 'react';
import { Search, Plus, ExternalLink, ChevronDown } from 'lucide-react';

interface HeaderProps {
  onNewMonitor: () => void;
  onOpenStatusPage: () => void;
  onSearchChange: (query: string) => void;
  searchQuery: string;
  isOperational: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onNewMonitor,
  onOpenStatusPage,
  onSearchChange,
  searchQuery,
  isOperational,
}) => {
  return (
    <header className="fixed top-0 left-16 right-0 h-14 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-[#353438] z-40 px-6 flex items-center justify-between gap-4">
      {/* Left: Workspace Selector & Live Status Pill */}
      <div className="flex items-center gap-4 min-w-[240px]">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer">
          <img src="/logo.png" alt="AreWeUpYet Logo" className="h-6 w-auto object-contain" />
          <span className="text-outline text-xs font-mono">/</span>
          <span className="text-xs font-mono text-[#c7c4d7]">Production</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#908fa0]" />
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container border border-[#464554] text-tertiary text-xs font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${isOperational ? 'bg-tertiary animate-pulse' : 'bg-error'}`} />
          <span className="uppercase tracking-wider font-semibold">
            {isOperational ? 'Operational' : 'Degraded'}
          </span>
        </div>
      </div>

      {/* Center: Search bar with shortcut */}
      <div className="flex-1 max-w-xl mx-4">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-3 w-4 h-4 text-[#908fa0]" />
          <input
            type="text"
            placeholder="Search monitors, target URLs, or jump to..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-9 pr-12 bg-surface-container-low border border-[#353438] rounded-xl text-xs font-mono text-[#e4e1e6] placeholder:text-[#908fa0] focus:outline-none focus:border-primary transition-colors"
          />
          <div className="absolute right-2.5 flex items-center">
            <kbd className="px-1.5 py-0.5 bg-surface-container-high border border-[#464554] rounded text-[10px] font-mono text-[#c7c4d7]">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Regional Latency + Actions */}
      <div className="flex items-center gap-3 justify-end min-w-[260px]">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-[#353438] text-[#c7c4d7] text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
          <span>US-East</span>
          <span className="text-outline">·</span>
          <span className="text-[#e4e1e6] font-medium">24ms</span>
        </div>

        <button
          onClick={onOpenStatusPage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-[#39393c] text-secondary text-xs font-mono transition-colors"
          title="Open Public Status Page"
        >
          <span>Status Page</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onNewMonitor}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-[#1000a9] rounded-lg text-xs font-mono font-medium hover:bg-primary-container transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Monitor</span>
        </button>
      </div>
    </header>
  );
};
