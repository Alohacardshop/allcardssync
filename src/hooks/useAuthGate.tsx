import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

export interface AuthGateState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
}

export function useAuthGate() {
  const [state, setState] = useState<AuthGateState>({
    user: null,
    session: null,
    loading: true,
    error: null,
    isAdmin: false
  });

  useEffect(() => {
    let mounted = true;
    let authStateListener: { data: { subscription: any } } | null = null;

    const checkAuth = async () => {
      try {
        // Race condition protection with timeout
        const authPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Auth check timeout')), 10000);
        });

        const { data: { session }, error } = await Promise.race([authPromise, timeoutPromise]);
        
        if (!mounted) return;

        if (error) throw error;

        let isAdmin = false;
        if (session?.user) {
          // Check admin role with timeout
          const rolePromise = supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', session.user.id)
            .eq('role', 'admin')
            .maybeSingle();

          const roleTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Role check timeout')), 5000);
          });

          try {
            const { data: roleData } = await Promise.race([rolePromise, roleTimeoutPromise]);
            isAdmin = !!roleData;
          } catch (roleError) {
            console.warn('Role check failed:', roleError);
            // Continue without admin status rather than failing
          }
        }

        if (mounted) {
          setState({
            user: session?.user || null,
            session,
            loading: false,
            error: null,
            isAdmin
          });
        }
      } catch (error) {
        if (mounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Auth check failed'
          }));
        }
      }
    };

    // Set up auth state listener
    authStateListener = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      setState(prev => ({
        ...prev,
        user: session?.user || null,
        session,
        loading: false,
        error: null
      }));

      // Check admin role for new sessions
      if (session?.user) {
        const checkRole = async () => {
          try {
            const { data } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id)
              .eq('role', 'admin')
              .maybeSingle();
              
            if (mounted) {
              setState(prev => ({ ...prev, isAdmin: !!data }));
            }
          } catch {
            // Ignore role check failures for auth state changes
          }
        };
        
        checkRole();
      }
    });

    checkAuth();

    return () => {
      mounted = false;
      if (authStateListener?.data?.subscription) {
        authStateListener.data.subscription.unsubscribe();
      }
    };
  }, []);

  return state;
}