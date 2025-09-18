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
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Use the new verify_user_access function to check admin role
        const { data: access, error } = await supabase.rpc('verify_user_access', { 
          _user_id: session.user.id 
        });

        if (error) {
          console.error('Admin access verification failed:', error);
          setIsAdmin(false);
          toast.error('Failed to verify admin access');
        } else {
          // Check if user has admin access specifically
          const hasAdminAccess = access && typeof access === 'object' && 'has_admin_access' in access && access.has_admin_access;
          setIsAdmin(Boolean(hasAdminAccess));
          
          if (!hasAdminAccess) {
            toast.error('Admin access required for this page');
          }
        }
      } catch (error) {
        console.error('Admin guard error:', error);
        setIsAdmin(false);
        toast.error('Authentication error');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
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