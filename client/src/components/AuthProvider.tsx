'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../store/useAuthStore';

const PUBLIC_ROUTES = ['/login', '/register'];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshSession, setLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const initAuth = async () => {
      // Attempt to refresh session (silent log in using httpOnly cookie)
      await refreshSession();
      setLoading(false);
    };
    initAuth();
  }, [refreshSession, setLoading]);

  useEffect(() => {
    if (loading) return;

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    if (!user && !isPublicRoute) {
      // Redirect unauthenticated users to login
      router.push('/login');
    } else if (user && isPublicRoute) {
      // Redirect authenticated users away from login/register to dashboard
      router.push('/');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-white">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-800 border-t-indigo-500"></div>
          <div className="absolute h-8 w-8 rounded-full bg-indigo-500/20 blur-md"></div>
        </div>
        <h2 className="mt-6 text-lg font-semibold tracking-wide text-slate-350">
          Loading your workspace...
        </h2>
        <p className="mt-1 text-sm text-slate-500">Securing connection</p>
      </div>
    );
  }

  return <>{children}</>;
}
