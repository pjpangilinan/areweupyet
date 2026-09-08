import React, { useState } from 'react';
import type { Endpoint } from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MetricsBento } from './components/MetricsBento';
import { MonitorsTable } from './components/MonitorsTable';
import { EndpointDetailModal } from './components/EndpointDetailModal';
import { CreateMonitorModal } from './components/CreateMonitorModal';
import { SettingsView } from './components/SettingsView';
import { StatusPage } from './StatusPage';
import { TermsOfService, PrivacyPolicy } from './Legal';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [endpoints, setEndpoints] = useState<Endpoint[]>([
    {
      tenantId: 'demo',
      endpointId: 'ep-auth',
      name: 'Authentication Service',
      url: 'https://auth.example.com/health',
      frequencyMin: 5,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      tenantId: 'demo',
      endpointId: 'ep-api',
      name: 'Telemetry Ingest Gateway',
      url: 'https://api.example.com/v1/ping',
      frequencyMin: 5,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      tenantId: 'demo',
      endpointId: 'ep-docs',
      name: 'Public Documentation & CDN',
      url: 'https://docs.example.com/status',
      frequencyMin: 5,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      tenantId: 'demo',
      endpointId: 'ep-billing',
      name: 'Billing Webhook Worker',
      url: 'https://billing.example.com/events',
      frequencyMin: 10,
      timeoutSec: 15,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  const handleAddEndpoint = (newEp: Endpoint) => {
    setEndpoints((prev) => [...prev, newEp]);
  };

  const handleDeleteEndpoint = (id: string) => {
    setEndpoints((prev) => prev.filter((e) => e.endpointId !== id));
    if (selectedEndpoint?.endpointId === id) {
      setSelectedEndpoint(null);
    }
  };

  const isOperational = endpoints.every((e) => e.status !== 'DOWN');

  // Handle full-page views (Status Page, Legal)
  if (currentTab === 'status-page') {
    return (
      <div className="min-h-screen bg-surface text-[#e4e1e6] py-8 px-4">
        <StatusPage
          tenantId="demo"
          endpoints={endpoints}
          onBack={() => setCurrentTab('dashboard')}
        />
      </div>
    );
  }

  if (currentTab === 'terms') {
    return (
      <div className="min-h-screen bg-surface text-[#e4e1e6] py-8 px-4">
        <TermsOfService onBack={() => setCurrentTab('dashboard')} />
      </div>
    );
  }

  if (currentTab === 'privacy') {
    return (
      <div className="min-h-screen bg-surface text-[#e4e1e6] py-8 px-4">
        <PrivacyPolicy onBack={() => setCurrentTab('dashboard')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-[#e4e1e6] flex">
      {/* Left Icon Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'new-probe') {
            setIsCreateOpen(true);
          } else {
            setCurrentTab(tab);
          }
        }}
      />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col pl-16 min-h-screen">
        {/* Top Header */}
        <Header
          onNewMonitor={() => setIsCreateOpen(true)}
          onOpenStatusPage={() => setCurrentTab('status-page')}
          onSearchChange={setSearchQuery}
          searchQuery={searchQuery}
          isOperational={isOperational}
        />

        {/* Content Body */}
        <main className="flex-1 pt-16 p-6 max-w-7xl w-full mx-auto space-y-6">
          {currentTab === 'dashboard' && (
            <>
              {/* Telemetry Bento Grid */}
              <MetricsBento endpoints={endpoints} />

              {/* Monitors Table */}
              <MonitorsTable
                endpoints={endpoints}
                searchQuery={searchQuery}
                onSelectEndpoint={(ep) => setSelectedEndpoint(ep)}
                onDeleteEndpoint={handleDeleteEndpoint}
              />
            </>
          )}

          {currentTab === 'endpoints' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display font-semibold text-xl text-[#e4e1e6]">Endpoints & Monitors</h2>
                  <p className="text-xs font-mono text-[#908fa0]">Active probes, latency profiles, and health checks</p>
                </div>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  disabled={endpoints.length >= 20}
                  className="px-3.5 py-2 rounded-xl bg-primary text-[#1000a9] font-medium text-xs font-mono hover:bg-primary-container transition-colors disabled:opacity-50"
                >
                  Deploy New Probe
                </button>
              </div>

              <MonitorsTable
                endpoints={endpoints}
                searchQuery={searchQuery}
                onSelectEndpoint={(ep) => setSelectedEndpoint(ep)}
                onDeleteEndpoint={handleDeleteEndpoint}
              />
            </div>
          )}

          {currentTab === 'settings' && <SettingsView />}
        </main>

        {/* Footer */}
        <footer className="border-t border-[#353438] py-4 px-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-[#908fa0] gap-2 bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="AreWeUpYet" className="w-4 h-4 rounded object-contain" />
            <span>AreWeUpYet — Multi-tenant Uptime Telemetry (Always-Free Tier)</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setCurrentTab('status-page')}
              className="hover:text-secondary transition-colors"
            >
              Public Status
            </button>
            <button
              onClick={() => setCurrentTab('terms')}
              className="hover:text-[#e4e1e6] transition-colors"
            >
              Terms of Service
            </button>
            <button
              onClick={() => setCurrentTab('privacy')}
              className="hover:text-[#e4e1e6] transition-colors"
            >
              Privacy Policy
            </button>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <CreateMonitorModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onAdd={handleAddEndpoint}
        currentCount={endpoints.length}
      />

      {selectedEndpoint && (
        <EndpointDetailModal
          endpoint={selectedEndpoint}
          onClose={() => setSelectedEndpoint(null)}
        />
      )}
    </div>
  );
};

export default App;
