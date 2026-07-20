'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';
import api from '@/utils/api';
import { useAuthStore } from '@/store/useAuthStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const router = useRouter();
  const initializedRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setFormLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken } = response.data;
      setAuth(user, accessToken);
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setFormLoading(false);
    }
  };

  const handleGoogleLogin = async (response: any) => {
    setError(null);
    setFormLoading(true);
    try {
      const apiResponse = await api.post('/auth/google', { credential: response.credential });
      const { user, accessToken } = apiResponse.data;
      setAuth(user, accessToken);
      router.push('/');
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setError(err.response?.data?.error || 'Google sign-in failed. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const initGoogleButton = () => {
    const google = (window as any).google;
    if (google && !initializedRef.current) {
      try {
        google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleLogin,
        });
        google.accounts.id.renderButton(
          document.getElementById('googleButton'),
          { theme: 'outline', size: 'large', text: 'continue_with', width: 382 }
        );
        initializedRef.current = true;
      } catch (err) {
        console.error('Error rendering Google button:', err);
      }
    }
  };

  useEffect(() => {
    const google = (window as any).google;
    if (google) {
      initGoogleButton();
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <img src="/logo.png" alt="AetherDrive Logo" className="h-40 w-auto mix-blend-multiply mb-2" />
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to access your workspaces
          </p>
        </div>

        {/* Minimalist White Card */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Email Address
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4.5 w-4.5 text-slate-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-slate-350 bg-white py-2 pl-10 pr-3 text-slate-900 placeholder-slate-400 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 text-sm"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Password
                </label>
              </div>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4.5 w-4.5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-355 bg-white py-2 pl-10 pr-3 text-slate-900 placeholder-slate-400 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="group relative flex w-full justify-center items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm hover:shadow-md"
            >
              {formLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-semibold tracking-wider">Or</span>
            </div>
          </div>

          <div className="flex justify-center w-full min-h-[44px]">
            <div id="googleButton" className="w-full"></div>
          </div>

          <Script
            src="https://accounts.google.com/gsi/client"
            onLoad={initGoogleButton}
            strategy="lazyOnload"
          />

          <div className="mt-6 text-center border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500">
              New to AetherDrive?{' '}
              <Link
                href="/register"
                className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
