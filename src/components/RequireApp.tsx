import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canUseApp, getUserRole, type AppKey } from '@/lib/permissions';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

interface RequireAppProps {
  appKey: AppKey;
  children: React.ReactNode;
}

/**
 * Route guard that checks if the current user can access an app
 * Redirects to dashboard home if access is denied
 */
export function RequireApp({ appKey, children }: RequireAppProps) {
  const { isAdmin, isStaff, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader title="Loading…" subtitle="Verifying app access…" />;
  }

  const role = getUserRole(isAdmin, isStaff);
  
  if (!canUseApp(role, appKey)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
