import React, { useState } from 'react';
import { X, Lock, Mail, ArrowRight, KeyRound, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthStep = 'SIGN_IN' | 'SIGN_UP' | 'CONFIRM_CODE';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp, confirmSignUp, resendConfirmationCode } = useAuth();
  const [step, setStep] = useState<AuthStep>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'CONFIRM_SIGN_UP_REQUIRED') {
        setInfoMessage('Please verify your email with the confirmation code.');
        setStep('CONFIRM_CODE');
      } else {
        const msg = err instanceof Error ? err.message : 'Sign in failed. Check email and password.';
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUp(email, password);
      if (res.isSignUpComplete) {
        await signIn(email, password);
        onClose();
      } else {
        setInfoMessage(`A verification code was sent to ${email}. Check your inbox.`);
        setStep('CONFIRM_CODE');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    try {
      await confirmSignUp(email, confirmationCode);
      // Automatically sign in with the saved credentials
      if (password) {
        await signIn(email, password);
      } else {
        setStep('SIGN_IN');
        setInfoMessage('Account verified! Please sign in.');
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid verification code.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setIsResending(true);
    try {
      await resendConfirmationCode(email);
      setInfoMessage(`New verification code sent to ${email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code';
      setError(msg);
    } finally {
      setIsResending(false);
    }
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
                {step === 'SIGN_IN' && 'Sign In to Workspace'}
                {step === 'SIGN_UP' && 'Create AreWeUpYet Account'}
                {step === 'CONFIRM_CODE' && 'Verify Email Address'}
              </h3>
              <p className="text-[11px] font-mono text-[#908fa0]">
                {step === 'CONFIRM_CODE'
                  ? 'Enter the 6-digit code sent to your email'
                  : 'Multi-tenant AWS Cognito authentication'}
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

        {infoMessage && (
          <div className="p-3 rounded-xl bg-tertiary/10 border border-tertiary/30 text-tertiary text-xs font-mono">
            {infoMessage}
          </div>
        )}

        {/* Step: Confirm Email Code */}
        {step === 'CONFIRM_CODE' ? (
          <form onSubmit={handleConfirmSubmit} className="space-y-4 text-xs font-mono">
            <div className="space-y-1.5">
              <label className="text-[#c7c4d7] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#908fa0]" />
                <span>CONFIRMATION CODE</span>
              </label>
              <input
                type="text"
                required
                placeholder="123456"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-lowest border border-[#353438] text-[#e4e1e6] focus:border-primary outline-none tracking-widest text-center text-sm font-semibold"
                maxLength={6}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="text-[#908fa0] hover:text-[#e4e1e6] text-[11px] flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isResending ? 'animate-spin' : ''}`} />
                <span>Resend Code</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-[#1000a9] font-medium hover:bg-primary-container shadow disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Verifying...' : 'Verify & Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          /* Step: Sign In or Sign Up */
          <form
            onSubmit={step === 'SIGN_IN' ? handleSignInSubmit : handleSignUpSubmit}
            className="space-y-4 text-xs font-mono"
          >
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
              {step === 'SIGN_UP' && (
                <p className="text-[10px] text-[#908fa0]">
                  Min 8 chars, including uppercase, lowercase, numbers, and symbols.
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setInfoMessage(null);
                  setStep(step === 'SIGN_IN' ? 'SIGN_UP' : 'SIGN_IN');
                }}
                className="text-[#908fa0] hover:text-[#e4e1e6] text-[11px] underline"
              >
                {step === 'SIGN_IN' ? "Don't have an account? Register" : 'Already have an account? Sign In'}
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-[#1000a9] font-medium hover:bg-primary-container shadow disabled:opacity-50"
              >
                <span>
                  {isSubmitting
                    ? 'Processing...'
                    : step === 'SIGN_IN'
                    ? 'Sign In'
                    : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
