import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canUseApp, getUserRole, type AppKey } from '@/lib/permissions';

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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const role = getUserRole(isAdmin, isStaff);
  
  if (!canUseApp(role, appKey)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
