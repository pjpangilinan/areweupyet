import React, { useState } from 'react';
import { X, ShieldAlert, ArrowRight } from 'lucide-react';
import type { Endpoint } from '../types';
import { useAuth } from '../auth/AuthContext';

interface CreateMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (endpoint: Endpoint) => void;
  currentCount: number;
}

export const CreateMonitorModal: React.FC<CreateMonitorModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  currentCount,
}) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [frequency, setFrequency] = useState(5);
  const timeoutSec = 10;
  const [expectedStatus, setExpectedStatus] = useState(200);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (currentCount >= 20) {
      setError('Workspace monitor limit reached: Maximum 20 active probes allocated.');
      return;
    }

    if (!name.trim()) {
      setError('Probe name is required.');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }

    // SSRF client-side security checks
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.includes('127.0.0.1') ||
      lowerUrl.includes('localhost') ||
      lowerUrl.includes('169.254.') ||
      lowerUrl.includes('10.') ||
      lowerUrl.includes('192.168.')
    ) {
      setError('SSRF Guard: Target URL points to a reserved, loopback, or cloud metadata address.');
      return;
    }

    if (frequency < 5) {
      setError('Minimum check interval floor is 5 minutes.');
      return;
    }

    const now = new Date().toISOString();
    const newEp: Endpoint = {
      tenantId: user?.tenantId || '',
      endpointId: `ep-${Date.now()}`,
      name: name.trim(),
      url: url.trim(),
      frequencyMin: frequency,
      timeoutSec: timeoutSec,
      expectedStatus: expectedStatus,
      status: 'PENDING',
      nextCheckAt: now,
      consecutiveFail: 0,
      createdAt: now,
      updatedAt: now,
    };

    onAdd(newEp);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-surface-container border border-[#353438] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#353438] pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-[#e4e1e6]">Configure New Probe</h3>
            <p className="text-xs font-mono text-[#908fa0]">Automated HTTP(S) synthetic health monitoring</p>
          </div>
          <button onClick={onClose} className="text-[#908fa0] hover:text-[#e4e1e6]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#690005]/20 border border-[#ffb4ab] text-[#ffdad6] text-xs font-mono flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-error mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div className="space-y-1.5">
            <label className="text-[#c7c4d7]">PROBE NAME</label>
            <input
              type="text"
              required
              placeholder="e.g. Core Auth Service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[#c7c4d7]">TARGET URL (SSRF GUARD PROTECTED)</label>
            <input
              type="url"
              required
              placeholder="https://auth.company.com/health"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[#c7c4d7]">INTERVAL (FLOOR: 5M)</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
              >
                <option value={5}>Every 5 minutes</option>
                <option value={10}>Every 10 minutes</option>
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every 60 minutes</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[#c7c4d7]">EXPECTED STATUS</label>
              <input
                type="number"
                value={expectedStatus}
                onChange={(e) => setExpectedStatus(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438] text-[11px] text-[#908fa0] space-y-1">
            <div className="flex items-center justify-between">
              <span>Workspace Capacity:</span>
              <strong className="text-[#e4e1e6]">{currentCount} / 20 Used</strong>
            </div>
            <p>2 consecutive check failures will open an incident and dispatch webhook alerts.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-container-high text-[#c7c4d7] hover:bg-[#39393c]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-[#1000a9] font-medium hover:bg-primary-container shadow"
            >
              <span>Deploy Probe</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
