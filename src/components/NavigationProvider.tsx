import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setNavigate } from '@/lib/navigation';

/**
 * Sets up the navigation helper to use React Router's navigate function.
 * Place this inside BrowserRouter but outside Routes.
 */
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);
  
  return <>{children}</>;
}
