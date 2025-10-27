import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Pause, Play } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface RefreshControlsProps {
  autoRefreshEnabled: boolean;
  onAutoRefreshToggle: (enabled: boolean) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  lastRefresh?: Date | null;
}

export function RefreshControls({
  autoRefreshEnabled,
  onAutoRefreshToggle,
  onManualRefresh,
  isRefreshing,
  lastRefresh
}: RefreshControlsProps) {
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
    <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center space-x-2">
        <Switch
          id="auto-refresh"
          checked={autoRefreshEnabled}
          onCheckedChange={onAutoRefreshToggle}
        />
        <Label htmlFor="auto-refresh" className="text-sm">
          Auto-refresh
        </Label>
        {autoRefreshEnabled ? (
          <Play className="h-3 w-3 text-green-500" />
        ) : (
          <Pause className="h-3 w-3 text-orange-500" />
        )}
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onManualRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        Refresh Now
      </Button>
      
      <Badge variant="secondary" className="text-xs">
        Last: {formatLastRefresh}
      </Badge>
    </div>
  );
}