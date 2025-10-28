import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isStaff, isAdmin, loading } = useAuth();

  // User is authorized if they have staff or admin access
  const isAuthorized = isStaff || isAdmin;

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

  if (!user) {
    logger.info('AuthGuard: Redirecting to auth page - no user', {}, 'auth');
    return <Navigate to="/auth" replace />;
  }

  if (!isAuthorized) {
    logger.warn('AuthGuard: Access denied - insufficient permissions', { userId: user.id }, 'auth');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Restricted</h1>
          <p className="text-muted-foreground mb-6">
            Your account is signed in but not authorized to access this application. 
            Please contact an administrator to grant you Staff access.
          </p>
          <Button onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}