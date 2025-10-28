import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean | null;
  isStaff: boolean | null;
  loading: boolean;
  refetchRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchRoles = useCallback(async (userId: string, forceRefresh = false) => {
    const now = Date.now();
    
    // Use cache if less than 5 minutes old
    if (!forceRefresh && lastFetch && (now - lastFetch) < CACHE_DURATION) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('verify_user_access', {
        _user_id: userId
      });

      if (error) throw error;

      const result = data as any;
      setIsAdmin(result?.has_admin_access ?? false);
      setIsStaff(result?.has_staff_access ?? false);
      setLastFetch(now);
    } catch (error) {
      console.error('Error fetching roles:', error);
      setIsAdmin(false);
      setIsStaff(false);
    }
  }, [lastFetch]);

  const refetchRoles = useCallback(async () => {
    if (user?.id) {
      await fetchRoles(user.id, true);
    }
  }, [user?.id, fetchRoles]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchRoles(session.user.id).finally(() => setLoading(false));
      } else {
        setIsAdmin(null);
        setIsStaff(null);
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Fetch roles on auth change (non-blocking)
        setTimeout(() => {
          fetchRoles(session.user.id);
        }, 0);
      } else {
        // Clear roles on sign out
        setIsAdmin(null);
        setIsStaff(null);
        setLastFetch(0);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin,
        isStaff,
        loading,
        refetchRoles
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
