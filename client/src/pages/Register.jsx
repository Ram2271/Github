import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, ArrowLeft, RefreshCw, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { user, register, verifyRegister, resendVerificationCode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Step state: 'details' | 'verification'
  const [step, setStep] = useState('details');

  // Form states
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Verification metadata
  const [targetEmail, setTargetEmail] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Status states
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Countdown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await register(username.trim(), email.trim(), password, name.trim());
      if (res && res.requiresVerification) {
        setTargetEmail(res.email);
        setInfoMessage(res.message || `Enter the 6-digit verification code sent to ${res.email}.`);
        setStep('verification');
        setCooldown(30);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await verifyRegister(targetEmail, cleanCode);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      await resendVerificationCode(targetEmail, 'signup');
      setCooldown(30);
      setInfoMessage('A new 6-digit verification code has been dispatched to your email.');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12 text-xs">
      <Link to="/" className="mb-6 text-white hover:opacity-80 transition-opacity">
        <svg height="48" viewBox="0 0 16 16" width="48" fill="currentColor">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
        </svg>
      </Link>

      <h1 className="text-xl sm:text-2xl font-light text-white mb-4 tracking-tight">
        {step === 'details' ? 'Create your account' : 'Verify your email'}
      </h1>

      {error && (
        <div className="w-full max-w-sm mb-4 p-3 bg-red-950/40 border border-red-900/60 rounded text-red-400 text-center text-xs animate-shake">
          {error}
        </div>
      )}

      {step === 'details' ? (
        /* STEP 1: Registration Form */
        <div className="w-full max-w-sm bg-gh-surface border border-gh-border rounded-lg p-5 shadow-2xl space-y-4">
          <form onSubmit={handleDetailsSubmit} className="space-y-3">
            <div>
              <label className="block text-gh-text font-medium mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="monalisa"
                className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
            </div>

            <div>
              <label className="block text-gh-text font-medium mb-1">Full name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mona Lisa Octocat"
                className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
            </div>

            <div>
              <label className="block text-gh-text font-medium mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
            </div>

            <div>
              <label className="block text-gh-text font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Sending verification code...' : 'Continue to Email Verification'}
            </button>
          </form>

          <p className="text-[11px] text-gh-muted text-center leading-relaxed">
            A 6-digit verification code will be sent to your email to verify account ownership.
          </p>
        </div>
      ) : (
        /* STEP 2: Email Verification Code Entry */
        <div className="w-full max-w-sm bg-gh-surface border border-gh-border rounded-lg p-6 shadow-2xl space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-gh-green/10 border border-gh-green/30 text-gh-green flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-sm font-semibold text-gh-text">Verify your email address</h2>
            <p className="text-gh-muted text-xs leading-relaxed">
              We sent a 6-digit verification code to <strong className="text-gh-text font-mono">{targetEmail}</strong>.
            </p>
            <p className="text-[11px] text-gh-muted">
              Please check your inbox (and spam folder) and enter the 6 digits below to complete your registration.
            </p>
          </div>

          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div>
              <label className="block text-gh-text font-medium mb-1.5 text-center">
                Enter 6-digit verification code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(val);
                }}
                maxLength={6}
                autoFocus
                placeholder="••••••"
                className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-2.5 text-center text-xl font-mono tracking-[0.35em] text-white focus:outline-none focus:border-gh-link placeholder:tracking-normal placeholder:text-gh-muted selection:bg-gh-link/30"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? 'Creating account...' : 'Verify and Create Account'}
            </button>
          </form>

          {/* Resend and Return Actions */}
          <div className="pt-3 border-t border-gh-border flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              className="text-gh-link hover:underline disabled:text-gh-muted disabled:no-underline flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('details');
                setCode('');
                setError('');
              }}
              className="text-gh-muted hover:text-gh-text flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Edit details
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm mt-4 p-4 border border-gh-border rounded-lg bg-gh-surface text-center text-gh-text">
        Already have an account?{' '}
        <Link to="/login" className="text-gh-link hover:underline font-semibold">
          Sign in
        </Link>
        .
      </div>
    </div>
  );
}
