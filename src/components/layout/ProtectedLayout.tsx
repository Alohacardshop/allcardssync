import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingSpinner } from '@/components/LoadingSpinner';

/**
 * Layout wrapper for protected routes with AppShell
 * Provides auth guard, app shell, and suspense boundary
 */
export function ProtectedLayout() {
  return (
    <AuthGuard>
      <AppShell>
        <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><LoadingSpinner size="lg" /></div>}>
          <Outlet />
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}
