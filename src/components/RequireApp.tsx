import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canUseApp, getUserRole, type AppKey } from '@/lib/permissions';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

interface RequireAppProps {
  appKey: AppKey;
  children: React.ReactNode;
}

/**
 * Route guard that checks if the current user can access an app
 * Shows a friendly message and redirects to dashboard if access is denied
 */
export function RequireApp({ appKey, children }: RequireAppProps) {
  const { isAdmin, isStaff, loading } = useAuth();
  const navigate = useNavigate();
  const [showDenied, setShowDenied] = useState(false);

  const role = getUserRole(isAdmin, isStaff);
  const hasAccess = canUseApp(role, appKey);

  useEffect(() => {
    if (!loading && !hasAccess) {
      setShowDenied(true);
      
      // Auto-redirect after 3 seconds
      const timer = setTimeout(() => {
        navigate('/', { replace: true });
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [loading, hasAccess, navigate]);

  if (loading) {
    return <FullScreenLoader title="Loading…" subtitle="Verifying app access…" />;
  }

  if (showDenied || !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
        <div className="text-center max-w-md space-y-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Access Restricted</h1>
            <p className="text-sm text-muted-foreground">
              Your role doesn't have access to this feature. 
              Redirecting you to the dashboard…
            </p>
          </div>
          <Button onClick={() => navigate('/', { replace: true })} variant="outline" size="sm">
            Go to Dashboard Now
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
