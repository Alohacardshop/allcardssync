import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { logger } from '@/lib/logger';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error('404 Error: User attempted to access non-existent route', new Error('404 Not Found'), { pathname: location.pathname }, 'not-found');
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-foreground">404</h1>
        <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
        <Link to="/" className="underline text-primary hover:opacity-80 transition-opacity">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
