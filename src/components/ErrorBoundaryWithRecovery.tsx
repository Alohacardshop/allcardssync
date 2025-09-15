import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  retryCount: number;
}

export class ErrorBoundaryWithRecovery extends Component<Props, State> {
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      retryCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for internal monitoring
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
    
    // Store error info in state
    this.setState({
      error,
      errorInfo
    });

    // Show user-friendly toast notification
    toast.error('Something went wrong. Please try refreshing the page.');
    
    // Log to system for internal debugging
    this.logErrorToSystem(error, errorInfo);
  }

  componentWillUnmount() {
    // Clear any pending timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  private logErrorToSystem = async (error: Error, errorInfo: React.ErrorInfo) => {
    try {
      // Log error to console for now (could be extended to external service)
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      console.error('Internal Error Log:', errorDetails);
      
      // Could be extended to send to monitoring service
      // await fetch('/api/log-error', { method: 'POST', body: JSON.stringify(errorDetails) });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  };

  private handleRetry = () => {
    const { retryCount } = this.state;
    
    // Limit retry attempts to prevent infinite loops
    if (retryCount >= 3) {
      toast.error('Maximum retry attempts reached. Please refresh the page manually.');
      return;
    }

    // Show loading state
    toast.loading('Retrying...', { id: 'retry-loading' });
    
    // Delay retry to allow any ongoing operations to complete
    const timeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: retryCount + 1
      });
      
      toast.dismiss('retry-loading');
      toast.success('Retrying...');
    }, 1000);
    
    this.retryTimeouts.push(timeout);
  };

  private handleGoHome = () => {
    // Clear error state and navigate to home
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: 0
    });
    
    // Navigate to home page
    window.location.href = '/';
  };

  private handleRefreshPage = () => {
    // Force page refresh
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, retryCount } = this.state;
      const canRetry = retryCount < 3;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 rounded-full bg-destructive/10 w-fit">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The application encountered an unexpected error. Our team has been notified and is working on a fix.
                </AlertDescription>
              </Alert>

              {/* Error details for debugging (only in development) */}
              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Error Details (Development Only)
                  </summary>
                  <pre className="mt-2 p-4 text-xs bg-muted rounded-md overflow-auto">
                    {error.message}
                    {error.stack && `\n\nStack Trace:\n${error.stack}`}
                  </pre>
                </details>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                {canRetry && (
                  <Button 
                    onClick={this.handleRetry}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again {retryCount > 0 && `(${3 - retryCount} attempts left)`}
                  </Button>
                )}
                
                <Button 
                  variant="outline"
                  onClick={this.handleRefreshPage}
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Page
                </Button>
                
                <Button 
                  variant="secondary"
                  onClick={this.handleGoHome}
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
              </div>

              {retryCount >= 3 && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    If the problem persists, please contact your system administrator or try refreshing the page.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundaryWithRecovery;