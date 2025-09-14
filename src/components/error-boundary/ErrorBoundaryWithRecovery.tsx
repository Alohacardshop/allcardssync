import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  Bug, 
  Copy,
  ChevronDown,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  errorId: string
  retryCount: number
  showDetails: boolean
}

interface ErrorBoundaryWithRecoveryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  maxRetries?: number
}

export class ErrorBoundaryWithRecovery extends React.Component<
  ErrorBoundaryWithRecoveryProps,
  ErrorBoundaryState
> {
  private retryTimeoutId: NodeJS.Timeout | null = null

  constructor(props: ErrorBoundaryWithRecoveryProps) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
      showDetails: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substring(2)}`
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      errorInfo
    })

    // Log error to console for debugging
    console.group('🚨 Error Boundary Caught Error')
    console.error('Error:', error)
    console.error('Error Info:', errorInfo)
    console.error('Component Stack:', errorInfo.componentStack)
    console.groupEnd()

    // Call optional error handler
    this.props.onError?.(error, errorInfo)

    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo)
    }
  }

  private reportError = (error: Error, errorInfo: React.ErrorInfo) => {
    // In a real app, send to error reporting service like Sentry
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    }

    console.log('Error report (would be sent to monitoring service):', errorReport)
  }

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props
    
    if (this.state.retryCount >= maxRetries) {
      toast.error(`Maximum retry attempts (${maxRetries}) exceeded`)
      return
    }

    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
      showDetails: false
    }))

    toast.success(`Attempting recovery (${this.state.retryCount + 1}/${maxRetries})`)
  }

  private handleGoHome = () => {
    window.location.href = '/'
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleCopyError = () => {
    const errorDetails = {
      errorId: this.state.errorId,
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href
    }

    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
    toast.success('Error details copied to clipboard')
  }

  private toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }))
  }

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props
      const { error, errorInfo, errorId, retryCount, showDetails } = this.state
      const maxRetries = this.props.maxRetries || 3

      // Use custom fallback if provided
      if (Fallback && error) {
        return <Fallback error={error} retry={this.handleRetry} />
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Bug className="h-4 w-4" />
                <AlertDescription>
                  An unexpected error occurred while rendering this component. 
                  You can try to recover from this error or reload the page.
                </AlertDescription>
              </Alert>

              {/* Error Summary */}
              <div className="space-y-2">
                <h4 className="font-medium">Error Summary</h4>
                <div className="text-sm space-y-1">
                  <div><strong>Error ID:</strong> {errorId}</div>
                  <div><strong>Message:</strong> {error?.message || 'Unknown error'}</div>
                  <div><strong>Retry Count:</strong> {retryCount}/{maxRetries}</div>
                  <div><strong>Time:</strong> {new Date().toLocaleString()}</div>
                </div>
              </div>

              {/* Error Details (Collapsible) */}
              <Collapsible open={showDetails} onOpenChange={this.toggleDetails}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
                  {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {showDetails ? 'Hide' : 'Show'} Technical Details
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-4">
                  {error?.stack && (
                    <div>
                      <h5 className="font-medium text-sm mb-2">Stack Trace</h5>
                      <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  
                  {errorInfo?.componentStack && (
                    <div>
                      <h5 className="font-medium text-sm mb-2">Component Stack</h5>
                      <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Recovery Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={this.handleRetry}
                  disabled={retryCount >= maxRetries}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again ({retryCount}/{maxRetries})
                </Button>

                <Button 
                  variant="outline"
                  onClick={this.handleGoHome}
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Go Home
                </Button>

                <Button 
                  variant="outline"
                  onClick={this.handleReload}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </Button>

                <Button 
                  variant="ghost"
                  onClick={this.handleCopyError}
                  className="flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy Error
                </Button>
              </div>

              {/* Help Text */}
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                <p>
                  <strong>Need help?</strong> If this error persists, try refreshing the page or 
                  contact support with the error ID above. The error details have been logged 
                  for investigation.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryWithRecoveryProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundaryWithRecovery {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundaryWithRecovery>
    )
  }
}

// Hook for triggering error boundary from function components
export function useErrorHandler() {
  return (error: Error, errorInfo?: { componentStack?: string }) => {
    // In a real implementation, this would trigger the nearest error boundary
    throw error
  }
}