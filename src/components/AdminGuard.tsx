import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader title="Verifying Access" subtitle="Checking admin permissions…" />;
  }

  if (isAdmin === false) {
    logger.warn('Admin access denied', {}, 'auth');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}