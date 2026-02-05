import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/layout/AppShell';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

/**
 * Layout wrapper for protected routes with AppShell
 * Provides auth guard, app shell, and suspense boundary
 */
export function ProtectedLayout() {
  return (
    <AuthGuard>
      <AppShell>
        <Suspense fallback={<FullScreenLoader title="Loading…" subtitle="Loading app…" />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}
