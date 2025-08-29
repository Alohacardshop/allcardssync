import { useState, useEffect, useRef } from 'react';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GameCombobox } from '@/components/ui/game-combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Play, 
  Database, 
  RefreshCw, 
  Search, 
  Settings, 
  CheckCircle, 
  Clock, 
  Loader2, 
  AlertCircle,
  BarChart3,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCatalogSyncStatus, parseFunctionError } from '@/lib/fns';
import { Navigation } from '@/components/Navigation';
import { useCatalogStats } from '@/hooks/useCatalogStats';

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

// Shared slug normalization utility
function normalizeGameSlug(game: string): string {
  const g = (game || '').toLowerCase();
  if (g === 'pokemon_japan') return 'pokemon-japan';
  if (g === 'mtg') return 'magic-the-gathering';
  return g;
}

export default function JustTCGSync() {
  // State management
  const [selectedGame, setSelectedGame] = useState<string>('pokemon');
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [setSearchQuery, setSetSearchQuery] = useState('');
  const [gameSets, setGameSets] = useState<GameSet[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isKillingJobs, setIsKillingJobs] = useState(false);
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata | null>(null);
  
  const FUNCTIONS_BASE = 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1';
  
  // Smart sync settings
  const [onlyNewSets, setOnlyNewSets] = useState(() => {
    const saved = localStorage.getItem('justtcg-only-new-sets');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [skipRecentlyUpdated, setSkipRecentlyUpdated] = useState(() => {
    const saved = localStorage.getItem('justtcg-skip-recently-updated');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [forceResync, setForceResync] = useState(() => {
    const saved = localStorage.getItem('justtcg-force-resync');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [sinceDays, setSinceDays] = useState(() => {
    const saved = localStorage.getItem('justtcg-since-days');
    return saved !== null ? parseInt(saved) : 30;
  });

  const cancelRequestedRef = useRef(false);
  const queryClient = useQueryClient();

  // Load/save selections from localStorage
  useEffect(() => {
    const savedGame = localStorage.getItem('justtcg-selected-game');
    const savedSets = localStorage.getItem('justtcg-selected-sets');
    if (savedGame) {
      setSelectedGame(savedGame);
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
    localStorage.setItem('justtcg-selected-game', selectedGame);
  }, [selectedGame]);

  useEffect(() => {
    localStorage.setItem('justtcg-selected-sets', JSON.stringify(selectedSets));
  }, [selectedSets]);

  // Save smart sync options to localStorage
  useEffect(() => {
    localStorage.setItem('justtcg-only-new-sets', JSON.stringify(onlyNewSets));
  }, [onlyNewSets]);

  useEffect(() => {
    localStorage.setItem('justtcg-skip-recently-updated', JSON.stringify(skipRecentlyUpdated));
  }, [skipRecentlyUpdated]);

  useEffect(() => {
    localStorage.setItem('justtcg-force-resync', JSON.stringify(forceResync));
  }, [forceResync]);

  useEffect(() => {
    localStorage.setItem('justtcg-since-days', sinceDays.toString());
  }, [sinceDays]);

  // Use shared hook for overall stats
  const { data: pokemonStats, isLoading: pokemonLoading } = useCatalogStats('pokemon');
  const { data: japanStats, isLoading: japanLoading } = useCatalogStats('pokemon-japan');
  const { data: mtgStats, isLoading: mtgLoading } = useCatalogStats('mtg');
  
  // Combine for overall stats with consistent format
  const overallStats = [
    { game: 'pokemon', ...pokemonStats },
    { game: 'pokemon-japan', ...japanStats },
    { game: 'mtg', ...mtgStats }
  ];

  const { data: selectedGameStats, isLoading: selectedGameLoading } = useCatalogStats(selectedGame || '');

  const { data: queueStats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: async () => {
      // Get queue stats for all modes
      const modes = ['pokemon', 'pokemon-japan', 'mtg'];
      const results = await Promise.all(
        modes.map(async (mode) => {
          try {
            const { data, error } = await supabase.rpc('catalog_v2_queue_stats_by_mode', { mode_in: mode });
            if (error) throw error;
            return { mode, ...(Array.isArray(data) ? data[0] : data) };
          } catch {
            return { mode, queued: 0, processing: 0, done: 0, error: 0 };
          }
        })
      );
      return results;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Games data
  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['games'],
    queryFn: async () => {
      console.log('Fetching games...');
      const { data, error } = await supabase.functions.invoke('discover-games');
      if (error) throw error;

      console.log('Games response:', data);
      console.log('Games array:', data?.data || []);
      console.log('Games length:', data?.data?.length || 0);
      console.log('Games metadata:', data?._metadata || {});

      return data?.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Function to add logs
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Main sync mutation (unified for all games)
  const syncMutation = useMutation({
    mutationFn: async ({ gameId, setId }: { gameId: string; setId?: string }) => {
      if (cancelRequestedRef.current) {
        throw new Error('Sync was cancelled');
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 5 minutes')), 5 * 60 * 1000)
      );

      if (setId) {
        // Single set sync
        const normalizedGameId = normalizeGameSlug(gameId);
        
        try {
          // Use unified sync for all games
          const url = `${FUNCTIONS_BASE}/catalog-sync?game=${encodeURIComponent(normalizedGameId)}`;
          const response = await Promise.race([
            fetch(url, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ setIds: [setId] })
            }),
            timeoutPromise
          ]) as Response;
          
          const json = await response.json();
          if (!response.ok) {
            throw new Error(json?.error || 'Sync failed');
          }

          return {
            success: true,
            gameId,
            setId,
            message: `Successfully synced set ${setId}`,
            details: json
          };
        } catch (err: any) {
          console.error(`Set sync error for ${setId}:`, err);
          throw new Error(`Failed to sync set ${setId}: ${err.message}`);
        }
      }

      // Multi-set or full game sync
      const processGame = async (game: Game) => {
        if (cancelRequestedRef.current) return null;

        try {
          addLog(`🎮 Starting sync for ${game.name}...`);
          setSyncProgress(prev => [...prev, { 
            gameId: game.id, 
            setId: 'all', 
            setName: 'All sets', 
            status: 'running' 
          }]);

          const { data, error } = await supabase.functions.invoke('discover-sets', {
            body: { games: [game.id] }
          });

          if (error) throw error;

          const setsCount = data?.totalSets || data?.data?.[0]?.setsCount || 0;
          addLog(`📊 Discovered ${setsCount} sets for ${game.name}`);
          
          // Use unified sync for all games
          const normalizedGameId = normalizeGameSlug(game.id);
          const syncUrl = `${FUNCTIONS_BASE}/catalog-sync?game=${encodeURIComponent(normalizedGameId)}`;
          
          const syncResponse = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setIds: selectedSets.length > 0 ? selectedSets : undefined })
          });

          const syncData = await syncResponse.json();

          if (!syncResponse.ok) {
            throw new Error(syncData?.error || 'Sync failed');
          }

          setSyncProgress(prev => prev.map(p => 
            p.gameId === game.id ? { ...p, status: 'done' } : p
          ));

          addLog(`✅ Completed sync for ${game.name}`);
          
          // Auto-refresh sets list to show updated card counts
          if (selectedGame === game.id) {
            setTimeout(() => loadSetsFromDBForGame(game.id), 1000);
          }
          
          return syncData;

        } catch (error: any) {
          console.error(`Game sync error for ${game.name}:`, error);
          setSyncProgress(prev => prev.map(p => 
            p.gameId === game.id ? { ...p, status: 'error', message: error.message } : p
          ));
          addLog(`❌ Failed to sync ${game.name}: ${error.message}`);
          throw error;
        }
      };

      if (selectedGame) {
        const game = games?.find(g => g.id === selectedGame);
        if (game) {
          return await processGame(game);
        }
      }

      // Process multiple games if no specific game selected
      const gamesToProcess = games || [];
      const results = [];
      
      for (const game of gamesToProcess) {
        if (cancelRequestedRef.current) break;
        
        try {
          const result = await processGame(game);
          results.push(result);
        } catch (error) {
          // Continue with other games even if one fails
          continue;
        }
      }

      return results;
    },
    onMutate: () => {
      setIsRunning(true);
      cancelRequestedRef.current = false;
      setSyncProgress([]);
      addLog('🚀 Starting synchronization process...');
    },
    onSuccess: (data) => {
      setIsRunning(false);
      if (Array.isArray(data)) {
        toast.success('Batch sync completed', { 
          description: `Processed ${data.length} games` 
        });
        addLog(`🎉 Batch sync completed for ${data.length} games`);
      } else {
        toast.success('Sync completed', { 
          description: data?.message || 'Sync finished successfully' 
        });
        addLog('🎉 Sync completed successfully');
      }
      // Refresh overall stats
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-overall'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-selected'] });
      // Reload sets to reflect new card counts
      if (selectedGame) {
        loadSetsFromDBForGame(selectedGame);
      }
    },
    onError: (error: any) => {
      console.error('Sync error:', error);
      addLog(`💥 Sync failed: ${error.message}`);
      toast.error('Sync failed', { description: error.message });
      setIsRunning(false);
    }
  });

  // Kill all active jobs mutation
  const killJobsMutation = useMutation({
    mutationFn: async () => {
      setIsKillingJobs(true);
      try {
        const { data, error } = await supabase.functions.invoke('catalog-reset', {
          body: { games: ['pokemon', 'pokemon-japan', 'mtg'] }
        });
        if (error) throw error;
        return data;
      } finally {
        setIsKillingJobs(false);
      }
    },
    onSuccess: () => {
      toast.success('All jobs terminated');
      addLog('🛑 All active jobs have been terminated');
      // Cancel our local state too
      cancelRequestedRef.current = true;
      setIsRunning(false);
      setSyncProgress([]);
    },
    onError: (error: any) => {
      console.error('Kill jobs failed:', error);
      toast.error('Failed to kill jobs', { description: error.message });
      addLog(`💥 Failed to terminate jobs: ${error.message}`);
    }
  });

  // Refresh stats mutation
  const refreshStatsMutation = useMutation({
    mutationFn: async () => {
      // Force refresh all stats queries
      await queryClient.invalidateQueries({ queryKey: ['catalog-stats-overall'] });
      await queryClient.invalidateQueries({ queryKey: ['catalog-stats-selected'] });
      await queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      // Small delay to allow queries to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      toast.success('Stats refreshed');
      addLog('📊 Statistics refreshed successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to refresh stats', { description: error.message });
      addLog(`💥 Failed to refresh stats: ${error.message}`);
    }
  });

  // Load sets for selected game from DB
  useEffect(() => {
    if (selectedGame) {
      setGameSets([]);
      setSelectedSets([]);
      loadSetsFromDBForGame(selectedGame);
    } else {
      setGameSets([]);
      setSelectedSets([]);
    }
  }, [selectedGame]);

  // Load sets for selected game using API counts (falls back to RPC)
  const loadSetsFromDBForGame = async (gameId: string) => {
    const game = normalizeGameSlug(gameId);
    setIsLoadingSets(true);
    try {
      // Prefer Edge Function that returns live card counts from catalog_v2.cards
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('api-catalog-sets', {
        body: { game }
      });
      if (edgeError) {
        toast.error("API Error", {
          description: `Failed to fetch live counts: ${edgeError.message}. Using fallback.`
        });
        throw new Error(`api-catalog-sets failed: ${edgeError.message}`);
      }
      const sets = (edgeData?.sets || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        game,
        released_at: s.released_at,
        cards_count: s.cards_count ?? 0,
      }));

      setGameSets(sets);
      addLog(`📋 Loaded ${sets.length} sets for ${game} (API counts)`);
    } catch (apiErr: any) {
      // Fallback to DB RPC if API unavailable
      try {
        const { data: browse, error } = await supabase.rpc('catalog_v2_browse_sets', {
          game_in: game,
          page_in: 1,
          limit_in: 1000
        });
        if (error) throw error;

        const setsResp = (browse as any) || {};
        const sets = (setsResp.sets || []).map((s: any) => ({
          id: s.set_id,
          name: s.name,
          game,
          released_at: s.release_date,
          cards_count: s.cards_count ?? 0,
        }));

        setGameSets(sets);
        addLog(`📋 Loaded ${sets.length} sets for ${game} (DB RPC fallback)`);
      } catch (e: any) {
        addLog(`❌ Failed to load sets for ${game}: ${e.message || e}`);
        setGameSets([]);
      }
    } finally {
      setIsLoadingSets(false);
    }
  };

  // Discover new sets from API and refresh DB
  const discoverNewSets = async () => {
    if (!selectedGame) return;
    
    try {
      const game = normalizeGameSlug(selectedGame);
      addLog(`🔎 Discovering new sets from API for ${game}…`);
      
      // Edge Function that talks to JustTCG, upserts sets via catalog_v2_upsert_sets
      const res = await supabase.functions.invoke('discover-sets', {
        body: { games: [game] }
      });
      
      if (res.error) throw new Error(res.error.message);
      
      addLog(`✅ Discover complete for ${game}. Reloading DB sets…`);
      await loadSetsFromDBForGame(selectedGame);
      
      toast.success('New sets discovered', { 
        description: `Successfully discovered new sets for ${game}` 
      });
    } catch (e: any) {
      addLog(`❌ Discover failed: ${e.message || e}`);
      toast.error('Failed to discover sets', { description: e.message });
    }
  };

  // Backfill provider IDs for the selected game
  const handleBackfillProviderIds = async () => {
    if (!selectedGame) return;
    
    setIsBackfilling(true);
    const startTime = Date.now();
    
    try {
      const normalizedGame = normalizeGameSlug(selectedGame);
      addLog(`🔄 Starting provider ID backfill for ${normalizedGame}...`);

      const { data, error } = await supabase.functions.invoke('backfill-provider-ids', {
        body: { games: [normalizedGame] }
      });

      if (error) throw error;

      const duration = Date.now() - startTime;
      const results = data?.results || [];
      const gameResult = results.find((r: any) => r.game === normalizedGame) || {};

      addLog(`✅ Backfill complete: ${gameResult.updated || 0}/${gameResult.processed || 0} provider IDs updated (${duration}ms)`);

      toast.success("Backfill Complete", {
        description: `${gameResult.updated || 0}/${gameResult.processed || 0} provider IDs updated (${duration}ms)`,
      });

      // Reload sets to reflect the updated provider_ids
      await loadSetsFromDBForGame(selectedGame);
      
      // Refresh catalog stats
      queryClient.invalidateQueries({ queryKey: ['catalog_v2_stats', normalizedGame] });
    } catch (error: any) {
      addLog(`❌ Backfill failed: ${error.message}`);
      toast.error("Backfill Failed", {
        description: error.message,
      });
    } finally {
      setIsBackfilling(false);
    }
  };

  // Filtered sets
  const filteredSets = gameSets.filter(set =>
    set.name.toLowerCase().includes(setSearchQuery.toLowerCase()) ||
    set.id.toLowerCase().includes(setSearchQuery.toLowerCase())
  );

  const handleGameChange = async (newGame: string) => {
    setSelectedGame(newGame);
    
    // Immediately refresh stats for the new game using react-query
    const normalizedGame = normalizeGameSlug(newGame);
    await queryClient.invalidateQueries({ queryKey: ['catalog-stats', normalizedGame] });
    
    // Clear selected sets when changing games
    setSelectedSets([]);
    
    // Optional: preload sets for snappier UX
    await preloadSetsForGame(newGame);
  };

  // Optional: preload sets to make downstream UI snappier
  const preloadSetsForGame = async (gameId: string) => {
    try {
      // Use the new catalog-sets API to warm the cache
      const normalizedGame = normalizeGameSlug(gameId);
      await fetch(`${FUNCTIONS_BASE}/api-catalog-sets?game=${encodeURIComponent(normalizedGame)}`);
      // Fire-and-forget, just warming the cache
    } catch (error) {
      // Fire-and-forget, ignore errors
      console.debug('Preload sets failed:', error);
    }
  };

  const handleSetToggle = (setId: string, checked: boolean) => {
    if (checked) {
      setSelectedSets(prev => [...prev, setId]);
    } else {
      setSelectedSets(prev => prev.filter(id => id !== setId));
    }
  };

  // Verify card count for a specific set
  const verifySetCardCount = async (setId: string, setName: string) => {
    const game = normalizeGameSlug(selectedGame || '');
    try {
      // Use RPC function to get card count for the set
      const { data, error } = await supabase.rpc('catalog_v2_browse_cards', {
        game_in: game,
        set_id_in: setId,
        page_in: 1,
        limit_in: 1
      });

      if (error) throw error;

      const result = data as any;
      const count = result?.total_count || 0;
      const message = `${setName}: ${count} cards in database`;
      addLog(`🔍 ${message}`);
      toast.success("Card Count Verification", {
        description: message
      });

      if (count === 0) {
        toast.error("Warning", {
          description: `${setName} has 0 cards in database despite being synced. This may indicate a sync issue.`
        });
      }
    } catch (error: any) {
      addLog(`❌ Failed to verify ${setName}: ${error.message}`);
      toast.error("Verification Failed", {
        description: `Could not verify card count for ${setName}: ${error.message}`
      });
    }
  };

  const handleSelectAllSets = () => {
    if (selectedSets.length === filteredSets.length) {
      setSelectedSets([]);
    } else {
      setSelectedSets(filteredSets.map(set => set.id));
    }
  };

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">JustTCG Catalog Sync</h1>
            <p className="text-muted-foreground">
              Synchronize trading card game data from JustTCG API into the local database.
            </p>
          </div>

          {/* Main Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Sync Controls
              </CardTitle>
              <CardDescription>
                Select games and sets to synchronize. Use smart sync settings for optimized performance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Game Selection */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Select Game</label>
                    
                    <GameCombobox
                      value={selectedGame}
                      onChange={handleGameChange}
                      items={games || []}
                      disabled={gamesLoading}
                      placeholder={gamesLoading ? "Loading games..." : "Choose a game to sync..."}
                      inputPlaceholder="Search games..."
                    />
                  </div>
                  
                  <Button
                    onClick={() => syncMutation.mutate({ gameId: selectedGame })}
                    disabled={!selectedGame || isRunning || syncMutation.isPending}
                    size="lg"
                  >
                    {isRunning || syncMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Sync
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Set Selection */}
              {selectedGame && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-medium">
                      Select Sets ({selectedSets.length} of {filteredSets.length} selected)
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => selectedGame && loadSetsFromDBForGame(selectedGame)}
                        disabled={!selectedGame || isLoadingSets}
                      >
                        {isLoadingSets ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        Refresh Sets (DB)
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={discoverNewSets}
                        disabled={!selectedGame || isLoadingSets}
                      >
                        <Search className="h-3 w-3 mr-1" />
                        Discover New Sets (API)
                      </Button>

                      <Button
                        variant="outline" 
                        size="sm"
                        onClick={handleBackfillProviderIds}
                        disabled={!selectedGame || isBackfilling}
                      >
                        {isBackfilling ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        {isBackfilling ? 'Backfilling...' : 'Backfill Provider IDs'}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllSets}
                        disabled={isLoadingSets}
                      >
                        {selectedSets.length === filteredSets.length ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                  </div>

                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search sets..."
                      value={setSearchQuery}
                      onChange={(e) => setSetSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <ScrollArea className="h-64 border rounded-lg">
                    <div className="p-4 space-y-2">
                      {isLoadingSets ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="ml-2 text-muted-foreground">Loading sets...</span>
                        </div>
                      ) : filteredSets.length > 0 ? (
                        filteredSets.map((set) => (
                          <div key={set.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded">
                            <Checkbox
                              id={set.id}
                              checked={selectedSets.includes(set.id)}
                              onCheckedChange={(checked) => handleSetToggle(set.id, checked as boolean)}
                            />
                            <label
                              htmlFor={set.id}
                              className="flex-1 text-sm cursor-pointer flex items-center justify-between"
                            >
                              <div>
                                <div className="font-medium">{set.name}</div>
                                <div className="text-xs text-muted-foreground">{set.id}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-muted-foreground">
                                  {set.cards_count || 0} cards
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    verifySetCardCount(set.id, set.name);
                                  }}
                                  title="Verify card count"
                                >
                                  🔍
                                </Button>
                              </div>
                            </label>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No sets found for this game
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={() => killJobsMutation.mutate()}
                  disabled={killJobsMutation.isPending}
                >
                  {killJobsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mr-2" />
                  )}
                  Kill All Jobs
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => refreshStatsMutation.mutate()}
                  disabled={refreshStatsMutation.isPending}
                >
                  {refreshStatsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh Stats
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setLogs([])}
                  disabled={logs.length === 0}
                >
                  Clear Logs
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Smart Sync Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Smart Sync Settings
              </CardTitle>
              <CardDescription>
                Configure intelligent sync behavior to optimize performance and reduce API usage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="only-new-sets"
                    checked={onlyNewSets}
                    onCheckedChange={(checked) => setOnlyNewSets(checked as boolean)}
                  />
                  <label
                    htmlFor="only-new-sets"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Only sync new sets (no existing cards)
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="skip-recently-updated"
                    checked={skipRecentlyUpdated}
                    onCheckedChange={(checked) => setSkipRecentlyUpdated(checked as boolean)}
                  />
                  <label
                    htmlFor="skip-recently-updated"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Skip recently updated sets
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="force-resync"
                    checked={forceResync}
                    onCheckedChange={(checked) => setForceResync(checked as boolean)}
                  />
                  <label
                    htmlFor="force-resync"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Force resync all data
                  </label>
                </div>

                <div className="space-y-2">
                  <label htmlFor="since-days" className="text-sm font-medium">
                    Incremental sync period (days)
                  </label>
                  <Input
                    id="since-days"
                    type="number"
                    min="1"
                    max="365"
                    value={sinceDays}
                    onChange={(e) => setSinceDays(parseInt(e.target.value) || 30)}
                    className="w-24"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sync Progress */}
          {syncProgress.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Sync Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {syncProgress.map((progress, index) => (
                    <div key={`${progress.gameId}-${index}`} className="flex items-center gap-3">
                      <div className="w-32 text-sm font-medium truncate">
                        {progress.gameId}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={progress.status === 'done' ? 100 : progress.status === 'running' ? 50 : 0} 
                            className="flex-1" 
                          />
                          <Badge 
                            variant={
                              progress.status === 'done' ? 'default' : 
                              progress.status === 'error' ? 'destructive' : 
                              'secondary'
                            }
                          >
                            {progress.status === 'running' ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Running
                              </>
                            ) : progress.status === 'done' ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Done
                              </>
                            ) : (
                              progress.status
                            )}
                          </Badge>
                        </div>
                        {progress.message && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {progress.message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Activity Logs ({logs.length})
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLogs([])}
                  >
                    Clear Logs
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-1 font-mono text-sm">
                    {logs.map((log, index) => (
                      <div key={index} className="py-1 px-2 hover:bg-muted/50 rounded">
                        {log}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Database Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Database Statistics
              </CardTitle>
              <CardDescription>
                Current statistics of imported games, sets, and cards in the database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Stats */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Overall Database Statistics
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {overallStats?.map((stats) => (
                    <div key={stats.game} className="border rounded-lg p-4 space-y-2">
                      <div className="text-sm font-medium text-muted-foreground uppercase">
                        {stats.game === 'pokemon-japan' ? 'Pokemon Japan' : 
                         stats.game === 'pokemon' ? 'Pokemon' : 
                         stats.game === 'mtg' ? 'Magic: The Gathering' : stats.game}
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-sm">Sets:</span>
                          <Badge variant="secondary">{stats.sets_count || 0}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Cards:</span>
                          <Badge variant="secondary">{stats.cards_count || 0}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm cursor-help">Pending:</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Sets discovered with 0 cards in the database</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Badge variant={stats.pending_count > 0 ? "destructive" : "default"}>
                            {stats.pending_count || 0}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )).filter(Boolean) || (
                    <div className="col-span-3 text-center py-4 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading overall statistics...
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Game Stats */}
              {selectedGame && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Selected Game: {games?.find(g => g.id === selectedGame)?.name}
                  </h4>
                  {selectedGameStats ? (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">{selectedGameStats.sets_count || 0}</div>
                          <div className="text-sm text-muted-foreground">Total Sets</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">{selectedGameStats.cards_count || 0}</div>
                          <div className="text-sm text-muted-foreground">Total Cards</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">{selectedGameStats.pending_count || 0}</div>
                          <div className="text-sm text-muted-foreground">Pending Sets</div>
                        </div>
                      </div>
                    </div>
                  ) : selectedGameLoading ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading selected game statistics...
                    </div>
                  ) : null}
                </div>
              )}

              {/* Queue Stats */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Sync Queue Status
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {queueStats?.map((stats) => (
                    <div key={stats.mode} className="border rounded-lg p-4 space-y-2">
                      <div className="text-sm font-medium text-muted-foreground uppercase">
                        {stats.mode === 'pokemon-japan' ? 'Pokemon Japan' : 
                         stats.mode === 'pokemon' ? 'Pokemon' : 
                         stats.mode === 'mtg' ? 'Magic: The Gathering' : stats.mode}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span>Queued:</span>
                          <Badge variant="outline" className="text-xs">{stats.queued || 0}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Processing:</span>
                          <Badge variant="secondary" className="text-xs">{stats.processing || 0}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Done:</span>
                          <Badge variant="default" className="text-xs">{stats.done || 0}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Errors:</span>
                          <Badge variant="destructive" className="text-xs">{stats.error || 0}</Badge>
                        </div>
                      </div>
                    </div>
                  )) || (
                    <div className="col-span-3 text-center py-4 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading queue statistics...
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}