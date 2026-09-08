import React, { useState } from 'react';
import { Activity, ShieldCheck, Clock, Server } from 'lucide-react';
import type { Endpoint } from './types';
import { TermsOfService, PrivacyPolicy } from './Legal';

export const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'terms' | 'privacy'>('dashboard');
  const [endpoints] = useState<Endpoint[]>([
    {
      tenantId: 'demo',
      endpointId: 'ep-auth',
      name: 'Auth Gateway',
      url: 'https://auth.example.com/health',
      frequencyMin: 5,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      tenantId: 'demo',
      endpointId: 'ep-api',
      name: 'Telemetry Ingest',
      url: 'https://api.example.com/v1/ping',
      frequencyMin: 5,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  return (
    <div className="min-h-screen bg-surface text-[#e4e1e6] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#353438] bg-surface-container-lowest px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-[#1000a9]">
            <Activity className="w-5 h-5 text-[#0d0096]" />
          </div>
          <div>
            <span className="font-display font-semibold text-lg tracking-tight text-[#e4e1e6]">AreWeUpYet</span>
            <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded bg-surface-container-high text-[#c7c4d7]">Telemetry MVP</span>
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm font-mono text-[#c7c4d7]">
          <span className="flex items-center text-tertiary">
            <span className="w-2 h-2 rounded-full bg-tertiary mr-2 animate-pulse" />
            All Systems Operational
          </span>
        </div>
      </header>

      {/* Main Content */}
      {view === 'terms' && <TermsOfService onBack={() => setView('dashboard')} />}
      {view === 'privacy' && <PrivacyPolicy onBack={() => setView('dashboard')} />}
      {view === 'dashboard' && (
        <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-surface-container border border-[#353438]">
              <div className="flex items-center justify-between text-[#c7c4d7] text-xs font-mono">
                <span>ACTIVE MONITORS</span>
                <Server className="w-4 h-4 text-secondary" />
              </div>
              <div className="mt-2 text-2xl font-display font-semibold text-[#e4e1e6]">
                {endpoints.length} / 20
              </div>
              <div className="mt-1 text-xs text-[#908fa0]">Always-free tenant cap</div>
            </div>

            <div className="p-4 rounded-xl bg-surface-container border border-[#353438]">
              <div className="flex items-center justify-between text-[#c7c4d7] text-xs font-mono">
                <span>AVG LATENCY</span>
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-display font-semibold text-[#e4e1e6]">
                42 ms
              </div>
              <div className="mt-1 text-xs text-[#908fa0]">Last 24 hours</div>
            </div>

            <div className="p-4 rounded-xl bg-surface-container border border-[#353438]">
              <div className="flex items-center justify-between text-[#c7c4d7] text-xs font-mono">
                <span>SECURITY</span>
                <ShieldCheck className="w-4 h-4 text-tertiary" />
              </div>
              <div className="mt-2 text-2xl font-display font-semibold text-tertiary">
                SSRF Guard Active
              </div>
              <div className="mt-1 text-xs text-[#908fa0]">Private IPs & metadata protected</div>
            </div>
          </div>

          {/* Endpoints Table */}
          <div className="rounded-xl bg-surface-container border border-[#353438] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#353438] flex items-center justify-between">
              <h2 className="font-display font-medium text-base text-[#e4e1e6]">Monitored Endpoints</h2>
              <span className="text-xs font-mono text-[#908fa0]">5-min check interval</span>
            </div>

            <div className="divide-y divide-[#353438]">
              {endpoints.map((ep) => (
                <div key={ep.endpointId} className="px-6 py-4 flex items-center justify-between hover:bg-surface-container-high transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-[#e4e1e6]">{ep.name}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-[#002113] text-tertiary border border-[#005236]">
                        {ep.status}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#908fa0]">{ep.url}</div>
                  </div>

                  <div className="text-right text-xs font-mono text-[#c7c4d7]">
                    <div>Every {ep.frequencyMin}m</div>
                    <div className="text-[#908fa0]">Expected {ep.expectedStatus}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-[#353438] py-4 px-6 flex items-center justify-between text-xs font-mono text-[#908fa0]">
        <div>AreWeUpYet — Multi-tenant Uptime SaaS (Always-Free Tier)</div>
        <div className="space-x-4">
          <button onClick={() => setView('terms')} className="hover:text-[#e4e1e6] transition-colors">Terms of Service</button>
          <button onClick={() => setView('privacy')} className="hover:text-[#e4e1e6] transition-colors">Privacy Policy</button>
        </div>
      </footer>
    </div>
  );
};

export default App;
