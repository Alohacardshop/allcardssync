import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { 
  Database, 
  Search,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock,
  BarChart3,
  RefreshCw,
  Gamepad2,
  Package,
  Loader2,
  Check,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const FUNCTIONS_BASE = 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1';

interface Game {
  id: string;
  name: string;
  raw: any;
  discovered_at: string;
}

interface GameSet {
  set_id: string;
  name: string;
  game: string;
}

interface SyncProgress {
  gameId: string;
  setId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  message?: string;
}

interface ApiMetadata {
  apiRequestsUsed?: number;
  apiRequestsRemaining?: number;
  apiRateLimit?: number;
  timestamp?: string;
}

export default function JustTCGSync() {
  const queryClient = useQueryClient();
  
  // State
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [gameSearch, setGameSearch] = useState('');
  const [setSearch, setSetSearch] = useState('');
  const [setsGroupedByGame, setSetsGroupedByGame] = useState<Record<string, GameSet[]>>({});
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata>({});

  // Load from localStorage on mount
  useEffect(() => {
    const savedGames = localStorage.getItem('justtcg-selected-games');
    const savedSets = localStorage.getItem('justtcg-selected-sets');
    
    if (savedGames) {
      try {
        setSelectedGames(JSON.parse(savedGames));
      } catch (e) {
        console.warn('Failed to parse saved games');
      }
    }
    
    if (savedSets) {
      try {
        setSelectedSets(JSON.parse(savedSets));
      } catch (e) {
        console.warn('Failed to parse saved sets');
      }
    }
  }, []);

  // Save to localStorage when selections change
  useEffect(() => {
    localStorage.setItem('justtcg-selected-games', JSON.stringify(selectedGames));
  }, [selectedGames]);

  useEffect(() => {
    localStorage.setItem('justtcg-selected-sets', JSON.stringify(selectedSets));
  }, [selectedSets]);

  // Queries
  const { data: games = [], isLoading: gamesLoading, refetch: refetchGames } = useQuery({
    queryKey: ['discover-games'],
    queryFn: async () => {
      const response = await fetch(`${FUNCTIONS_BASE}/discover-games`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to discover games');
      const result = await response.json();
      if (result._metadata) setApiMetadata(result._metadata);
      return result.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Mutations
  const discoverSetsMutation = useMutation({
    mutationFn: async (gameIds?: string[]) => {
      const url = gameIds?.length 
        ? `${FUNCTIONS_BASE}/discover-sets?${gameIds.map(id => `game=${encodeURIComponent(id)}`).join('&')}`
        : `${FUNCTIONS_BASE}/discover-sets`;
      
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to discover sets');
      const result = await response.json();
      if (result._metadata) setApiMetadata(result._metadata);
      return result.data || [];
    },
    onSuccess: async (data) => {
      // Fetch the actual sets from the database
      const setsMap: Record<string, GameSet[]> = {};
      
      for (const gameResult of data) {
        if (gameResult.setsCount > 0) {
          try {
            const response = await fetch(`${FUNCTIONS_BASE}/catalog-search?game=${encodeURIComponent(gameResult.gameId)}&type=sets&limit=1000`);
            if (response.ok) {
              const setsResult = await response.json();
              setsMap[gameResult.gameId] = setsResult.sets || [];
            }
          } catch (e) {
            console.warn(`Failed to fetch sets for ${gameResult.gameId}`);
            setsMap[gameResult.gameId] = [];
          }
        } else {
          setsMap[gameResult.gameId] = [];
        }
      }
      
      setSetsGroupedByGame(setsMap);
      toast.success(`Discovered sets for ${data.length} games`);
      addLog(`✅ Sets discovered for ${data.length} games`);
    },
    onError: (error: any) => {
      toast.error('Failed to discover sets', { description: error.message });
      addLog(`❌ Sets discovery failed: ${error.message}`);
    }
  });

  const syncSetsMutation = useMutation({
    mutationFn: async (sets: { gameId: string; setId: string }[]) => {
      setIsRunning(true);
      const results = [];
      
      // Initialize progress tracking
      const initialProgress = sets.map(({ gameId, setId }) => ({
        gameId,
        setId,
        status: 'queued' as const
      }));
      setSyncProgress(initialProgress);
      
      for (let i = 0; i < sets.length; i++) {
        const { gameId, setId } = sets[i];
        
        // Update status to running
        setSyncProgress(prev => prev.map(p => 
          p.gameId === gameId && p.setId === setId 
            ? { ...p, status: 'running' }
            : p
        ));
        
        addLog(`🚀 Syncing ${gameId}/${setId}...`);
        
        try {
          const response = await fetch(
            `${FUNCTIONS_BASE}/justtcg-import?game=${encodeURIComponent(gameId)}&setId=${encodeURIComponent(setId)}`,
            { method: 'POST' }
          );
          
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const result = await response.json();
          results.push(result);
          
          // Update status to done
          setSyncProgress(prev => prev.map(p => 
            p.gameId === gameId && p.setId === setId 
              ? { ...p, status: 'done', message: `${result.cardsProcessed || 0} cards` }
              : p
          ));
          
          addLog(`✅ ${gameId}/${setId}: ${result.cardsProcessed || 0} cards, ${result.variantsProcessed || 0} variants`);
          
          if (result._metadata) setApiMetadata(result._metadata);
          
          // Small delay between requests
          if (i < sets.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error: any) {
          // Update status to error
          setSyncProgress(prev => prev.map(p => 
            p.gameId === gameId && p.setId === setId 
              ? { ...p, status: 'error', message: error.message }
              : p
          ));
          
          addLog(`❌ ${gameId}/${setId}: ${error.message}`);
        }
      }
      
      return results;
    },
    onSuccess: () => {
      setIsRunning(false);
      toast.success('Sync completed');
      queryClient.invalidateQueries({ queryKey: ['discover-games'] });
    },
    onError: (error: any) => {
      setIsRunning(false);
      toast.error('Sync failed', { description: error.message });
    }
  });

  // Helper functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 99)]);
  };

  const filteredGames = games.filter((game: Game) => 
    game.name.toLowerCase().includes(gameSearch.toLowerCase()) ||
    game.id.toLowerCase().includes(gameSearch.toLowerCase())
  );

  const handleGameSelection = (gameId: string, checked: boolean) => {
    setSelectedGames(prev => 
      checked 
        ? [...prev, gameId]
        : prev.filter(id => id !== gameId)
    );
  };

  const handleSelectAllGames = () => {
    const allGameIds = filteredGames.map((g: Game) => g.id);
    setSelectedGames(allGameIds);
  };

  const handleClearAllGames = () => {
    setSelectedGames([]);
  };

  const handleSetSelection = (setId: string, checked: boolean) => {
    setSelectedSets(prev => 
      checked 
        ? [...prev, setId]
        : prev.filter(id => id !== setId)
    );
  };

  const handleSelectAllSetsForGame = (gameId: string) => {
    const gameSets = setsGroupedByGame[gameId] || [];
    const gameSetIds = gameSets.map(s => s.set_id);
    setSelectedSets(prev => [...new Set([...prev, ...gameSetIds])]);
  };

  const handleClearAllSetsForGame = (gameId: string) => {
    const gameSets = setsGroupedByGame[gameId] || [];
    const gameSetIds = gameSets.map(s => s.set_id);
    setSelectedSets(prev => prev.filter(id => !gameSetIds.includes(id)));
  };

  const handleFetchSets = () => {
    const gamesToFetch = selectedGames.length > 0 ? selectedGames : undefined;
    discoverSetsMutation.mutate(gamesToFetch);
  };

  const handleSyncSelectedSets = () => {
    if (selectedSets.length === 0) {
      toast.error('No sets selected');
      return;
    }

    const setsToSync = selectedSets.map(setId => {
      // Find which game this set belongs to
      for (const [gameId, sets] of Object.entries(setsGroupedByGame)) {
        const set = sets.find(s => s.set_id === setId);
        if (set) return { gameId, setId };
      }
      return null;
    }).filter(Boolean) as { gameId: string; setId: string }[];

    if (setsToSync.length === 0) {
      toast.error('No valid sets to sync');
      return;
    }

    syncSetsMutation.mutate(setsToSync);
  };

  const handleSyncAllSetsForSelectedGames = () => {
    if (selectedGames.length === 0) {
      toast.error('No games selected');
      return;
    }

    const allSetsToSync: { gameId: string; setId: string }[] = [];
    
    selectedGames.forEach(gameId => {
      const gameSets = setsGroupedByGame[gameId] || [];
      gameSets.forEach(set => {
        allSetsToSync.push({ gameId, setId: set.set_id });
      });
    });

    if (allSetsToSync.length === 0) {
      toast.error('No sets found for selected games');
      return;
    }

    syncSetsMutation.mutate(allSetsToSync);
  };

  const handleSyncAllGames = async () => {
    if (!confirm('This will sync ALL games and ALL sets. This may take a very long time. Continue?')) {
      return;
    }

    // First discover all games
    const gamesResult = await refetchGames();
    const allGames = gamesResult.data || [];

    // Then discover sets for all games
    discoverSetsMutation.mutate(undefined, {
      onSuccess: () => {
        // After sets are discovered, sync everything
        setTimeout(() => {
          const allSetsToSync: { gameId: string; setId: string }[] = [];
          
          Object.entries(setsGroupedByGame).forEach(([gameId, sets]) => {
            sets.forEach(set => {
              allSetsToSync.push({ gameId, setId: set.set_id });
            });
          });

          syncSetsMutation.mutate(allSetsToSync);
        }, 1000);
      }
    });
  };

  const getProgressPercentage = () => {
    if (syncProgress.length === 0) return 0;
    const completed = syncProgress.filter(p => p.status === 'done' || p.status === 'error').length;
    return (completed / syncProgress.length) * 100;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="h-4 w-4 text-gray-500" />;
      case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'done': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">JustTCG Sync System</h1>
        <p className="text-muted-foreground mt-2">
          Dynamic game and set discovery with synchronized importing
        </p>
        
        {/* Usage Widget */}
        {apiMetadata.apiRateLimit && (
          <div className="mt-4 flex items-center gap-4 text-sm">
            <Badge variant="outline">
              API Usage: {apiMetadata.apiRequestsUsed || 0} / {apiMetadata.apiRateLimit}
            </Badge>
            <Badge variant="outline">
              Remaining: {apiMetadata.apiRequestsRemaining || 0}
            </Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pick Games Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5" />
              Pick Games ({selectedGames.length} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() => refetchGames()}
                disabled={gamesLoading}
                size="sm"
                variant="outline"
              >
                {gamesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Discover Games
              </Button>
              <Button onClick={handleSelectAllGames} size="sm" variant="outline">
                Select All
              </Button>
              <Button onClick={handleClearAllGames} size="sm" variant="outline">
                Clear
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Search Games</Label>
              <Input
                placeholder="Search by name or ID..."
                value={gameSearch}
                onChange={(e) => setGameSearch(e.target.value)}
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredGames.map((game: Game) => (
                <div key={game.id} className="flex items-center space-x-2 p-2 border rounded">
                  <Checkbox
                    id={`game-${game.id}`}
                    checked={selectedGames.includes(game.id)}
                    onCheckedChange={(checked) => handleGameSelection(game.id, !!checked)}
                  />
                  <label htmlFor={`game-${game.id}`} className="flex-1 text-sm cursor-pointer">
                    <div className="font-medium">{game.name}</div>
                    <div className="text-muted-foreground text-xs">{game.id}</div>
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pick Sets Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Pick Sets ({selectedSets.length} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleFetchSets}
              disabled={discoverSetsMutation.isPending}
              className="w-full"
            >
              {discoverSetsMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching Sets...</>
              ) : (
                <><Database className="h-4 w-4 mr-2" /> Fetch Sets</>
              )}
            </Button>

            <div className="space-y-2">
              <Label>Search Sets</Label>
              <Input
                placeholder="Search by set name..."
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
              />
            </div>

            <div className="max-h-80 overflow-y-auto space-y-4">
              {Object.entries(setsGroupedByGame).map(([gameId, sets]) => {
                const game = games.find((g: Game) => g.id === gameId);
                const filteredSets = sets.filter(set => 
                  set.name.toLowerCase().includes(setSearch.toLowerCase())
                );
                
                if (filteredSets.length === 0) return null;
                
                return (
                  <div key={gameId} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">
                        {game?.name || gameId} ({filteredSets.length} sets)
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelectAllSetsForGame(gameId)}
                        >
                          All
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleClearAllSetsForGame(gameId)}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {filteredSets.map(set => (
                        <div key={set.set_id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`set-${set.set_id}`}
                            checked={selectedSets.includes(set.set_id)}
                            onCheckedChange={(checked) => handleSetSelection(set.set_id, !!checked)}
                          />
                          <label htmlFor={`set-${set.set_id}`} className="text-xs cursor-pointer flex-1">
                            {set.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Controls & Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Sync Controls & Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSyncSelectedSets}
              disabled={isRunning || selectedSets.length === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Sync Selected Sets ({selectedSets.length})
            </Button>
            
            <Button
              onClick={handleSyncAllSetsForSelectedGames}
              disabled={isRunning || selectedGames.length === 0}
              variant="secondary"
            >
              <Database className="h-4 w-4 mr-2" />
              Sync All Sets for Selected Games
            </Button>
            
            <Button
              onClick={handleSyncAllGames}
              disabled={isRunning}
              variant="destructive"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Sync All Games
            </Button>
          </div>

          {/* Progress Bar */}
          {syncProgress.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(getProgressPercentage())}%</span>
              </div>
              <Progress value={getProgressPercentage()} className="w-full" />
            </div>
          )}

          {/* Progress List */}
          {syncProgress.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {syncProgress.map((item, index) => (
                <div key={`${item.gameId}-${item.setId}-${index}`} className="flex items-center gap-2 text-sm">
                  {getStatusIcon(item.status)}
                  <span className="font-mono flex-1">
                    {item.gameId}/{item.setId}
                  </span>
                  {item.message && (
                    <span className="text-muted-foreground text-xs">{item.message}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Logs */}
          <div className="space-y-2">
            <Label>Live Logs (Last 100)</Label>
            <div className="bg-slate-950 text-green-400 p-3 rounded font-mono text-xs max-h-48 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-slate-400">No activity yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index}>{log}</div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}