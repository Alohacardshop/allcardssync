import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';
import { UserX } from 'lucide-react';
import { PATHS } from '@/routes/paths';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isStaff, isAdmin, loading } = useAuth();

  // User is authorized if they have staff or admin access
  const isAuthorized = isStaff || isAdmin;

  if (loading) {
    return <FullScreenLoader title="Checking Session" subtitle="Verifying your credentials…" />;
  }

  if (!user) {
    logger.info('AuthGuard: Redirecting to auth page - no user', {}, 'auth');
    return <Navigate to={PATHS.auth} replace />;
  }

  if (!isAuthorized) {
    logger.warn('AuthGuard: Access denied - insufficient permissions', { userId: user.id }, 'auth');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
            <UserX className="w-8 h-8 text-warning" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Access Restricted</h1>
            <p className="text-muted-foreground">
              Your account is signed in but not authorized to access this application. 
              Please contact an administrator to grant you Staff access.
            </p>
          </div>
          <Button onClick={() => supabase.auth.signOut()} variant="outline">
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
