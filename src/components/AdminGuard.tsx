import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          logger.authEvent('Admin access check failed - no session');
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        logger.authEvent('Checking admin access', { userId: session.user.id });

        // Try both methods to ensure compatibility
        const [verifyResult, roleResult] = await Promise.all([
          supabase.rpc('verify_user_access', { _user_id: session.user.id }),
          supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' })
        ]);

        // Check verify_user_access first
        if (verifyResult.data && typeof verifyResult.data === 'object' && 
            !Array.isArray(verifyResult.data) && 
            'has_admin_access' in verifyResult.data && 
            verifyResult.data.has_admin_access) {
          logger.authEvent('Admin access granted', { method: 'verify_user_access', userId: session.user.id });
          setIsAdmin(true);
        }
        // Fallback to has_role check
        else if (roleResult.data === true) {
          logger.authEvent('Admin access granted', { method: 'has_role', userId: session.user.id });
          setIsAdmin(true);
        }
        // Both methods failed
        else {
          logger.warn('Admin access denied', { 
            userId: session.user.id,
            verifyError: verifyResult.error,
            roleError: roleResult.error 
          });
          setIsAdmin(false);
          toast.error('Admin access required for this page');
        }
      } catch (error) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        logger.error('Admin access check failed', error as Error, { userId: currentSession?.user?.id });
        setIsAdmin(false);
        toast.error('Authentication error - please try refreshing the page');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();

    // Set up auth state listener to recheck on auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      logger.authEvent('Auth state changed - rechecking admin access');
      setLoading(true);
      checkAdminAccess();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}