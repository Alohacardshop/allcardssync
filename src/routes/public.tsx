import { Suspense, lazy } from 'react';
import { Route } from 'react-router-dom';
import { PATHS } from './paths';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

// Auth page is heavy (form validation, OAuth), lazy load it
const Auth = lazy(() => import('@/pages/Auth'));

// Privacy is a simple static page - no lazy loading needed
import Privacy from '@/pages/Privacy';

/**
 * Public routes - accessible without authentication
 * Each route wraps its lazy components in Suspense
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
  </>
);
