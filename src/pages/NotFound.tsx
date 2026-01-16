import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { logger } from '@/lib/logger';
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, MapPin } from "lucide-react";
import { EcosystemBadge } from "@/components/ui/EcosystemBadge";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error('404 Error: User attempted to access non-existent route', new Error('404 Not Found'), { pathname: location.pathname }, 'not-found');
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-md space-y-6">
        {/* Ecosystem Badge */}
        <EcosystemBadge size="lg" variant="pill" className="mx-auto" />
        
        {/* 404 Illustration */}
        <div className="relative">
          <div className="text-[120px] md:text-[160px] font-bold text-muted-foreground/20 leading-none select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="w-10 h-10 text-primary" />
            </div>
          </div>
        </div>
        
        {/* Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <p className="text-sm text-muted-foreground/70 font-mono">
            {location.pathname}
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default" size="lg">
            <Link to="/" className="gap-2">
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" onClick={() => window.history.back()}>
            <span className="gap-2 cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
