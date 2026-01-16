import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { LoadingState } from '@/components/ui/LoadingState';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return <LoadingState message="Verifying admin access..." />;
  }

  if (isAdmin === false) {
    logger.warn('Admin access denied', {}, 'auth');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}