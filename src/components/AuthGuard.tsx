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
      async (event, session) => {
        console.log('AuthGuard auth state change:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Check if user has staff or admin role with timeout
          const uid = session.user.id;
          
          try {
            const roleCheckPromise = Promise.all([
              supabase.rpc("has_role", { _user_id: uid, _role: "staff" as any }),
              supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any })
            ]);
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Role check timeout")), 8000)
            );
            
            const [staffCheck, adminCheck] = await Promise.race([roleCheckPromise, timeoutPromise]) as any;
            
            const hasValidRole = Boolean(staffCheck.data) || Boolean(adminCheck.data);
            setHasRole(hasValidRole);
            
            if (!hasValidRole) {
              // Try bootstrap for admin role (for initial setup)
              try {
                await supabase.functions.invoke("bootstrap-admin");
                // Re-check after bootstrap
                const [staffCheck2, adminCheck2] = await Promise.all([
                  supabase.rpc("has_role", { _user_id: uid, _role: "staff" as any }),
                  supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any })
                ]);
                const hasValidRole2 = Boolean(staffCheck2.data) || Boolean(adminCheck2.data);
                setHasRole(hasValidRole2);
                
                if (!hasValidRole2) {
                  toast.error("Your account is not authorized. Contact an admin for access.");
                }
              } catch (e) {
                console.log('Bootstrap failed (expected for non-admins):', e);
                toast.error("Your account is not authorized. Contact an admin for access.");
              }
            }
          } catch (error) {
            console.error('Role check failed:', error);
            if (error.message === "Role check timeout") {
              toast.error("Authentication is taking too long. Please refresh the page.");
            }
            setHasRole(false);
          } finally {
            setLoading(false);
          }
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