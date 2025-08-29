import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { checkSystemHealth } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function SystemHealthCard() {
  const { data: healthStatus, isLoading, error } = useQuery({
    queryKey: ['system-health'],
    queryFn: checkSystemHealth,
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 15000, // Consider stale after 15 seconds
  });

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
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="destructive">Health Check Failed</Badge>
          <p className="text-sm text-muted-foreground mt-2">
            Unable to determine system status
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
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

        {healthStatus?.error && (
          <div className="text-sm text-destructive">
            Error: {healthStatus.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}