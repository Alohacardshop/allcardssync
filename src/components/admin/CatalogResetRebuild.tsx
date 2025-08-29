import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LogEntry {
  type: string;
  game?: string;
  step?: string;
  set_id?: string;
  set_name?: string;
  error?: string;
  rolled_back?: number;
  not_found?: number;
  message?: string;
  total_sets?: number;
  completed_sets?: number;
}

const GAME_OPTIONS = [
  { id: 'pokemon', name: 'Pokémon (EN)' },
  { id: 'pokemon-japan', name: 'Pokémon Japan' },
  { id: 'mtg', name: 'Magic: The Gathering' },
];

interface CatalogResetRebuildProps {
  onLogsUpdate: (logs: LogEntry[]) => void;
}

export const CatalogResetRebuild = ({ onLogsUpdate }: CatalogResetRebuildProps) => {
  const { toast } = useToast();
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [sequentialMode, setSequentialMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const handleGameToggle = (gameId: string) => {
    setSelectedGames(prev => 
      prev.includes(gameId) 
        ? prev.filter(id => id !== gameId)
        : [...prev, gameId]
    );
  };

  const handleSelectAll = () => {
    if (selectedGames.length === GAME_OPTIONS.length) {
      setSelectedGames([]);
    } else {
      setSelectedGames(GAME_OPTIONS.map(g => g.id));
    }
  };

  const handleResetRebuild = async () => {
    if (selectedGames.length === 0) {
      toast({
        title: "No games selected",
        description: "Please select at least one game to rebuild",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);
    setLogs([]);
    onLogsUpdate([]); // Clear parent's unified viewer

    try {
      const response = await fetch(`https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-rebuild-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ 
          games: selectedGames, 
          sequential: sequentialMode 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const logEntry = JSON.parse(line.slice(6));
                setLogs(prev => {
                  const newLogs = [...prev, logEntry];
                  onLogsUpdate(newLogs); // Update parent's unified viewer
                  return newLogs;
                });
                
                // Show important events as toasts
                if (logEntry.type === 'ERROR') {
                  toast({
                    title: "Rebuild Error",
                    description: logEntry.error || 'Unknown error occurred',
                    variant: "destructive",
                  });
                } else if (logEntry.type === 'COMPLETE') {
                  toast({
                    title: "Rebuild Complete",
                    description: "Catalog reset and rebuild completed successfully",
                  });
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE message:', line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: any) {
      toast({
        title: "Rebuild Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'ERROR':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'START_GAME':
      case 'SWAP_DONE':
        return <RefreshCw className="h-4 w-4 text-primary" />;
      case 'IMPORT_SET_START':
      case 'IMPORT_SET_DONE':
        return <Zap className="h-4 w-4 text-secondary" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-muted" />;
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'ERROR':
        return 'text-destructive';
      case 'START_GAME':
      case 'SWAP_DONE':
      case 'COMPLETE':
        return 'text-primary';
      case 'FIX_BAD_WRITES_SUMMARY':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  const formatLogMessage = (log: LogEntry) => {
    // Use message if provided, otherwise fall back to type-based formatting
    if (log.message) {
      return log.message;
    }

    switch (log.type) {
      case 'START':
        return `Starting rebuild for ${Array.isArray(log.game) ? log.game.join(', ') : 'games'}`;
      case 'START_GAME':
        return `🎯 Starting ${log.game}`;
      case 'IMPORT_PHASE':
        return `${log.game}: ${log.step?.replace(/_/g, ' ').toLowerCase()}`;
      case 'IMPORT_SET_START':
        return `📦 ${log.game}: Starting set ${log.set_name} (${log.completed_sets || 0 + 1}/${log.total_sets || 0})`;
      case 'IMPORT_SET_DONE':
        return `✅ ${log.game}: Completed set ${log.set_name} (${log.completed_sets || 0}/${log.total_sets || 0})`;
      case 'FIX_BAD_WRITES':
        return `${log.game}: Fixing bad writes`;
      case 'FIX_BAD_WRITES_SUMMARY':
        return `${log.game}: Fixed ${log.rolled_back || 0} bad writes, ${log.not_found || 0} not found`;
      case 'VALIDATE':
        return `${log.game}: Validating data`;
      case 'READY_TO_SWAP':
        return `${log.game}: Ready for atomic swap`;
      case 'SWAP_DONE':
        return `🎉 ${log.game}: Atomic swap completed`;
      case 'ERROR':
        return `❌ ${log.game ? `${log.game}: ` : ''}${log.error}`;
      case 'COMPLETE':
        return '🎉 All games rebuilt successfully';
      default:
        return JSON.stringify(log);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Danger Zone — Reset & Rebuild
        </CardTitle>
        <CardDescription>
          Completely reset and rebuild catalog data using shadow tables and atomic swaps. 
          This operation is safe and idempotent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This will completely replace all catalog data for selected games with fresh data from providers.
            Existing data will be backed up during the atomic swap process.
          </AlertDescription>
        </Alert>

        {/* Game Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Select Games to Rebuild</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
            >
              {selectedGames.length === GAME_OPTIONS.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {GAME_OPTIONS.map((game) => (
              <div key={game.id} className="flex items-center space-x-2">
                <Checkbox
                  id={game.id}
                  checked={selectedGames.includes(game.id)}
                  onCheckedChange={() => handleGameToggle(game.id)}
                  disabled={isRunning}
                />
                <label htmlFor={game.id} className="text-sm font-medium">
                  {game.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Processing Mode */}
        <div>
          <h4 className="text-sm font-medium mb-3">Processing Mode</h4>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sequential"
              checked={sequentialMode}
              onCheckedChange={(checked) => setSequentialMode(!!checked)}
              disabled={isRunning}
            />
            <label htmlFor="sequential" className="text-sm font-medium">
              Sequential (one-by-one) processing
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {sequentialMode 
              ? "Process each set individually with detailed progress tracking (recommended)" 
              : "Bulk process all data simultaneously (faster but less visibility)"
            }
          </p>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleResetRebuild}
          disabled={selectedGames.length === 0 || isRunning}
          variant="destructive"
          className="w-full"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Rebuilding Catalog...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset & Rebuild Selected Games
            </>
          )}
        </Button>

        {/* Live Logs */}
        {logs.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Live Progress</h4>
            <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  {getLogIcon(log.type)}
                  <span className={getLogColor(log.type)}>
                    {formatLogMessage(log)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CatalogResetRebuild;