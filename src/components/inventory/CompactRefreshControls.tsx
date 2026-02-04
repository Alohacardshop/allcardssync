import React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Pause, Play } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CompactRefreshControlsProps {
  autoRefreshEnabled: boolean;
  onAutoRefreshToggle: (enabled: boolean) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  hasPendingSyncs?: boolean;
}

export function CompactRefreshControls({
  autoRefreshEnabled,
  onAutoRefreshToggle,
  onManualRefresh,
  isRefreshing,
  hasPendingSyncs
}: CompactRefreshControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Switch
                id="auto-refresh-compact"
                checked={autoRefreshEnabled}
                onCheckedChange={onAutoRefreshToggle}
                className="h-4 w-7"
              />
              {autoRefreshEnabled ? (
                <Play className="h-3 w-3 text-success" />
              ) : (
                <Pause className="h-3 w-3 text-muted-foreground" />
              )}
              {hasPendingSyncs && autoRefreshEnabled && (
                <span className="text-xs text-warning font-medium">Fast</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Auto-refresh: {autoRefreshEnabled ? 'On' : 'Off'}</p>
            {hasPendingSyncs && autoRefreshEnabled && (
              <p className="text-xs text-muted-foreground">Refreshing faster (syncs pending)</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Refresh now</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
