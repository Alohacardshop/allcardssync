import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { AdminGuard } from '@/components/AdminGuard';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

/**
 * Layout wrapper for admin routes
 * Provides auth guards and suspense boundary
 */
export function AdminLayout() {
  return (
    <AuthGuard>
      <AdminGuard>
        <Suspense fallback={<FullScreenLoader title="Loading" subtitle="Loading admin tools…" />}>
          <Outlet />
        </Suspense>
      </AdminGuard>
    </AuthGuard>
  );
}
