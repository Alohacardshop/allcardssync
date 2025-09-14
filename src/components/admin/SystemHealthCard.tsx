import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkSystemHealth } from "@/lib/api";
import { usePollingWithCircuitBreaker } from "@/hooks/usePollingWithCircuitBreaker";

export function SystemHealthCard() {
  const { 
    data: healthStatus, 
    isLoading, 
    error, 
    circuitBreaker, 
    retry,
    currentInterval 
  } = usePollingWithCircuitBreaker(
    checkSystemHealth,
    {
      enabled: true,
      baseInterval: 2 * 60 * 1000, // 2 minutes (increased from 30s)
      maxInterval: 10 * 60 * 1000, // 10 minutes max
      maxFailures: 3,
      circuitOpenTime: 60000, // 1 minute
      onError: (error) => console.error('[SystemHealth] Polling error:', error.message),
      onCircuitOpen: () => console.log('[SystemHealth] Circuit breaker opened'),
      onCircuitClose: () => console.log('[SystemHealth] Circuit breaker closed'),
    }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">Checking system status...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            System Health
            {circuitBreaker.isOpen && (
              <Badge variant="destructive" className="text-xs">
                Circuit Open
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="destructive">Health Check Failed</Badge>
          <p className="text-sm text-muted-foreground mt-2">
            {error.message}
          </p>
          {circuitBreaker.isOpen && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Circuit breaker is open after {circuitBreaker.failureCount} failures.
                Next attempt in {Math.max(0, Math.ceil((circuitBreaker.nextAttemptTime - Date.now()) / 1000))}s
              </p>
              <Button onClick={retry} size="sm" variant="outline">
                Retry Now
              </Button>
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            Polling interval: {Math.round(currentInterval / 1000)}s
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          System Health
          <div className="flex gap-2">
            {circuitBreaker.isOpen && (
              <Badge variant="destructive" className="text-xs">
                Circuit Open
              </Badge>
            )}
            {circuitBreaker.failureCount > 0 && !circuitBreaker.isOpen && (
              <Badge variant="secondary" className="text-xs">
                {circuitBreaker.failureCount} failures
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span>Database Connection</span>
          <Badge variant={healthStatus?.database ? "default" : "destructive"}>
            {healthStatus?.database ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span>Last Check</span>
          <span className="text-sm text-muted-foreground">
            {healthStatus?.timestamp 
              ? new Date(healthStatus.timestamp).toLocaleTimeString()
              : "Unknown"
            }
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span>Polling Interval</span>
          <span className="text-sm text-muted-foreground">
            {Math.round(currentInterval / 1000)}s
          </span>
        </div>

        {healthStatus?.error && (
          <div className="text-sm text-destructive">
            Error: {healthStatus.error}
          </div>
        )}

        {circuitBreaker.isOpen && (
          <div className="mt-4 space-y-2 p-3 border rounded-lg bg-destructive/5">
            <p className="text-sm font-medium text-destructive">
              Circuit Breaker Active
            </p>
            <p className="text-xs text-muted-foreground">
              Next attempt in {Math.max(0, Math.ceil((circuitBreaker.nextAttemptTime - Date.now()) / 1000))}s
            </p>
            <Button onClick={retry} size="sm" variant="outline">
              Retry Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}