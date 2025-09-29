import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useHealthMonitor } from '@/hooks/useHealthMonitor';
import { RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshButton } from '@/components/RefreshButton';
import { LiveModeToggle, useLiveMode } from '@/components/LiveModeToggle';

export function SystemHealthCard() {
  const { isLive, toggleLive } = useLiveMode(['systemHealth'], 'system-health-live-mode');
  const { healthStatus, lastHealthCheck, checkSystemHealth, isHealthy, isLoading } = useHealthMonitor(isLive);

  const getHealthBadge = (status: 'healthy' | 'degraded' | 'down') => {
    const variants = {
      healthy: { variant: 'outline' as const, color: 'text-green-600', icon: CheckCircle },
      degraded: { variant: 'secondary' as const, color: 'text-yellow-600', icon: AlertTriangle },
      down: { variant: 'destructive' as const, color: 'text-red-600', icon: AlertTriangle }
    };
    
    const config = variants[status];
    const IconComponent = config.icon;
    
    return (
      <Badge variant={config.variant} className={config.color}>
        <IconComponent className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            System Health
            {isHealthy ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            )}
          </span>
          <div className="flex items-center gap-2">
            <RefreshButton 
              queryKey={['systemHealth']} 
              size="sm" 
              variant="outline"
              label=""
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <LiveModeToggle
            onToggle={toggleLive}
            storageKey="system-health-live-mode"
            label="Live Updates"
            description="Auto-refresh health data"
          />
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Database</p>
            {getHealthBadge(healthStatus?.database || 'healthy')}
          </div>
          
          <div>
            <p className="text-muted-foreground">Shopify Sync</p>
            {getHealthBadge(healthStatus?.shopifySync || 'healthy')}
          </div>
          
          <div>
            <p className="text-muted-foreground">Print Services</p>
            {getHealthBadge(healthStatus?.printServices || 'healthy')}
          </div>
        </div>

        {(healthStatus?.queueBacklog || 0) > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-3 h-3 text-orange-500" />
            <span>Queue backlog: {healthStatus?.queueBacklog || 0} items</span>
          </div>
        )}

        {(healthStatus?.errorRate || 0) > 10 && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="w-3 h-3" />
            <span>High error rate: {healthStatus?.errorRate || 0}%</span>
          </div>
        )}

        {lastHealthCheck && (
          <p className="text-xs text-muted-foreground">
            Last check: {formatDistanceToNow(lastHealthCheck, { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}