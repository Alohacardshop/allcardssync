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
    let isMounted = true;

    const checkAdminAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        if (!session?.user) {
          logger.authEvent('Admin access check failed - no session');
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        logger.authEvent('Checking admin access', { userId: session.user.id });

        // Use verify_user_access as primary method with timeout
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Admin check timeout')), 8000)
        );

        const verifyResult = await Promise.race([
          supabase.rpc('verify_user_access', { _user_id: session.user.id }),
          timeoutPromise
        ]);

        if (!isMounted) return;

        // Check verify_user_access result
        if (verifyResult.data && typeof verifyResult.data === 'object' && 
            !Array.isArray(verifyResult.data) && 
            'has_admin_access' in verifyResult.data && 
            verifyResult.data.has_admin_access) {
          logger.authEvent('Admin access granted', { method: 'verify_user_access', userId: session.user.id });
          setIsAdmin(true);
        } else {
          logger.warn('Admin access denied', { 
            userId: session.user.id,
            verifyError: verifyResult.error
          });
          setIsAdmin(false);
          toast.error('Admin access required for this page');
        }
      } catch (error) {
        if (!isMounted) return;
        
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        logger.error('Admin access check failed', error as Error, { userId: currentSession?.user?.id });
        setIsAdmin(false);
        toast.error('Authentication error - please try refreshing the page');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAdminAccess();

    // Only recheck on sign-in/sign-out events, not on token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted) return;
      
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        logger.authEvent('Auth state changed - rechecking admin access', { event });
        setLoading(true);
        checkAdminAccess();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
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