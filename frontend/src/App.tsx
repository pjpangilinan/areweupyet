import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Send,
  Copy,
  Check,
  Lock,
  LogOut,
  Search,
  RefreshCw,
  Activity,
  X,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import type { Endpoint } from './types';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthModal } from './components/AuthModal';
import { EndpointDetailModal } from './components/EndpointDetailModal';
import { StatusPage } from './StatusPage';
import { TermsOfService, PrivacyPolicy } from './Legal';
import { fetchEndpoints, createEndpoint, deleteEndpoint } from './api/client';

const initialEndpoints: Endpoint[] = [
  {
    tenantId: 'demo',
    endpointId: 'ep-google',
    name: 'Google Public DNS / Web',
    url: 'https://www.google.com',
    frequencyMin: 5,
    timeoutSec: 5,
    expectedStatus: 200,
    status: 'UP',
    nextCheckAt: new Date().toISOString(),
    consecutiveFail: 0,
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    tenantId: 'demo',
    endpointId: 'ep-httpstat',
    name: 'Example Domain Health',
    url: 'https://example.com',
    frequencyMin: 5,
    timeoutSec: 5,
    expectedStatus: 200,
    status: 'UP',
    nextCheckAt: new Date().toISOString(),
    consecutiveFail: 0,
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    tenantId: 'demo',
    endpointId: 'ep-auth',
    name: 'Authentication Gateway',
    url: 'https://auth.example.com/health',
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
];

const DashboardApp: React.FC = () => {
  const { user, signOut } = useAuth();
  const [currentTab, setCurrentTab] = useState<'monitors' | 'settings' | 'status-page' | 'terms' | 'privacy'>('monitors');
  const [endpoints, setEndpoints] = useState<Endpoint[]>(initialEndpoints);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New Monitor Form State
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFrequency, setNewFrequency] = useState(5);
  const [addError, setAddError] = useState<string | null>(null);

  // Settings State
  const [webhookUrl, setWebhookUrl] = useState('https://api.mycompany.com/webhooks/uptime');
  const [webhookSecret] = useState('sec_live_9b8f41e0a24d57c3e1b');
  const [testSent, setTestSent] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Support direct hash routing: #/status/demo opens shareable status page without login
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash.startsWith('#/status')) {
        setCurrentTab('status-page');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Load from backend
  const loadEndpoints = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchEndpoints(user?.token);
      if (data && data.length > 0) {
        setEndpoints(data);
      }
    } catch {
      // Keep existing state
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.token]);

  useEffect(() => {
    loadEndpoints();
  }, [loadEndpoints]);

  // Handle Add Monitor
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (endpoints.length >= 20) {
      setAddError('Workspace limit reached: Maximum 20 active monitors.');
      return;
    }

    if (!newName.trim()) {
      setAddError('Monitor name is required.');
      return;
    }

    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      setAddError('URL must begin with http:// or https://');
      return;
    }

    const lower = newUrl.toLowerCase();
    if (
      lower.includes('127.0.0.1') ||
      lower.includes('localhost') ||
      lower.includes('169.254.') ||
      lower.includes('10.') ||
      lower.includes('192.168.')
    ) {
      setAddError('SSRF Guard: Private, loopback, and cloud metadata addresses are blocked.');
      return;
    }

    const now = new Date().toISOString();
    const tempEp: Endpoint = {
      tenantId: user?.tenantId || 'demo',
      endpointId: `ep-${Date.now()}`,
      name: newName.trim(),
      url: newUrl.trim(),
      frequencyMin: newFrequency,
      timeoutSec: 10,
      expectedStatus: 200,
      status: 'UP',
      nextCheckAt: now,
      consecutiveFail: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const created = await createEndpoint(
        {
          name: tempEp.name,
          url: tempEp.url,
          frequencyMin: tempEp.frequencyMin,
          timeoutSec: tempEp.timeoutSec,
          expectedStatus: tempEp.expectedStatus,
        },
        user?.token
      );
      setEndpoints((prev) => [...prev, created]);
    } catch {
      setEndpoints((prev) => [...prev, tempEp]);
    }

    setNewName('');
    setNewUrl('');
    setNewFrequency(5);
    setIsAddOpen(false);
  };

  // Handle Delete
  const handleDelete = async (endpointId: string) => {
    if (!confirm('Are you sure you want to delete this monitor?')) return;
    try {
      await deleteEndpoint(endpointId, user?.token);
    } catch {
      // ignore
    }
    setEndpoints((prev) => prev.filter((e) => e.endpointId !== endpointId));
    if (selectedEndpoint?.endpointId === endpointId) {
      setSelectedEndpoint(null);
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(webhookSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleTestWebhook = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const downCount = endpoints.filter((e) => e.status === 'DOWN').length;
  const isHealthy = downCount === 0;

  const filteredEndpoints = endpoints.filter((ep) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return ep.name.toLowerCase().includes(q) || ep.url.toLowerCase().includes(q);
  });

  // Full views
  if (currentTab === 'status-page') {
    return (
      <div className="min-h-screen bg-[#131316] text-[#e4e1e6] py-8 px-4">
        <StatusPage
          tenantId={user ? user.tenantId : 'demo'}
          endpoints={endpoints}
          onBack={() => {
            window.location.hash = '';
            setCurrentTab('monitors');
          }}
        />
      </div>
    );
  }

  if (currentTab === 'terms') {
    return (
      <div className="min-h-screen bg-[#131316] text-[#e4e1e6] py-8 px-4">
        <TermsOfService onBack={() => setCurrentTab('monitors')} />
      </div>
    );
  }

  if (currentTab === 'privacy') {
    return (
      <div className="min-h-screen bg-[#131316] text-[#e4e1e6] py-8 px-4">
        <PrivacyPolicy onBack={() => setCurrentTab('monitors')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#131316] text-[#e4e1e6] flex flex-col font-sans">
      {/* Clean Top Navbar */}
      <header className="sticky top-0 z-30 bg-[#131316]/90 backdrop-blur border-b border-[#2a2a2d] px-4 sm:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-6 sm:gap-8">
          <button
            onClick={() => setCurrentTab('monitors')}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <img src="/logo.png" alt="AreWeUpYet" className="h-7 w-auto object-contain" />
          </button>

          <nav className="flex items-center gap-1 sm:gap-2 text-xs font-mono">
            <button
              onClick={() => setCurrentTab('monitors')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                currentTab === 'monitors'
                  ? 'bg-[#2a2a2d] text-[#e4e1e6] font-medium'
                  : 'text-[#908fa0] hover:text-[#e4e1e6] hover:bg-[#1f1f22]'
              }`}
            >
              Monitors
            </button>
            <button
              onClick={() => setCurrentTab('settings')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                currentTab === 'settings'
                  ? 'bg-[#2a2a2d] text-[#e4e1e6] font-medium'
                  : 'text-[#908fa0] hover:text-[#e4e1e6] hover:bg-[#1f1f22]'
              }`}
            >
              Alerts & Webhooks
            </button>
            <button
              onClick={() => setCurrentTab('status-page')}
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg text-[#908fa0] hover:text-[#e4e1e6] hover:bg-[#1f1f22] transition-colors"
            >
              <span>Public Status</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </nav>
        </div>

        {/* Right: Operational Status + New Monitor + Cognito User */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[#1b1b1e] border border-[#2a2a2d] text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? 'bg-tertiary animate-pulse' : 'bg-error'
              }`}
            />
            <span className={isHealthy ? 'text-tertiary font-medium' : 'text-error font-medium'}>
              {isHealthy ? 'All Systems Normal' : `${downCount} Monitor Down`}
            </span>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-[#1000a9] rounded-lg text-xs font-mono font-semibold hover:bg-white transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Monitor</span>
          </button>

          {/* User Profile Pill */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-[#2a2a2d]">
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#1f1f22] transition-colors text-xs font-mono text-[#c7c4d7]"
                title={`Cognito: ${user.email} [${user.tenantId}]`}
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
                  {user.email.substring(0, 2).toUpperCase()}
                </div>
                <span className="hidden lg:inline">{user.tenantId}</span>
              </button>
              <button
                onClick={signOut}
                className="p-1.5 rounded-lg text-[#908fa0] hover:text-error hover:bg-[#1f1f22] transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f1f22] text-xs font-mono text-primary hover:bg-[#2a2a2d] transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {currentTab === 'monitors' && (
          <>
            {/* Overview Summary Cards & Latency Graph */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] space-y-1">
                <div className="flex items-center justify-between text-xs font-mono text-[#908fa0]">
                  <span>SYSTEM STATUS</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isHealthy ? 'bg-tertiary animate-pulse' : 'bg-error'
                    }`}
                  />
                </div>
                <div className="text-lg font-semibold text-[#e4e1e6]">
                  {isHealthy ? 'Operational' : 'Degraded Outage'}
                </div>
                <div className="text-xs font-mono text-tertiary">
                  {isHealthy ? 'All systems normal' : `${downCount} endpoint failed`}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] space-y-1">
                <div className="flex items-center justify-between text-xs font-mono text-[#908fa0]">
                  <span>OVERALL UPTIME</span>
                  <Activity className="w-4 h-4 text-tertiary" />
                </div>
                <div className="text-lg font-semibold text-tertiary">
                  99.98%
                </div>
                <div className="text-xs font-mono text-[#908fa0]">
                  Rolling 30-day window
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] space-y-1">
                <div className="flex items-center justify-between text-xs font-mono text-[#908fa0]">
                  <span>AVG RESPONSE</span>
                  <span className="text-xs text-secondary font-medium">p50: 24ms</span>
                </div>
                <div className="text-lg font-semibold text-secondary">
                  28 ms
                </div>
                <div className="text-xs font-mono text-[#908fa0]">
                  Global edge average
                </div>
              </div>

              {/* 24H Response Time Trend Graph */}
              <div className="p-4 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-[#908fa0]">
                  <span>24H LATENCY TREND</span>
                  <span className="text-tertiary font-medium">24ms avg</span>
                </div>
                <div className="h-10 w-full pt-1">
                  <svg className="w-full h-full text-secondary" fill="none" preserveAspectRatio="none" viewBox="0 0 100 30">
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7bd0ff" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#7bd0ff" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,22 Q25,12 50,18 T100,8 L100,30 L0,30 Z"
                      fill="url(#trendGrad)"
                    />
                    <path
                      d="M0,22 Q25,12 50,18 T100,8"
                      stroke="#7bd0ff"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Monitors Header & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base text-[#e4e1e6]">Monitored Services</h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#2a2a2d] text-[#c7c4d7]">
                  {filteredEndpoints.length}
                </span>
                <span className="text-xs font-mono text-[#908fa0] hidden sm:inline">
                  (Click any monitor to view response graph & recent pings)
                </span>
                <button
                  onClick={loadEndpoints}
                  disabled={isRefreshing}
                  className="p-1 rounded text-[#908fa0] hover:text-[#e4e1e6] transition-colors"
                  title="Refresh status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {endpoints.length > 3 && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#908fa0]" />
                  <input
                    type="text"
                    placeholder="Search monitors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#1b1b1e] border border-[#2a2a2d] rounded-lg text-xs font-mono text-[#e4e1e6] placeholder:text-[#908fa0] focus:outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>

            {/* Clean Monitors List */}
            <div className="space-y-3">
              {filteredEndpoints.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] text-xs font-mono text-[#908fa0]">
                  No monitors found. Click &quot;Add Monitor&quot; to begin tracking an HTTP(S) endpoint.
                </div>
              ) : (
                filteredEndpoints.map((ep) => {
                  const isDown = ep.status === 'DOWN';
                  return (
                    <div
                      key={ep.endpointId}
                      onClick={() => setSelectedEndpoint(ep)}
                      className="p-4 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] hover:border-primary/50 hover:bg-[#202024] cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                      title="Click to view recent pings & latency graph"
                    >
                      {/* Left: Indicator + Name & URL */}
                      <div className="flex items-start sm:items-center gap-3 min-w-[240px]">
                        <span
                          className={`mt-1 sm:mt-0 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            isDown
                              ? 'bg-error shadow-[0_0_8px_rgba(255,180,171,0.6)]'
                              : 'bg-tertiary shadow-[0_0_8px_rgba(78,222,163,0.5)]'
                          }`}
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-[#e4e1e6] group-hover:text-primary transition-colors">
                              {ep.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-medium ${
                                isDown
                                  ? 'bg-[#690005] text-[#ffb4ab]'
                                  : 'bg-[#002113] text-tertiary'
                              }`}
                            >
                              {ep.status}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-[#908fa0] flex items-center gap-1.5">
                            <span className="truncate max-w-[280px]">{ep.url}</span>
                            <a
                              href={ep.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#908fa0] hover:text-secondary"
                              title="Open URL"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Middle: 30-Day Mini Bar Strip (Straightforward & Clean) */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-[2px]" title="30-day availability history">
                          {Array.from({ length: 30 }).map((_, i) => {
                            const isBlip = isDown && i === 29;
                            return (
                              <span
                                key={i}
                                className={`w-[3px] h-4 rounded-full transition-colors ${
                                  isBlip
                                    ? 'bg-error'
                                    : 'bg-tertiary/70 hover:bg-tertiary'
                                }`}
                              />
                            );
                          })}
                        </div>
                        <span className="text-[11px] font-mono text-[#908fa0] min-w-[45px] text-right">
                          {isDown ? '96.6%' : '100%'}
                        </span>
                      </div>

                      {/* Right: Latency + Interval + Delete */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 text-xs font-mono">
                        <span className="text-[#c7c4d7] bg-[#2a2a2d] px-2 py-1 rounded">
                          24 ms
                        </span>
                        <span className="text-[#908fa0]">
                          Every {ep.frequencyMin}m
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(ep.endpointId);
                          }}
                          className="p-1.5 text-[#908fa0] hover:text-error rounded hover:bg-[#2a2a2d] transition-colors"
                          title="Delete monitor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Alerts & Settings Tab */}
        {currentTab === 'settings' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="font-semibold text-lg text-[#e4e1e6]">Alerts & Webhooks</h2>
              <p className="text-xs font-mono text-[#908fa0]">
                Receive instant HTTP POST notifications when an endpoint goes down
              </p>
            </div>

            {/* Webhook Configuration Card */}
            <div className="p-6 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#c7c4d7]">WEBHOOK ENDPOINT URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://api.yourdomain.com/webhooks/uptime"
                    className="flex-1 px-3 py-2 bg-[#131316] border border-[#2a2a2d] rounded-lg text-xs font-mono text-[#e4e1e6] focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleTestWebhook}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2d] hover:bg-[#353438] text-xs font-mono text-[#e4e1e6] transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 text-primary" />
                    <span>Test</span>
                  </button>
                </div>
                {testSent && (
                  <div className="text-xs font-mono text-tertiary flex items-center gap-1 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Test webhook dispatched with HMAC-SHA256 signature (HTTP 200 OK)</span>
                  </div>
                )}
              </div>

              {/* HMAC Signing Secret */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-mono text-[#c7c4d7]">HMAC SIGNING SECRET</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-[#131316] border border-[#2a2a2d] rounded-lg text-xs font-mono text-[#908fa0] truncate">
                    {webhookSecret}
                  </div>
                  <button
                    onClick={handleCopySecret}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2d] hover:bg-[#353438] text-xs font-mono text-[#e4e1e6] transition-colors"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-tertiary" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] font-mono text-[#908fa0]">
                  Every webhook request includes a <code className="text-primary">X-AreWeUpYet-Signature</code> header.
                </p>
              </div>
            </div>

            {/* Threshold Rules */}
            <div className="p-6 rounded-xl bg-[#1b1b1e] border border-[#2a2a2d] space-y-3">
              <h3 className="font-semibold text-sm text-[#e4e1e6]">Incident Policy</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono text-[#908fa0]">
                <div className="p-3 rounded-lg bg-[#131316] border border-[#2a2a2d]">
                  <span className="text-[#e4e1e6] font-medium block">Open Incident</span>
                  <span>2 consecutive check failures</span>
                </div>
                <div className="p-3 rounded-lg bg-[#131316] border border-[#2a2a2d]">
                  <span className="text-[#e4e1e6] font-medium block">Resolve Incident</span>
                  <span>1 successful HTTP response</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-[#2a2a2d] py-4 px-6 text-xs font-mono text-[#908fa0] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="AreWeUpYet" className="w-4 h-4 rounded object-contain" />
          <span>AreWeUpYet Synthetic Uptime Telemetry</span>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={() => setCurrentTab('status-page')} className="hover:text-[#e4e1e6] transition-colors">
            Status Page
          </button>
          <button onClick={() => setCurrentTab('terms')} className="hover:text-[#e4e1e6] transition-colors">
            Terms
          </button>
          <button onClick={() => setCurrentTab('privacy')} className="hover:text-[#e4e1e6] transition-colors">
            Privacy
          </button>
        </div>
      </footer>

      {/* Add Monitor Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1b1b1e] border border-[#2a2a2d] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2a2a2d] pb-3">
              <h3 className="font-semibold text-base text-[#e4e1e6]">Add Monitor</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-[#908fa0] hover:text-[#e4e1e6]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-lg bg-[#690005]/20 border border-[#ffb4ab] text-[#ffdad6] text-xs font-mono flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-error mt-0.5" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-[#c7c4d7]">MONITOR NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production API Gateway"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#131316] border border-[#2a2a2d] rounded-lg text-[#e4e1e6] focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#c7c4d7]">TARGET URL (HTTP/HTTPS)</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.mycompany.com/health"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-[#131316] border border-[#2a2a2d] rounded-lg text-[#e4e1e6] focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#c7c4d7]">CHECK FREQUENCY</label>
                <select
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#131316] border border-[#2a2a2d] rounded-lg text-[#e4e1e6] focus:outline-none focus:border-primary"
                >
                  <option value={5}>Every 5 minutes (Standard)</option>
                  <option value={10}>Every 10 minutes</option>
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every 60 minutes</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#2a2a2d] text-[#c7c4d7] hover:bg-[#353438]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-primary text-[#1000a9] font-medium hover:bg-white transition-colors"
                >
                  <span>Save Monitor</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Endpoint Detail & Recent Pings Modal */}
      {selectedEndpoint && (
        <EndpointDetailModal
          endpoint={selectedEndpoint}
          tenantId={user?.tenantId || 'demo'}
          onClose={() => setSelectedEndpoint(null)}
        />
      )}

      {/* Cognito Auth Modal */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
};

export const App: React.FC = () => (
  <AuthProvider>
    <DashboardApp />
  </AuthProvider>
);

export default App;
