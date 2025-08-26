import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, RefreshCw, Activity, Zap } from 'lucide-react';
import { checkHealth, type HealthStatus } from '@/lib/api';
import { toast } from 'sonner';

interface SystemHealthCardProps {
  onHealthUpdate?: (status: HealthStatus | null) => void;
}

export function SystemHealthCard({ onHealthUpdate }: SystemHealthCardProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const status = await checkHealth();
      setHealth(status);
      setLastCheck(new Date());
      onHealthUpdate?.(status);
      
      if (!status.ok) {
        toast.error('System health check failed', {
          description: status.reason || 'Unknown error'
        });
      }
    } catch (error: any) {
      console.error('Health check failed:', error);
      const errorStatus: HealthStatus = {
        ok: false,
        api: 'catalog-sync',
        reason: error.message || 'Connection failed',
        details: error
      };
      setHealth(errorStatus);
      setLastCheck(new Date());
      onHealthUpdate?.(errorStatus);
      
      toast.error('Health check failed', {
        description: error.message || 'Unable to connect to backend services'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    
    // Auto-refresh every 2 minutes
    const interval = setInterval(loadHealth, 120000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (loading) return <RefreshCw className="h-5 w-5 animate-spin" />;
    if (!health) return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    return health.ok ? 
      <CheckCircle className="h-5 w-5 text-green-500" /> : 
      <AlertCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusBadge = () => {
    if (loading) return <Badge variant="secondary">Checking...</Badge>;
    if (!health) return <Badge variant="secondary">Unknown</Badge>;
    return health.ok ? 
      <Badge variant="default" className="bg-green-500">Healthy</Badge> : 
      <Badge variant="destructive">Issues Detected</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="font-medium">
              {loading ? 'Checking system status...' : 
               health?.ok ? 'All systems operational' : 'System issues detected'}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadHealth}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {lastCheck && (
          <div className="text-sm text-muted-foreground">
            Last checked: {lastCheck.toLocaleTimeString()}
          </div>
        )}

        {health && !health.ok && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div><strong>Service:</strong> {health.api}</div>
                <div><strong>Issue:</strong> {health.reason}</div>
                {health.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">Technical Details</summary>
                    <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(health.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-sm font-medium">Frontend</div>
              <div className="text-xs text-muted-foreground">React + Vite</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            <div>
              <div className="text-sm font-medium">Backend</div>
              <div className="text-xs text-muted-foreground">Supabase Edge</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}