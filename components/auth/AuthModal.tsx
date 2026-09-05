'use client';

import React, { useState } from 'react';
import { useAuth, UserRole } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Sparkles, 
  Mail, 
  Lock, 
  User as UserIcon, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  KeyRound,
  GraduationCap,
  BookOpen
} from 'lucide-react';

interface AuthModalProps {
  initialRole?: UserRole | null;
  onSuccess?: () => void;
}

export function AuthModal({ initialRole, onSuccess }: AuthModalProps) {
  const { 
    loginWithEmail, 
    signUpWithEmail, 
    loginWithGoogle, 
    resetPassword,
    authError, 
    clearError 
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole || 'student');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    setResetSent(false);

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, name, selectedRole);
      } else if (mode === 'reset') {
        await resetPassword(email);
        setResetSent(true);
      }
      if (mode !== 'reset' && onSuccess) {
        onSuccess();
      }
    } catch {
      // Error handled by AuthContext state
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearError();
    setSubmitting(true);
    try {
      await loginWithGoogle();
      if (onSuccess) onSuccess();
    } catch {
      // Error handled by AuthContext state
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-7 bg-[#fbfaf7] border border-[#e8e2d8] rounded-[28px] shadow-[0_24px_70px_rgba(24,19,14,0.14)] text-[#111]">
      {/* Header section */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#111] text-white font-black text-lg mb-3 shadow-sm">
          <span>4</span>
        </div>
        
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f1ece5] border border-[#e5dfd6] text-[11px] font-bold tracking-wider uppercase text-[#6f685f] mb-2">
          <Sparkles className="w-3 h-3 text-[#706a63]" />
          <span>SLearn</span>
        </div>

        <h2 className="text-2xl font-medium tracking-tight text-[#111]">
          {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
        </h2>
        <p className="text-xs text-[#706a63] mt-1 max-w-[280px] mx-auto">
          {mode === 'login' 
            ? 'Sign in to access your personalized classrooms and lessons' 
            : mode === 'signup'
            ? 'Join SLearn to unlock adaptive tools for students & teachers'
            : 'Enter your account email to receive a password reset link'}
        </p>
      </div>

      {/* Error alert with front page pastel styling */}
      {authError && (
        <div className="mb-4 p-3.5 rounded-2xl bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#dc2626]" />
          <span className="leading-relaxed">{authError}</span>
        </div>
      )}

      {/* Reset confirmation banner */}
      {resetSent && (
        <div className="mb-4 p-3.5 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16a34a]" />
          <span className="leading-relaxed">Password reset link sent! Check your inbox to proceed.</span>
        </div>
      )}

      {/* Google Sign-In button styled like the front-page role cards */}
      {mode !== 'reset' && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-white hover:bg-[#faf8f5] text-[#111] font-semibold text-sm border border-[#e5dfd6] transition-all shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(34,28,21,0.07)] hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50 mb-4"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e8e2d8]"></div>
            </div>
            <span className="relative px-3 bg-[#fbfaf7] text-[11px] font-bold uppercase tracking-wider text-[#918a80]">
              Or with email
            </span>
          </div>
        </>
      )}

      {/* Main Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'signup' && (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6f685f] mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-[#8c857b]" />
              <Input
                type="text"
                required
                placeholder="e.g. Cikgu Aina"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 bg-white border-[#e5dfd6] text-[#111] placeholder:text-[#a8a196] focus-visible:ring-[#111] focus-visible:border-[#111] rounded-2xl h-11 text-sm shadow-none"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6f685f] mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3 w-4 h-4 text-[#8c857b]" />
            <Input
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 bg-white border-[#e5dfd6] text-[#111] placeholder:text-[#a8a196] focus-visible:ring-[#111] focus-visible:border-[#111] rounded-2xl h-11 text-sm shadow-none"
            />
          </div>
        </div>

        {mode !== 'reset' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6f685f]">
                Password
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setMode('reset');
                  }}
                  className="text-[11px] font-semibold text-[#6f685f] hover:text-[#111] transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-[#8c857b]" />
              <Input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white border-[#e5dfd6] text-[#111] placeholder:text-[#a8a196] focus-visible:ring-[#111] focus-visible:border-[#111] rounded-2xl h-11 text-sm shadow-none"
              />
            </div>
          </div>
        )}

        {/* Role selector in sign-up mode using front-page pastel colors */}
        {mode === 'signup' && (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6f685f] mb-1.5">
              Joining As
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedRole('student')}
                className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                  selectedRole === 'student'
                    ? 'bg-[#c8e8dc] border-[#b2dccf] shadow-sm text-[#111]'
                    : 'bg-white border-[#e5dfd6] text-[#6f685f] hover:bg-[#faf8f5]'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedRole === 'student' ? 'bg-white text-[#111]' : 'bg-[#f4f0ea] text-[#706a63]'
                }`}>
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <b className="block text-xs font-semibold">Student</b>
                  <small className="block text-[10px] opacity-75">Learn & track</small>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('teacher')}
                className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                  selectedRole === 'teacher'
                    ? 'bg-[#f3c3c5] border-[#e8adb0] shadow-sm text-[#111]'
                    : 'bg-white border-[#e5dfd6] text-[#6f685f] hover:bg-[#faf8f5]'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedRole === 'teacher' ? 'bg-white text-[#111]' : 'bg-[#f4f0ea] text-[#706a63]'
                }`}>
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <b className="block text-xs font-semibold">Teacher</b>
                  <small className="block text-[10px] opacity-75">Guide & create</small>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        <Button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#111] hover:bg-[#222] text-white font-semibold rounded-full h-11 mt-3 flex items-center justify-center gap-2 transition-all shadow-[0_4px_14px_rgba(17,17,17,0.18)] active:scale-[0.99] text-sm"
        >
          {submitting ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : (
            <>
              <span>{mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>

      {/* Switch Mode Footer */}
      <div className="mt-6 pt-4 border-t border-[#e8e2d8] text-center text-xs text-[#706a63]">
        {mode === 'login' ? (
          <p>
            Don't have an account?{' '}
            <button
              onClick={() => {
                clearError();
                setMode('signup');
              }}
              className="text-[#111] hover:underline font-bold ml-1"
            >
              Sign up
            </button>
          </p>
        ) : mode === 'signup' ? (
          <p>
            Already have an account?{' '}
            <button
              onClick={() => {
                clearError();
                setMode('login');
              }}
              className="text-[#111] hover:underline font-bold ml-1"
            >
              Sign in
            </button>
          </p>
        ) : (
          <button
            onClick={() => {
              clearError();
              setMode('login');
            }}
            className="text-[#111] hover:underline inline-flex items-center gap-1.5 font-bold"
          >
            <KeyRound className="w-3.5 h-3.5" /> Back to Sign In
          </button>
        )}
      </div>
    </div>
  );
}
