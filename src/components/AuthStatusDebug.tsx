import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Session } from '@supabase/supabase-js';
import { useStore } from '@/contexts/StoreContext';
import { logger } from '@/lib/logger';

interface AuthStatusDebugProps {
  visible?: boolean;
}

export const AuthStatusDebug: React.FC<AuthStatusDebugProps> = ({ visible = false }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [hasRole, setHasRole] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  
  const { assignedStore, selectedLocation, isAdmin, isStaff } = useStore();

  const checkAuthStatus = async () => {
    setLoading(true);
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user || null);

      if (session?.user) {
        // Check role
        const { data: roleData, error: roleError } = await supabase.rpc('has_role', {
          _user_id: session.user.id,
          _role: 'staff' as any
        });
        
        if (roleError) {
          logger.error('Role check error', roleError instanceof Error ? roleError : new Error(String(roleError)), undefined, 'auth-status-debug');
          setHasRole(null);
        } else {
          setHasRole(Boolean(roleData));
        }
      } else {
        setHasRole(null);
      }
      
      setLastCheck(new Date());
    } catch (error) {
      logger.error('Auth status check failed', error instanceof Error ? error : new Error(String(error)), undefined, 'auth-status-debug');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (!visible) return null;

  return (
    <Card className="mb-4 border-orange-200 bg-orange-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Authentication Debug</CardTitle>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={checkAuthStatus}
            disabled={loading}
          >
            {loading ? 'Checking...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-1">Authentication</div>
            <div>User: {user ? <Badge variant="default" className="bg-green-100 text-green-800">Logged in</Badge> : <Badge variant="destructive">Not logged in</Badge>}</div>
            <div>Email: {user?.email || 'N/A'}</div>
            <div>User ID: {user?.id ? `${user.id.substring(0, 8)}...` : 'N/A'}</div>
            <div>Session: {session ? <Badge variant="default" className="bg-green-100 text-green-800">Valid</Badge> : <Badge variant="destructive">None</Badge>}</div>
            <div>Has Role: {hasRole === null ? <Badge variant="secondary">Unknown</Badge> : hasRole ? <Badge variant="default" className="bg-green-100 text-green-800">Yes</Badge> : <Badge variant="destructive">No</Badge>}</div>
          </div>
          
          <div>
            <div className="font-medium mb-1">Store Context</div>
            <div>Store: {assignedStore || 'None'}</div>
            <div>Location: {selectedLocation ? `${selectedLocation.substring(0, 20)}...` : 'None'}</div>
            <div>Admin: {isAdmin ? <Badge variant="default" className="bg-green-100 text-green-800">Yes</Badge> : <Badge variant="secondary">No</Badge>}</div>
            <div>Staff: {isStaff ? <Badge variant="default" className="bg-green-100 text-green-800">Yes</Badge> : <Badge variant="secondary">No</Badge>}</div>
          </div>
        </div>
        
        {lastCheck && (
          <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
            Last check: {lastCheck.toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};