import React, { useState } from 'react';
import { X, Lock, Mail, ArrowRight, ShieldCheck, Building2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp, user } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      if (isRegister) {
        await signUp(email, password, tenantId || undefined);
      } else {
        await signIn(email, password, tenantId || undefined);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoTenant: string) => {
    await signIn(demoEmail, 'secret123', demoTenant);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-surface-container border border-[#353438] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#353438] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base text-[#e4e1e6]">
                {isRegister ? 'Create Cognito Account' : 'Cognito User Sign In'}
              </h3>
              <p className="text-[11px] font-mono text-[#908fa0]">
                Multi-tenant IAM & workspace authorization
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#908fa0] hover:text-[#e4e1e6]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#690005]/20 border border-[#ffb4ab] text-[#ffdad6] text-xs font-mono">
            {error}
          </div>
        )}

        {/* Quick Identity Switcher for Testing */}
        <div className="p-3 rounded-xl bg-surface-container-low border border-[#353438] space-y-2 text-xs font-mono">
          <div className="text-[10px] text-[#908fa0] uppercase tracking-wider font-semibold">
            Quick Test Identifiers
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@acme.corp', 'demo')}
              className="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container border border-[#464554] text-[#c7c4d7] hover:text-primary transition-colors text-[11px]"
            >
              Acme Corp (demo)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('dev@globex.io', 'globex')}
              className="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container border border-[#464554] text-[#c7c4d7] hover:text-secondary transition-colors text-[11px]"
            >
              Globex Inc (globex)
            </button>
          </div>
          {user && (
            <div className="text-[11px] text-tertiary pt-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Current session: {user.email} [{user.tenantId}]</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div className="space-y-1.5">
            <label className="text-[#c7c4d7] flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#908fa0]" />
              <span>EMAIL ADDRESS</span>
            </label>
            <input
              type="email"
              required
              placeholder="operator@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[#c7c4d7] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#908fa0]" />
              <span>PASSWORD</span>
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[#c7c4d7] flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#908fa0]" />
              <span>WORKSPACE TENANT ID (OPTIONAL)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. acme-cloud (defaults to demo)"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-[#908fa0] hover:text-[#e4e1e6] text-[11px] underline"
            >
              {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
            </button>

            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-[#1000a9] font-medium hover:bg-primary-container shadow"
            >
              <span>{isRegister ? 'Register' : 'Authenticate'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
