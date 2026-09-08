import React, { useState } from 'react';
import { Activity, ShieldCheck, Clock, Server, Plus, ExternalLink, Trash2, X } from 'lucide-react';
import type { Endpoint } from './types';
import { TermsOfService, PrivacyPolicy } from './Legal';
import { StatusPage } from './StatusPage';

export const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'status' | 'terms' | 'privacy'>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [endpoints, setEndpoints] = useState<Endpoint[]>([
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

  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFrequency, setNewFrequency] = useState(5);

  const handleAddEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (endpoints.length >= 20) {
      setFormError('Hard cap reached: Maximum 20 endpoints allowed per tenant.');
      return;
    }

    if (!newName.trim()) {
      setFormError('Endpoint name is required.');
      return;
    }

    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      setFormError('URL must begin with http:// or https://');
      return;
    }

    // Client-side quick SSRF guard check
    if (newUrl.includes('127.0.0.1') || newUrl.includes('localhost') || newUrl.includes('169.254.')) {
      setFormError('SSRF Guard: Private, loopback, and metadata URLs are blocked.');
      return;
    }

    if (newFrequency < 5) {
      setFormError('Check frequency floor is 5 minutes for Always-Free tier.');
      return;
    }

    const newEp: Endpoint = {
      tenantId: 'demo',
      endpointId: `ep-${Date.now()}`,
      name: newName.trim(),
      url: newUrl.trim(),
      frequencyMin: newFrequency,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'PENDING',
      nextCheckAt: new Date().toISOString(),
      consecutiveFail: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setEndpoints([...endpoints, newEp]);
    setNewName('');
    setNewUrl('');
    setNewFrequency(5);
    setIsModalOpen(false);
  };

  const handleDeleteEndpoint = (id: string) => {
    setEndpoints(endpoints.filter((e) => e.endpointId !== id));
  };

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
        <div className="flex items-center space-x-4 text-xs font-mono text-[#c7c4d7]">
          <button
            onClick={() => setView('status')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-[#39393c] text-secondary transition-colors"
          >
            <span>Public Status Page</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Views */}
      {view === 'status' && (
        <StatusPage
          tenantId="demo"
          endpoints={endpoints}
          onBack={() => setView('dashboard')}
        />
      )}
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
                38 ms
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
              <div>
                <h2 className="font-display font-medium text-base text-[#e4e1e6]">Monitored Endpoints</h2>
                <span className="text-xs font-mono text-[#908fa0]">5-minute minimum check floor</span>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                disabled={endpoints.length >= 20}
                className="flex items-center space-x-1.5 text-xs font-mono px-3 py-2 rounded-lg bg-primary text-[#1000a9] font-medium hover:bg-primary-container transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Add Monitor</span>
              </button>
            </div>

            <div className="divide-y divide-[#353438]">
              {endpoints.map((ep) => (
                <div key={ep.endpointId} className="px-6 py-4 flex items-center justify-between hover:bg-surface-container-high transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-[#e4e1e6]">{ep.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-mono ${
                          ep.status === 'UP'
                            ? 'bg-[#002113] text-tertiary border border-[#005236]'
                            : ep.status === 'DOWN'
                            ? 'bg-[#690005] text-[#ffb4ab] border border-[#93000a]'
                            : 'bg-surface-container-high text-[#c7c4d7]'
                        }`}
                      >
                        {ep.status}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#908fa0]">{ep.url}</div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-right text-xs font-mono text-[#c7c4d7]">
                      <div>Every {ep.frequencyMin}m</div>
                      <div className="text-[#908fa0]">Expected {ep.expectedStatus}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteEndpoint(ep.endpointId)}
                      className="text-[#908fa0] hover:text-error transition-colors p-1"
                      title="Cascade Delete Monitor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* Add Monitor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container border border-[#353438] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-lg text-[#e4e1e6]">Add HTTP(S) Monitor</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[#908fa0] hover:text-[#e4e1e6]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-error-container text-[#ffdad6] text-xs font-mono">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddEndpoint} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-[#c7c4d7]">Monitor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Core Auth Service"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#c7c4d7]">Target URL (SSRF Protected)</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.mycompany.com/health"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#c7c4d7]">Check Frequency (Floor: 5 minutes)</label>
                <select
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
                >
                  <option value={5}>Every 5 minutes (Always-Free standard)</option>
                  <option value={10}>Every 10 minutes</option>
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every 60 minutes</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container-high text-[#c7c4d7] hover:bg-[#39393c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-[#1000a9] font-medium hover:bg-primary-container"
                >
                  Save Monitor
                </button>
              </div>
            </form>
          </div>
        </div>
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
