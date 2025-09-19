import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
          console.log('AdminGuard: No session found');
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        console.log('AdminGuard: Checking access for user:', session.user.id);

        // Try both methods to ensure compatibility
        const [verifyResult, roleResult] = await Promise.all([
          supabase.rpc('verify_user_access', { _user_id: session.user.id }),
          supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' })
        ]);

        console.log('AdminGuard: verify_user_access result:', verifyResult);
        console.log('AdminGuard: has_role result:', roleResult);

        // Check verify_user_access first
        if (verifyResult.data && typeof verifyResult.data === 'object' && 
            !Array.isArray(verifyResult.data) && 
            'has_admin_access' in verifyResult.data && 
            verifyResult.data.has_admin_access) {
          console.log('AdminGuard: Access granted via verify_user_access');
          setIsAdmin(true);
        }
        // Fallback to has_role check
        else if (roleResult.data === true) {
          console.log('AdminGuard: Access granted via has_role');
          setIsAdmin(true);
        }
        // Both methods failed
        else {
          console.log('AdminGuard: Access denied');
          setIsAdmin(false);
          
          // Log detailed error info
          if (verifyResult.error) {
            console.error('verify_user_access error:', verifyResult.error);
          }
          if (roleResult.error) {
            console.error('has_role error:', roleResult.error);
          }
          
          toast.error('Admin access required for this page');
        }
      } catch (error) {
        console.error('AdminGuard: Exception during access check:', error);
        setIsAdmin(false);
        toast.error('Authentication error - please try refreshing the page');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();

    // Set up auth state listener to recheck on auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      console.log('AdminGuard: Auth state changed, rechecking access');
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