import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';
import { PATHS } from '@/routes/paths';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [showDenied, setShowDenied] = useState(false);

  useEffect(() => {
    if (!loading && isAdmin === false) {
      logger.warn('Admin access denied', {}, 'auth');
      setShowDenied(true);
      
      // Auto-redirect after 3 seconds
      const timer = setTimeout(() => {
        navigate(PATHS.dashboard, { replace: true });
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return <FullScreenLoader title="Verifying Access" subtitle="Checking admin permissions…" />;
  }

  if (showDenied || isAdmin === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Admin Access Required</h1>
            <p className="text-muted-foreground">
              You don't have permission to access administrator tools. 
              Redirecting you to the dashboard…
            </p>
          </div>
          <Button onClick={() => navigate(PATHS.dashboard, { replace: true })} variant="outline">
            Go to Dashboard Now
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
