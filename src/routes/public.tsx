import { Suspense, lazy } from 'react';
import { Route } from 'react-router-dom';
import { PATHS } from './paths';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

const Auth = lazy(() => import('@/pages/Auth'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

import Privacy from '@/pages/Privacy';
import NotFound from '@/pages/NotFound';

/**
 * Public routes - accessible without authentication
 * Each route wraps its lazy components in Suspense
 * The catch-all (*) renders NotFound for unknown routes without requiring auth
 */
export const publicRoutes = (
  <>
    <Route 
      path={PATHS.auth} 
      element={
        <Suspense fallback={<FullScreenLoader title="Loading" subtitle="Preparing sign in…" />}>
          <Auth />
        </Suspense>
      } 
    />
    <Route path={PATHS.privacy} element={<Privacy />} />
    {/* Public catch-all - shows NotFound without requiring authentication */}
    <Route path="*" element={<NotFound />} />
  </>
);
