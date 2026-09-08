import React, { useState } from 'react';
import { Shield, Bell, Send, CheckCircle2, AlertCircle } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [webhookUrl, setWebhookUrl] = useState('https://api.mycompany.com/webhooks/uptime');
  const [secret, setSecret] = useState('sec_live_9b8f41e0a24d57c3e1b');
  const [testSent, setTestSent] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTestPing = () => {
    setTestError(null);
    if (webhookUrl.includes('127.0.0.1') || webhookUrl.includes('localhost')) {
      setTestError('SSRF Guard: Private destination URLs are blocked from webhook delivery.');
      return;
    }
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6 text-[#e4e1e6]">
      <div>
        <h2 className="font-display font-semibold text-xl text-[#e4e1e6]">Workspace Telemetry Settings</h2>
        <p className="text-xs font-mono text-[#908fa0]">Manage alert dispatchers, HMAC secrets, and free tier limits</p>
      </div>

      {/* Webhook Alerting Configuration */}
      <div className="p-6 rounded-2xl bg-surface-container border border-[#353438] space-y-4">
        <div className="flex items-center justify-between border-b border-[#353438] pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-secondary" />
            <h3 className="font-display font-medium text-base">Primary Alerting Webhook</h3>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-mono bg-[#002113] text-tertiary border border-[#005236]">
            Active
          </span>
        </div>

        <p className="text-xs text-[#c7c4d7]">
          We dispatch signed JSON payloads on incident state transitions (`incident.opened` and `incident.resolved`).
          Deliveries are authenticated with HMAC-SHA256 signatures via the `X-AreWeUpYet-Signature` header.
        </p>

        {testError && (
          <div className="p-3 rounded-xl bg-[#690005]/20 border border-[#ffb4ab] text-[#ffdad6] text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-error" />
            <span>{testError}</span>
          </div>
        )}

        {testSent && (
          <div className="p-3 rounded-xl bg-[#002113] border border-[#005236] text-tertiary text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-tertiary" />
            <span>Simulated test webhook payload dispatched with HMAC signature!</span>
          </div>
        )}

        <div className="space-y-3 text-xs font-mono">
          <div className="space-y-1.5">
            <label className="text-[#c7c4d7]">WEBHOOK POST URL</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[#c7c4d7]">HMAC SIGNING SECRET</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={secret}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#c7c4d7] font-mono outline-none cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setSecret('sec_live_' + Math.random().toString(36).substring(2))}
                className="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-[#39393c] text-xs font-mono text-[#e4e1e6] whitespace-nowrap"
              >
                Rotate
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-[#908fa0]">Flapping cooldown: 5 minutes between notifications</span>
            <button
              type="button"
              onClick={handleTestPing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-[#39393c] text-secondary font-medium transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test Webhook</span>
            </button>
          </div>
        </div>
      </div>

      {/* Free Tier Hard Limits Guardrail */}
      <div className="p-6 rounded-2xl bg-surface-container border border-[#353438] space-y-4">
        <div className="flex items-center gap-2 border-b border-[#353438] pb-3">
          <Shield className="w-5 h-5 text-tertiary" />
          <h3 className="font-display font-medium text-base">AWS Always-Free Tier Guardrails</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438] space-y-1">
            <span className="text-[#908fa0]">TENANT ENDPOINT CAP</span>
            <div className="text-base font-display font-semibold text-[#e4e1e6]">20 Monitors</div>
            <p className="text-[10px] text-tertiary">Enforced at API layer</p>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438] space-y-1">
            <span className="text-[#908fa0]">MINIMUM CHECK FLOOR</span>
            <div className="text-base font-display font-semibold text-[#e4e1e6]">5 Minutes</div>
            <p className="text-[10px] text-tertiary">Prevents compute exhaustion</p>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438] space-y-1">
            <span className="text-[#908fa0]">RAW PING RETENTION</span>
            <div className="text-base font-display font-semibold text-[#e4e1e6]">90 Days (TTL)</div>
            <p className="text-[10px] text-tertiary">Auto-purged within 25 GB limit</p>
          </div>
        </div>
      </div>
    </div>
  );
};
