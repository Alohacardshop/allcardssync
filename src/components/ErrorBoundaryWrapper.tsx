import React from 'react';
import { ErrorBoundaryWithRecovery } from './ErrorBoundaryWithRecovery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ErrorBoundaryWrapperProps {
  children: React.ReactNode;
  componentName: string;
}

const CriticalErrorFallback = ({ componentName, onRetry }: { componentName: string; onRetry: () => void }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-destructive">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center">
            The {componentName} component encountered an error and couldn't load properly.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={onRetry} 
              variant="default" 
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button 
              onClick={() => navigate('/')} 
              variant="outline"
              className="flex-1"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export function ErrorBoundaryWrapper({ children, componentName }: ErrorBoundaryWrapperProps) {
  return (
    <ErrorBoundaryWithRecovery
      onError={(error, errorInfo) => {
        // Log critical component errors for monitoring
        console.error(`Critical error in ${componentName}:`, error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundaryWithRecovery>
  );
}