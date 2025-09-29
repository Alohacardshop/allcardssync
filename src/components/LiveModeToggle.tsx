import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Monitor, Zap } from 'lucide-react';

interface LiveModeToggleProps {
  onToggle: (enabled: boolean) => void;
  intervalMs?: number;
  storageKey?: string;
  label?: string;
  description?: string;
}

export function LiveModeToggle({
  onToggle,
  intervalMs = 120_000, // 2 minutes default
  storageKey = 'live-mode-enabled',
  label = "Live Mode",
  description = "Auto-refresh data"
}: LiveModeToggleProps) {
  const [isEnabled, setIsEnabled] = useState(false);

  // Load initial state from localStorage
  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      const enabled = stored === 'true';
      setIsEnabled(enabled);
      onToggle(enabled);
    }
  }, [storageKey, onToggle]);

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    onToggle(enabled);
    
    // Persist to localStorage
    if (storageKey) {
      localStorage.setItem(storageKey, enabled.toString());
    }
  };

  const formatInterval = (ms: number) => {
    if (ms >= 60_000) {
      return `${ms / 60_000}min`;
    }
    return `${ms / 1000}s`;
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center space-x-2">
        <Switch
          id="live-mode"
          checked={isEnabled}
          onCheckedChange={handleToggle}
        />
        <Label htmlFor="live-mode" className="text-sm font-medium flex items-center gap-2">
          {isEnabled ? (
            <Zap className="h-3 w-3 text-green-500" />
          ) : (
            <Monitor className="h-3 w-3 text-muted-foreground" />
          )}
          {label}
        </Label>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge 
          variant={isEnabled ? "default" : "secondary"} 
          className="text-xs"
        >
          {isEnabled ? `Every ${formatInterval(intervalMs)}` : "Manual"}
        </Badge>
        
        {description && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

// Hook for using live mode with React Query
export function useLiveMode(
  queryKey: unknown, 
  storageKey: string = 'live-mode-enabled',
  intervalMs: number = 120_000
) {
  const [isLive, setIsLive] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    setIsLive(stored === 'true');
  }, [storageKey]);

  const toggleLive = (enabled: boolean) => {
    setIsLive(enabled);
    localStorage.setItem(storageKey, enabled.toString());
  };

  return {
    isLive,
    toggleLive,
    refetchInterval: isLive ? intervalMs : false,
  };
}