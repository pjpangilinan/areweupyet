import React from 'react';
import {
  LayoutGrid,
  Activity,
  PlusCircle,
  Sliders,
  Globe,
  FileText,
  Bell,
  User,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'endpoints', label: 'Endpoints & Monitors', icon: Activity },
    { id: 'new-probe', label: 'New Probe', icon: PlusCircle },
    { id: 'settings', label: 'Workspace Settings', icon: Sliders },
    { id: 'status-page', label: 'Public Status Page', icon: Globe },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-surface-container-lowest border-r border-[#353438] z-50 flex flex-col items-center justify-between py-3">
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Brand Icon */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className="p-1 rounded-xl hover:bg-surface-container-high transition-colors"
          title="AreWeUpYet"
        >
          <img
            src="/icon.png"
            alt="AreWeUpYet Logo"
            className="h-9 w-9 rounded-lg object-contain shadow-md"
          />
        </button>

        {/* Navigation Items */}
        <nav className="flex flex-col items-center gap-1.5 w-full px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`group relative flex items-center justify-center w-11 h-11 rounded-xl transition-all ${
                  isActive
                    ? 'bg-surface-container-high text-primary ring-1 ring-[#464554] shadow-sm'
                    : 'text-[#c7c4d7] hover:text-[#e4e1e6] hover:bg-surface-container'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
                {/* Tooltip on hover */}
                <span className="absolute left-14 px-2 py-1 bg-surface-container-highest text-[#e4e1e6] text-xs font-mono rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        <button
          onClick={() => onSelectTab('terms')}
          className="flex items-center justify-center w-11 h-11 rounded-xl text-[#c7c4d7] hover:text-[#e4e1e6] hover:bg-surface-container transition-colors"
          title="Terms & Privacy"
        >
          <FileText className="w-5 h-5" />
        </button>

        <button
          className="relative flex items-center justify-center w-11 h-11 rounded-xl text-[#c7c4d7] hover:text-[#e4e1e6] hover:bg-surface-container transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-tertiary"></span>
        </button>

        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[#1000a9]">
          <User className="w-4 h-4" />
        </div>
      </div>
    </aside>
  );
};
