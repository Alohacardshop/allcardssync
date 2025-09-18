import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { resetLogin } from '@/lib/authUtils';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasRole, setHasRole] = useState(false);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('AuthGuard auth state change:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Use setTimeout to defer async operations and prevent blocking
          setTimeout(async () => {
            const uid = session.user.id;
            
            try {
              // Use the new verify_user_access function
              const { data: access, error } = await supabase.rpc('verify_user_access', { _user_id: uid });
              
              if (error) {
                console.error('Access verification failed:', error);
                setHasRole(false);
                setLoading(false);
                return;
              }
              
              if (access && typeof access === 'object' && 'access_granted' in access && access.access_granted) {
                setHasRole(true);
              } else {
                // Try bootstrap for admin role (for initial setup)
                try {
                  const { data: bootstrap } = await supabase.rpc('bootstrap_user_admin', { _target_user_id: uid });
                  if (bootstrap && typeof bootstrap === 'object' && 'success' in bootstrap && bootstrap.success) {
                    setHasRole(true);
                  } else {
                    setHasRole(false);
                    toast.error("Your account is not authorized. Contact an admin for access.");
                  }
                } catch (e) {
                  console.log('Bootstrap failed (expected for non-admins):', e);
                  setHasRole(false);
                  toast.error("Your account is not authorized. Contact an admin for access.");
                }
              }
            } catch (error) {
              console.error('Role check failed:', error);
              setHasRole(false);
            } finally {
              setLoading(false);
            }
          }, 0);
        } else {
          setHasRole(false);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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

  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  if (!hasRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Restricted</h1>
          <p className="text-muted-foreground mb-6">
            Your account is signed in but not authorized to access this application. 
            Please contact an administrator to grant you Staff access.
          </p>
          <button 
            onClick={resetLogin}
            className="text-primary hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}