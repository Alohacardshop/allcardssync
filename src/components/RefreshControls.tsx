import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Pause, Play, Clock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

interface RefreshControlsProps {
  autoRefreshEnabled: boolean;
  onAutoRefreshToggle: (enabled: boolean) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  lastRefresh?: Date | null;
  refreshInterval?: number; // in milliseconds
}

export function RefreshControls({
  autoRefreshEnabled,
  onAutoRefreshToggle,
  onManualRefresh,
  isRefreshing,
  lastRefresh,
  refreshInterval = 30000 // default 30 seconds
}: RefreshControlsProps) {
  const [countdown, setCountdown] = useState(refreshInterval / 1000);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!autoRefreshEnabled || isRefreshing) {
      setCountdown(refreshInterval / 1000);
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return refreshInterval / 1000;
        }
        return prev - 1;
      });

      setProgress(prev => {
        const newProgress = ((refreshInterval / 1000 - countdown) / (refreshInterval / 1000)) * 100;
        return newProgress;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, isRefreshing, countdown, refreshInterval]);

  const formatLastRefresh = React.useMemo(() => {
    if (!lastRefresh) return 'Never';
    const diff = Date.now() - lastRefresh.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s ago`;
    }
    return `${seconds}s ago`;
  }, [lastRefresh]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-gradient-secondary rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-refresh"
            checked={autoRefreshEnabled}
            onCheckedChange={onAutoRefreshToggle}
          />
          <Label htmlFor="auto-refresh" className="text-sm font-medium">
            Auto-refresh
          </Label>
          {autoRefreshEnabled ? (
            <Play className="h-3 w-3 text-success animate-pulse" />
          ) : (
            <Pause className="h-3 w-3 text-warning" />
          )}
        </div>
        
        {autoRefreshEnabled && !isRefreshing && (
          <Badge variant="outline" className="flex items-center gap-1.5 px-2 py-1">
            <Clock className="h-3 w-3" />
            <span className="text-xs font-mono">{countdown}s</span>
          </Badge>
        )}
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Last: {formatLastRefresh}
          </Badge>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Progress bar for countdown */}
      {autoRefreshEnabled && !isRefreshing && (
        <Progress value={progress} className="h-1" />
      )}
    </div>
  );
}