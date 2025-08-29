
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, StopCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LogMessage {
  type: string;
  timestamp: string;
  level?: 'info' | 'success' | 'error' | 'warning';
  message?: string;
  game?: string;
  phase?: string;
  count?: number;
  total?: number;
  error?: string;
  sets?: number;
  cards?: number;
  variants?: number;
}

interface GameOption {
  value: string;
  label: string;
  active: boolean;
}

interface ProviderSyncButtonProps {
  onLogsUpdate: (logs: LogMessage[]) => void;
  disabled?: boolean;
}

const ProviderSyncButton: React.FC<ProviderSyncButtonProps> = ({ onLogsUpdate, disabled }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [availableGames, setAvailableGames] = useState<GameOption[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);

  // Fetch available games from JustTCG API
  useEffect(() => {
    const fetchAvailableGames = async () => {
      try {
        setIsLoadingGames(true);
        const response = await fetch('https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg-games');
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        setAvailableGames(data.games || []);
        
        // Auto-select popular games by default
        const defaultGames = data.games
          ?.filter((g: GameOption) => ['pokemon', 'pokemon-japan', 'mtg'].includes(g.value))
          ?.map((g: GameOption) => g.value) || [];
        setSelectedGames(defaultGames);
        
        if (data.fallback) {
          toast.warning('Using fallback games list - JustTCG API unavailable');
        }
      } catch (error: any) {
        console.error('Failed to fetch games:', error);
        
        // Fallback games
        const fallbackGames = [
          { value: 'pokemon', label: 'Pokémon', active: true },
          { value: 'pokemon-japan', label: 'Pokémon Japan', active: true },
          { value: 'mtg', label: 'Magic: The Gathering', active: true },
          { value: 'lorcana', label: 'Lorcana', active: true },
          { value: 'one-piece', label: 'One Piece', active: true },
          { value: 'dragon-ball-super', label: 'Dragon Ball Super', active: true },
          { value: 'flesh-and-blood', label: 'Flesh and Blood', active: true }
        ];
        
        setAvailableGames(fallbackGames);
        setSelectedGames(['pokemon', 'pokemon-japan', 'mtg']);
        toast.error('Failed to fetch games from API, using fallback list');
      } finally {
        setIsLoadingGames(false);
      }
    };

    fetchAvailableGames();
  }, []);

  const handleGameSelection = (game: string) => {
    setSelectedGames(prev => 
      prev.includes(game) 
        ? prev.filter(g => g !== game)
        : [...prev, game]
    );
  };

  const selectAllGames = () => {
    setSelectedGames(availableGames.filter(g => g.active).map(g => g.value));
  };

  const clearSelection = () => {
    setSelectedGames([]);
  };

  const syncAllGames = async () => {
    setIsRunning(true);
    const controller = new AbortController();
    setAbortController(controller);
    
    const logs: LogMessage[] = [];
    onLogsUpdate([]);

    try {
      const response = await fetch('https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/provider-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider: 'justtcg', 
          games: 'ALL',
          mode: 'live'
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          try {
            const eventData = JSON.parse(line.slice(6)) as LogMessage;
            logs.push(eventData);
            onLogsUpdate([...logs]);

            // Show toast for major events
            if (eventData.type === 'COMPLETE') {
              toast.success('All games sync completed successfully!');
            } else if (eventData.type === 'ERROR') {
              toast.error(`Sync failed: ${eventData.error}`);
            } else if (eventData.type === 'GAME_DONE') {
              toast.success(`${eventData.game} sync completed: ${eventData.sets} sets, ${eventData.cards} cards, ${eventData.variants} variants`);
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE message:', line, parseError);
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorLog: LogMessage = {
          type: 'ERROR',
          timestamp: new Date().toISOString(),
          level: 'error',
          error: error.message,
          message: `❌ All games sync failed: ${error.message}`
        };
        logs.push(errorLog);
        onLogsUpdate([...logs]);
        toast.error(`All games sync failed: ${error.message}`);
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  const startProviderSync = async () => {
    if (selectedGames.length === 0) {
      toast.error("Please select at least one game to sync");
      return;
    }

    setIsRunning(true);
    const controller = new AbortController();
    setAbortController(controller);
    
    const logs: LogMessage[] = [];
    onLogsUpdate([]);

    try {
      const response = await fetch('https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/provider-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider: 'justtcg', 
          games: selectedGames,
          mode: 'live'
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          try {
            const eventData = JSON.parse(line.slice(6)) as LogMessage;
            logs.push(eventData);
            onLogsUpdate([...logs]);

            // Show toast for major events
            if (eventData.type === 'COMPLETE') {
              toast.success('Provider sync completed successfully!');
            } else if (eventData.type === 'ERROR') {
              toast.error(`Sync failed: ${eventData.error}`);
            } else if (eventData.type === 'GAME_DONE') {
              toast.success(`${eventData.game} sync completed: ${eventData.sets} sets, ${eventData.cards} cards, ${eventData.variants} variants`);
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE message:', line, parseError);
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorLog: LogMessage = {
          type: 'ERROR',
          timestamp: new Date().toISOString(),
          level: 'error',
          error: error.message,
          message: `❌ Provider sync failed: ${error.message}`
        };
        logs.push(errorLog);
        onLogsUpdate([...logs]);
        toast.error(`Provider sync failed: ${error.message}`);
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  const stopSync = () => {
    if (abortController) {
      abortController.abort();
      toast.info('Provider sync cancelled');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Select Games to Sync:
          {isLoadingGames && (
            <Loader2 className="ml-2 h-3 w-3 animate-spin inline" />
          )}
        </label>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllGames}
              disabled={isLoadingGames}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              disabled={isLoadingGames}
            >
              Clear
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 min-h-[2rem]">
            {isLoadingGames ? (
              <div className="text-sm text-muted-foreground">Loading available games...</div>
            ) : (
              availableGames.map(game => (
                <Badge
                  key={game.value}
                  variant={selectedGames.includes(game.value) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => handleGameSelection(game.value)}
                >
                  {game.label}
                </Badge>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={startProviderSync}
          disabled={disabled || isRunning || selectedGames.length === 0 || isLoadingGames}
          className="flex items-center gap-2"
        >
          <PlayCircle className="w-4 h-4" />
          {isRunning ? 'Syncing...' : isLoadingGames ? 'Loading...' : 'Start Provider Sync'}
        </Button>

        <Button
          onClick={syncAllGames}
          disabled={disabled || isRunning || isLoadingGames}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <PlayCircle className="w-4 h-4" />
          {isRunning ? 'Syncing...' : isLoadingGames ? 'Loading...' : 'Sync ALL Games'}
        </Button>

        {isRunning && (
          <Button
            onClick={stopSync}
            variant="outline"
            className="flex items-center gap-2"
          >
            <StopCircle className="w-4 h-4" />
            Cancel
          </Button>
        )}
      </div>

      {selectedGames.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Will sync {selectedGames.length} game{selectedGames.length > 1 ? 's' : ''}: {selectedGames.join(', ')}
        </p>
      )}
    </div>
  );
};

export default ProviderSyncButton;
