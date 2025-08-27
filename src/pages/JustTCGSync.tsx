import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Navigation } from '@/components/Navigation';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Play, 
  Loader2, 
  Search,
  Database,
  Settings,
  Activity,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Game {
  id: string;
  name: string;
  raw?: any;
}

interface GameSet {
  id: string;
  game: string;
  name: string;
  released_at?: string;
  cards_count?: number;
}

interface SyncProgress {
  gameId: string;
  setId: string;
  setName: string;
  status: 'queued' | 'running' | 'done' | 'error';
  message?: string;
}

interface ApiMetadata {
  apiRequestsUsed?: number;
  apiRequestsRemaining?: number;
  apiRateLimit?: number;
  resetTime?: string;
}

export default function JustTCGSync() {
  // State management
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [setSearchQueries, setSetSearchQueries] = useState<{ [gameId: string]: string }>({});
  const [groupedSets, setGroupedSets] = useState<{ [gameId: string]: GameSet[] }>({});
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata | null>(null);

  const queryClient = useQueryClient();

  // Load/save selections from localStorage
  useEffect(() => {
    const savedGames = localStorage.getItem('justtcg-selected-games');
    const savedSets = localStorage.getItem('justtcg-selected-sets');
    if (savedGames) {
      try {
        setSelectedGames(JSON.parse(savedGames));
      } catch (e) {
        console.warn('Failed to parse saved games:', e);
      }
    }
    if (savedSets) {
      try {
        setSelectedSets(JSON.parse(savedSets));
      } catch (e) {
        console.warn('Failed to parse saved sets:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('justtcg-selected-games', JSON.stringify(selectedGames));
  }, [selectedGames]);

  useEffect(() => {
    localStorage.setItem('justtcg-selected-sets', JSON.stringify(selectedSets));
  }, [selectedSets]);

  // Helper function to add log entries
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-99), `[${timestamp}] ${message}`]);
  };

  // Fetch discovered games
  const { data: games = [], isLoading: gamesLoading, refetch: refetchGames } = useQuery({
    queryKey: ['discovered-games'],
    queryFn: async () => {
      addLog('📡 Fetching games from JustTCG API...'); 
      const { data, error } = await supabase.functions.invoke('discover-games', {
        body: {}
      });
      
      if (error) {
        throw new Error(`Failed to fetch games: ${error.message}`);
      }
      
      addLog(`✅ Discovered ${data?.data?.length || 0} games`);
      return data?.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Discover sets mutation
  const discoverSetsMutation = useMutation({
    mutationFn: async (gameIds?: string[]) => {
      addLog(`🔍 Discovering sets for ${gameIds ? gameIds.length + ' selected games' : 'all games'}...`);
      
      const body = gameIds && gameIds.length > 0 ? { games: gameIds } : {};
      
      const { data, error } = await supabase.functions.invoke('discover-sets', {
        body
      });
      
      if (error) {
        throw new Error(`Failed to discover sets: ${error.message}`);
      }
      
      return data;
    },
    onSuccess: async (data) => {
      addLog(`✅ Set discovery completed: ${data._metadata?.totalSetsDiscovered || 0} total sets discovered`);
      
      // Update API metadata if available
      if (data._metadata) {
        setApiMetadata({
          apiRequestsUsed: data._metadata.apiRequestsUsed,
          apiRequestsRemaining: data._metadata.apiRequestsRemaining,
          apiRateLimit: data._metadata.apiRateLimit,
          resetTime: data._metadata.resetTime
        });
      }

      // Now fetch sets from the database for selected games
      const setsMap: { [gameId: string]: GameSet[] } = {};
      
      if (selectedGames.length > 0) {
        for (const gameId of selectedGames) {
          try {
            const { data: setsData, error } = await supabase
              .from('sets')
              .select('id, name, game, released_at, cards_count')
              .eq('game', gameId)
              .order('name');
            
            if (error) {
              console.warn(`Failed to fetch sets for ${gameId}:`, error);
              setsMap[gameId] = [];
            } else {
              setsMap[gameId] = (setsData || []).map(set => ({
                id: set.id,
                game: set.game,
                name: set.name,
                released_at: set.released_at,
                cards_count: set.cards_count
              }));
            }
          } catch (e) {
            console.warn(`Error fetching sets for ${gameId}:`, e);
            setsMap[gameId] = [];
          }
        }
      }
      
      setGroupedSets(setsMap);
    },
    onError: (error: any) => {
      addLog(`❌ Set discovery failed: ${error.message}`);
      toast.error('Set discovery failed', { description: error.message });
    }
  });

  // Sync sets mutation
  const syncSetsMutation = useMutation({
    mutationFn: async (params: { mode: 'selected' | 'all-for-games' | 'all-games'; gameIds?: string[]; setIds?: string[] }) => {
      setIsRunning(true);
      setSyncProgress([]);
      
      let setsToSync: Array<{ gameId: string; setId: string; setName: string }> = [];
      
      if (params.mode === 'selected' && params.setIds) {
        // Get set details for selected sets
        setsToSync = params.setIds.map(setId => {
          for (const gameId in groupedSets) {
            const set = groupedSets[gameId].find(s => s.id === setId);
            if (set) {
              return { gameId, setId, setName: set.name };
            }
          }
          return { gameId: 'unknown', setId, setName: setId };
        });
      } else if (params.mode === 'all-for-games' && params.gameIds) {
        // Get all sets for selected games
        for (const gameId of params.gameIds) {
          if (groupedSets[gameId]) {
            setsToSync.push(...groupedSets[gameId].map(set => ({
              gameId,
              setId: set.id,
              setName: set.name
            })));
          }
        }
      } else if (params.mode === 'all-games') {
        // Get all sets for all games
        for (const gameId in groupedSets) {
          setsToSync.push(...groupedSets[gameId].map(set => ({
            gameId,
            setId: set.id,
            setName: set.name
          })));
        }
      }
      
      // Initialize progress tracking
      const initialProgress: SyncProgress[] = setsToSync.map(({ gameId, setId, setName }) => ({
        gameId,
        setId,
        setName,
        status: 'queued'
      }));
      setSyncProgress(initialProgress);
      
      addLog(`🚀 Starting sync for ${setsToSync.length} sets...`);
      
      // Sync each set sequentially
      const results = [];
      for (let i = 0; i < setsToSync.length; i++) {
        const { gameId, setId, setName } = setsToSync[i];
        
        // Update progress to running
        setSyncProgress(prev => prev.map(p => 
          p.gameId === gameId && p.setId === setId 
            ? { ...p, status: 'running' }
            : p
        ));
        
        try {
          addLog(`⚡ Syncing ${setName} (${gameId})...`);
          
          const { data: result, error } = await supabase.functions.invoke('justtcg-import', {
            body: { game: gameId, setId }
          });
          
          if (error) {
            throw new Error(`Sync failed: ${error.message}`);
          }
          results.push(result);
          
          // Update progress to done
          setSyncProgress(prev => prev.map(p => 
            p.gameId === gameId && p.setId === setId 
              ? { ...p, status: 'done', message: `${result.cardsProcessed || 0} cards, ${result.variantsProcessed || 0} variants` }
              : p
          ));
          
          addLog(`✅ ${setName}: ${result.cardsProcessed || 0} cards, ${result.variantsProcessed || 0} variants`);
          
        } catch (error: any) {
          // Update progress to error
          setSyncProgress(prev => prev.map(p => 
            p.gameId === gameId && p.setId === setId 
              ? { ...p, status: 'error', message: error.message }
              : p
          ));
          
          addLog(`❌ ${setName} failed: ${error.message}`);
        }
        
        // Small delay between requests
        if (i < setsToSync.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return { results, totalSets: setsToSync.length };
    },
    onSuccess: () => {
      const successCount = syncProgress.filter(p => p.status === 'done').length;
      const errorCount = syncProgress.filter(p => p.status === 'error').length;
      
      addLog(`🎉 Sync completed: ${successCount} successful, ${errorCount} failed`);
      toast.success('Sync completed', { 
        description: `${successCount} sets synced successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`
      });
    },
    onError: (error: any) => {
      addLog(`💥 Sync failed: ${error.message}`);
      toast.error('Sync failed', { description: error.message });
    },
    onSettled: () => {
      setIsRunning(false);
    }
  });

  // Handle game selection
  const handleGameSelection = (gameId: string, checked: boolean) => {
    if (checked) {
      setSelectedGames(prev => [...prev, gameId]);
    } else {
      setSelectedGames(prev => prev.filter(id => id !== gameId));
      // Also remove all sets from this game
      if (groupedSets[gameId]) {
        const gameSetIds = groupedSets[gameId].map(set => set.id);
        setSelectedSets(prev => prev.filter(id => !gameSetIds.includes(id)));
      }
    }
  };

  // Handle set selection
  const handleSetSelection = (setId: string, checked: boolean) => {
    if (checked) {
      setSelectedSets(prev => [...prev, setId]);
    } else {
      setSelectedSets(prev => prev.filter(id => id !== setId));
    }
  };

  // Handle "Select All" / "Clear All" for games
  const handleSelectAllGames = () => {
    setSelectedGames(games.map(g => g.id));
  };

  const handleClearAllGames = () => {
    setSelectedGames([]);
    setSelectedSets([]);
  };

  // Handle "Select All" / "Clear All" for sets in a game
  const handleSelectAllSetsForGame = (gameId: string) => {
    const gameSets = groupedSets[gameId] || [];
    const gameSetIds = gameSets.map(set => set.id);
    setSelectedSets(prev => [...new Set([...prev, ...gameSetIds])]);
  };

  const handleClearAllSetsForGame = (gameId: string) => {
    const gameSets = groupedSets[gameId] || [];
    const gameSetIds = gameSets.map(set => set.id);
    setSelectedSets(prev => prev.filter(id => !gameSetIds.includes(id)));
  };

  // Sync button handlers
  const handleSyncSelectedSets = () => {
    if (selectedSets.length === 0) {
      toast.warning('No sets selected', { description: 'Please select at least one set to sync' });
      return;
    }
    syncSetsMutation.mutate({ mode: 'selected', setIds: selectedSets });
  };

  const handleSyncAllSetsForSelectedGames = () => {
    if (selectedGames.length === 0) {
      toast.warning('No games selected', { description: 'Please select at least one game' });
      return;
    }
    syncSetsMutation.mutate({ mode: 'all-for-games', gameIds: selectedGames });
  };

  const handleSyncAllGamesAndSets = () => {
    const totalSets = Object.values(groupedSets).reduce((sum, sets) => sum + sets.length, 0);
    if (totalSets === 0) {
      toast.warning('No sets available', { description: 'Please discover sets first' });
      return;
    }
    
    // Show confirmation for full sync
    if (window.confirm(`This will sync ALL games and sets (${totalSets} total sets). This may take a long time. Continue?`)) {
      syncSetsMutation.mutate({ mode: 'all-games' });
    }
  };

  // Filter games by search query
  const filteredGames = games.filter(game => 
    game.name.toLowerCase().includes(gameSearchQuery.toLowerCase()) ||
    game.id.toLowerCase().includes(gameSearchQuery.toLowerCase())
  );

  // Calculate progress
  const totalProgress = syncProgress.length > 0 
    ? (syncProgress.filter(p => p.status === 'done' || p.status === 'error').length / syncProgress.length) * 100
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6" />
            <h1 className="text-3xl font-bold">JustTCG Sync System</h1>
          </div>
          <Navigation />
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-8">
        {/* API Usage Widget */}
        {apiMetadata && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                API Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{apiMetadata.apiRequestsUsed || 0}</div>
                  <div className="text-sm text-muted-foreground">Used</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{apiMetadata.apiRequestsRemaining || 0}</div>
                  <div className="text-sm text-muted-foreground">Remaining</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{apiMetadata.apiRateLimit || 0}</div>
                  <div className="text-sm text-muted-foreground">Rate Limit</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Pick Games */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
              Pick Games
            </CardTitle>
            <CardDescription>
              Select games to discover sets and sync data. Games are auto-discovered from the JustTCG API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button
                onClick={() => refetchGames()}
                disabled={gamesLoading}
                variant="outline"
                size="sm"
              >
                {gamesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh Games
              </Button>
              <Button onClick={handleSelectAllGames} variant="outline" size="sm">
                Select All
              </Button>
              <Button onClick={handleClearAllGames} variant="outline" size="sm">
                Clear All
              </Button>
              <Badge variant="secondary">
                {selectedGames.length} of {games.length} selected
              </Badge>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search games..."
                value={gameSearchQuery}
                onChange={(e) => setGameSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="h-64 border rounded-md p-4">
              <div className="space-y-2">
                {gamesLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading games...</span>
                  </div>
                ) : filteredGames.length > 0 ? (
                  filteredGames.map((game) => (
                    <div key={game.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`game-${game.id}`}
                        checked={selectedGames.includes(game.id)}
                        onCheckedChange={(checked) => handleGameSelection(game.id, checked as boolean)}
                      />
                      <label
                        htmlFor={`game-${game.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {game.name} ({game.id})
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    No games found matching your search.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Step 2: Pick Sets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">2</div>
              Pick Sets
            </CardTitle>
            <CardDescription>
              Discover and select sets for the chosen games. Sets are fetched dynamically from the JustTCG API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button
                onClick={() => discoverSetsMutation.mutate(selectedGames.length > 0 ? selectedGames : undefined)}
                disabled={discoverSetsMutation.isPending}
                variant="outline"
              >
                {discoverSetsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Fetch Sets
              </Button>
              <Badge variant="secondary">
                {selectedSets.length} sets selected
              </Badge>
            </div>

            {Object.keys(groupedSets).length > 0 && (
              <div className="space-y-4">
                {Object.entries(groupedSets).map(([gameId, sets]) => {
                  const game = games.find(g => g.id === gameId);
                  const searchQuery = setSearchQueries[gameId] || '';
                  const filteredSets = sets.filter(set =>
                    set.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    set.id.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                  const selectedSetsInGame = sets.filter(set => selectedSets.includes(set.id)).length;

                  return (
                    <div key={gameId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">
                          {game?.name || gameId} ({sets.length} sets)
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleSelectAllSetsForGame(gameId)}
                            variant="outline"
                            size="sm"
                          >
                            Select All
                          </Button>
                          <Button
                            onClick={() => handleClearAllSetsForGame(gameId)}
                            variant="outline"
                            size="sm"
                          >
                            Clear All
                          </Button>
                          <Badge variant="secondary">
                            {selectedSetsInGame} selected
                          </Badge>
                        </div>
                      </div>

                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`Search sets in ${game?.name || gameId}...`}
                          value={searchQuery}
                          onChange={(e) => setSetSearchQueries(prev => ({ ...prev, [gameId]: e.target.value }))}
                          className="pl-10"
                        />
                      </div>

                      <ScrollArea className="h-48">
                        <div className="space-y-2">
                          {filteredSets.map((set) => (
                            <div key={set.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`set-${set.id}`}
                                checked={selectedSets.includes(set.id)}
                                onCheckedChange={(checked) => handleSetSelection(set.id, checked as boolean)}
                              />
                              <label
                                htmlFor={`set-${set.id}`}
                                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                              >
                                {set.name}
                                {set.cards_count && (
                                  <span className="text-muted-foreground ml-2">({set.cards_count} cards)</span>
                                )}
                              </label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Sync Controls & Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">3</div>
              Sync Controls & Progress
            </CardTitle>
            <CardDescription>
              Start the synchronization process and monitor progress in real-time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sync Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={handleSyncSelectedSets}
                disabled={isRunning || selectedSets.length === 0}
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                Sync Selected Sets ({selectedSets.length})
              </Button>
              <Button
                onClick={handleSyncAllSetsForSelectedGames}
                disabled={isRunning || selectedGames.length === 0}
                variant="outline"
                className="w-full"
              >
                <Settings className="h-4 w-4 mr-2" />
                Sync All Sets for Selected Games
              </Button>
              <Button
                onClick={handleSyncAllGamesAndSets}
                disabled={isRunning}
                variant="destructive"
                className="w-full"
              >
                <Database className="h-4 w-4 mr-2" />
                Sync All Games & Sets
              </Button>
            </div>

            {/* Progress Bar */}
            {syncProgress.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round(totalProgress)}%</span>
                </div>
                <Progress value={totalProgress} className="w-full" />
              </div>
            )}

            {/* Progress Panel */}
            {syncProgress.length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Sync Progress</h4>
                <ScrollArea className="h-64 border rounded-md p-4">
                  <div className="space-y-2">
                    {syncProgress.map((progress, index) => (
                      <div key={`${progress.gameId}-${progress.setId}`} className="flex items-center gap-3 p-2 rounded border">
                        <div className="flex-shrink-0">
                          {progress.status === 'queued' && <Clock className="h-4 w-4 text-muted-foreground" />}
                          {progress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                          {progress.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {progress.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{progress.setName}</div>
                          <div className="text-sm text-muted-foreground">
                            {progress.gameId} • {progress.status}
                            {progress.message && ` • ${progress.message}`}
                          </div>
                        </div>
                        <Badge
                          variant={
                            progress.status === 'done' ? 'default' :
                            progress.status === 'error' ? 'destructive' :
                            progress.status === 'running' ? 'secondary' : 'outline'
                          }
                        >
                          {progress.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <Separator />

            {/* Live Logs */}
            <div>
              <h4 className="font-medium mb-3">Live Logs</h4>
              <ScrollArea className="h-48 border rounded-md p-4 bg-muted/50 font-mono text-sm">
                <div className="space-y-1">
                  {logs.length > 0 ? (
                    logs.slice(-100).map((log, index) => (
                      <div key={index} className="text-xs">
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground text-center py-4">
                      Logs will appear here during sync operations...
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}