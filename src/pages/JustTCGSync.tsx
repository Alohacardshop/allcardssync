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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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

export default function JustTCGSync() {
  // State management
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [setSearchQuery, setSetSearchQuery] = useState('');
  const [gameSets, setGameSets] = useState<GameSet[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isKillingJobs, setIsKillingJobs] = useState(false);
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata | null>(null);
  
  const FUNCTIONS_BASE = 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1';
  
  // Pokemon Japan controls
  const [pokemonJapanSetId, setPokemonJapanSetId] = useState('');
  const [isRunningJapanSync, setIsRunningJapanSync] = useState(false);
  
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
      const modes = ['pokemon', 'pokemon-japan', 'mtg'];
      const results = await Promise.all(
        modes.map(async (mode) => {
          try {
            const { data, error } = await supabase.rpc('catalog_v2_queue_stats_by_mode', { mode_in: mode });
            if (error) throw error;
            // RPC returns an array, get the first element
            const statsData = Array.isArray(data) ? data[0] : data;
            return { mode, ...statsData };
          } catch {
            return { mode, queued: 0, processing: 0, done: 0, error: 0 };
          }
        })
      );
      return results;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Fetch games
  const { data: games = [], isLoading: gamesLoading, error: gamesError } = useQuery({
    queryKey: ['games'],
    queryFn: async () => {
      console.log('Fetching games...');
      const { data, error } = await supabase.functions.invoke('discover-games');
      
      if (error) {
        console.error('Error fetching games:', error);
        throw error;
      }

      console.log('Games response:', data);
      
      if (!data || !data.data) {
        throw new Error('No games data received');
      }

      const games = data.data.map((game: any) => ({
        id: game.id || game.game_id || 'undefined',
        name: game.name,
        cards_count: game.cards_count || game.count,
        sets_count: game.sets_count
      }));
      
      console.log('Games array:', games);
      console.log('Games length:', games.length);
      console.log('Games metadata:', data._metadata);
      
      return games;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Auto-load sets when game is selected
  useEffect(() => {
    if (selectedGame && games.length > 0) {
      loadSetsFromDB([selectedGame], games);
    } else {
      // Clear sets when no game selected
      setGameSets([]);
      setSelectedSets([]);
    }
  }, [selectedGame]);

  // Sync sets mutation
  const syncSetsMutation = useMutation({
    mutationFn: async (params: { mode: 'selected' | 'all-for-game' | 'all-games'; gameId?: string; setIds?: string[] }) => {
      setIsRunning(true);
      setSyncProgress([]);
      cancelRequestedRef.current = false;
      
      let setsToSync: Array<{ gameId: string; setId: string; setName: string }> = [];
      
      if (params.mode === 'selected' && params.setIds) {
        // Get set details for selected sets from the single game
        setsToSync = params.setIds.map(setId => {
          const set = gameSets.find(s => s.id === setId);
          if (set) {
            return { gameId: selectedGame, setId, setName: set.name };
          }
          return { gameId: selectedGame || 'unknown', setId, setName: setId };
        });
      } else if (params.mode === 'all-for-game' && params.gameId) {
        // Get all sets for the selected game
        setsToSync = gameSets.map(set => ({
          gameId: params.gameId!,
          setId: set.id,
          setName: set.name
        }));
      } else if (params.mode === 'all-games') {
        // This mode is not supported in single-game mode
        throw new Error('All-games mode not supported in single-game selection');
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
      const results = [] as any[];
      let cancelled = false;
      for (let i = 0; i < setsToSync.length; i++) {
        if (cancelRequestedRef.current) {
          cancelled = true;
          addLog('🛑 Stop requested. Halting sync...');
          // Mark remaining queued/running as cancelled
          setSyncProgress(prev => prev.map(p => 
            (p.status === 'queued' || p.status === 'running')
              ? { ...p, status: 'error', message: 'Cancelled by user' }
              : p
          ));
          break;
        }

        const { gameId, setId, setName } = setsToSync[i];
        
        // Update progress to running
        setSyncProgress(prev => prev.map(p => 
          p.gameId === gameId && p.setId === setId 
            ? { ...p, status: 'running' }
            : p
        ));

        // Handle game-specific API compatibility
        const normalizedGameId = gameId === 'pokemon_japan' ? 'pokemon-japan' : gameId;
        const functionName = 'catalog-sync';
        
        try {
          // Check for UX warning: English-only set selected for pokemon-japan
          if (normalizedGameId === 'pokemon-japan' && setName && !setName.match(/japanese|japan|日本/i)) {
            addLog(`⚠️ Warning: "${setName}" might be English-only but selected for pokemon-japan`);
            toast.warning('Possible English-only set', { 
              description: `"${setName}" might be English-only. Consider using regular Pokemon instead.` 
            });
          }
          
          addLog(`⚡ Syncing ${setName} (${normalizedGameId})...`);
          
          // Add client-side watchdog timeout (90 seconds)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Request timed out after 90 seconds'));
            }, 90000);
          });
          
          try {
            // Prepare sync options based on smart sync settings
            let requestPayload = {
              game: normalizedGameId,
              setId,
              forceSync: forceResync,
              cooldownHours: skipRecentlyUpdated ? sinceDays * 24 : 0
            };
            
            let result: any;
            let error: any = null;
            
            if (normalizedGameId === 'pokemon-japan') {
              // Inform the user we're routing to the dedicated JP sync
              toast.warning('Using Pokémon Japan dedicated sync', { 
                description: 'Routing to the Japan-specific edge function.' 
              });
              const url = `${FUNCTIONS_BASE}/catalog-sync-pokemon-japan?setId=${encodeURIComponent(setId)}`;
              const response = await Promise.race([
                fetch(url, { method: 'POST' }),
                timeoutPromise
              ]) as Response;
              const json = await response.json();
              if (!response.ok) {
                error = { message: json?.error || 'Japan sync failed' };
              } else {
                result = json;
              }
            } else {
              // Inline processing - call the generic function directly
              const raced: any = await Promise.race([
                supabase.functions.invoke('catalog-sync', {
                  body: requestPayload
                }),
                timeoutPromise
              ]);
              result = raced?.data;
              error = raced?.error || null;
            }
            
            if (error) {
              throw new Error(`Sync failed: ${error.message}`);
            }
            
            // Handle different result statuses
            if (result?.status === 'skipped_cooldown') {
              setSyncProgress(prev => prev.map(p => 
                p.gameId === gameId && p.setId === setId 
                  ? { ...p, status: 'done', message: `Skipped: ${result.message}` }
                  : p
              ));
              
              addLog(`⏭️ ${setName}: ${result.message}`);
              results.push(result);
              
            } else if (result?.status === 'skipped_no_cards_needed') {
              // Handle sets that don't need syncing (already have cards)
              setSyncProgress(prev => prev.map(p => 
                p.gameId === gameId && p.setId === setId 
                  ? { ...p, status: 'done', message: 'Skipped (already has cards)' }
                  : p
              ));
              
              addLog(`⏭️ ${setName}: Skipped (already has cards)`);
              results.push(result);
              
            } else {
              // Normal successful sync
              results.push(result);
              
              // Update progress to done
              setSyncProgress(prev => prev.map(p => 
                p.gameId === gameId && p.setId === setId 
                  ? { ...p, status: 'done', message: `${(result?.cardsProcessed ?? result?.cards ?? 0)} cards, ${(result?.variantsProcessed ?? 0)} variants` }
                  : p
              ));
              
              addLog(`✅ ${setName}: ${(result?.cardsProcessed ?? result?.cards ?? 0)} cards, ${(result?.variantsProcessed ?? 0)} variants`);
            }
          
          } catch (syncError: any) {
            throw syncError;
          }
          
        } catch (error: any) {
          let errorMessage = error.message;
          
          // Check for timeout/abort error
          if (errorMessage?.includes('timed out after 90 seconds')) {
            addLog(`⏱️ Timeout: ${setName} took longer than 90 seconds`);
            toast.warning('Request timeout', { 
              description: `${setName} sync timed out after 90 seconds. Try syncing fewer sets at once.`
            });
          } else if (errorMessage?.includes('aborted')) {
            addLog(`🛑 Aborted: ${setName} sync was cancelled`);
          } else {
            // Parse error for more details
            const parsedError = parseFunctionError(error);
            if (parsedError && typeof parsedError === 'object') {
              const errorObj = parsedError as any;
              if (errorObj.type && errorObj.message) {
                errorMessage = `${errorObj.type}: ${errorObj.message}`;
                if (errorObj.details) {
                  errorMessage += ` (${errorObj.details})`;
                }
              }
            }
            
            addLog(`❌ ${setName}: ${errorMessage}`);
            toast.error(`Sync failed: ${setName}`, { description: errorMessage });
          }
          
          // Update progress to error
          setSyncProgress(prev => prev.map(p => 
            p.gameId === gameId && p.setId === setId 
              ? { ...p, status: 'error', message: errorMessage }
              : p
          ));
          
          results.push({ error: errorMessage, setId, gameId });
        }

        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final summary
      const successCount = results.filter(r => !r.error).length;
      const errorCount = results.filter(r => r.error).length;
      const skippedCount = results.filter(r => r.status === 'skipped_cooldown').length;
      const queuedCount = results.filter(r => r.status === 'queued').length;

      addLog(`📊 Sync completed: ${successCount} successful, ${errorCount} errors, ${skippedCount} skipped`);
      
      if (cancelled) {
        toast.info('Sync stopped by user', { 
          description: `${successCount} sets completed before stop${errorCount > 0 ? `, ${errorCount} cancelled/failed` : ''}`
        });
      } else {
        if (queuedCount > 0) {
          addLog(`📥 Queued ${queuedCount} sets for processing`);
        }
        
        if (successCount > 0) {
          toast.success('Sync completed', { 
            description: `${successCount} sets synced successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`
          });
        } else if (errorCount > 0) {
          toast.error('Sync failed', { 
            description: `All ${errorCount} set(s) failed to sync`
          });
        }
      }

      return results;
    },
    onSuccess: (result) => {
      setIsRunning(false);
    },
    onError: (error: any) => {
      console.error('Sync error:', error);
      addLog(`💥 Sync failed: ${error.message}`);
      toast.error('Sync failed', { description: error.message });
      setIsRunning(false);
    }
  });

  // Pokemon Japan sync mutations
  const runJapanOrchestratorMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon-japan');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const queued = data?.queued_sets ?? data?.setsQueued ?? 0;
      toast.success('Pokemon Japan orchestrator started', { 
        description: `Queued ${queued} sets for processing`
      });
      addLog(`🇯🇵 Japan orchestrator: Queued ${queued} sets`);
      // Refresh stats
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-overall'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
    },
    onError: (error: any) => {
      console.error('Japan orchestrator failed:', error);
      toast.error('Japan orchestrator failed', { description: error.message });
      addLog(`💥 Japan orchestrator failed: ${error.message}`);
    }
  });

  const runSingleJapanSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      const res = await fetch(`${FUNCTIONS_BASE}/catalog-sync-pokemon-japan?setId=${encodeURIComponent(setId)}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Japan set sync failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success('Pokemon Japan set sync completed', { 
        description: `Processed ${(data?.cards ?? data?.cardsProcessed ?? 0)} cards`
      });
      addLog(`🇯🇵 Japan set sync: ${(data?.cards ?? data?.cardsProcessed ?? 0)} cards processed`);
      setPokemonJapanSetId('');
      // Refresh stats
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-overall'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-selected'] });
    },
    onError: (error: any) => {
      console.error('Japan set sync failed:', error);
      toast.error('Japan set sync failed', { description: error.message });
      addLog(`💥 Japan set sync failed: ${error.message}`);
    }
  });

  const refreshStatsMutation = useMutation({
    mutationFn: async () => {
      // Just trigger a refresh by invalidating queries
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-overall'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-stats-selected'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      // Wait a bit for the queries to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      toast.success('Stats refreshed');
      addLog('📊 Stats refreshed');
    },
    onError: (error: any) => {
      toast.error('Failed to refresh stats', { description: error.message });
      addLog(`💥 Stats refresh failed: ${error.message}`);
    }
  });

  // Discover sets mutation
  const discoverSetsMutation = useMutation({
    mutationFn: async (gameIds?: string[]) => {
      const payload = gameIds && gameIds.length > 0 ? { games: gameIds } : {};
      const { data, error } = await supabase.functions.invoke('discover-sets', {
        body: payload
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('Sets discovery completed:', data);
      const totalSets = data.totalSets || data._metadata?.totalSetsDiscovered || 'unknown';
      toast.success('Sets discovery completed', { 
        description: `Discovered ${totalSets} sets`
      });
      addLog(`🔍 Sets discovery completed: ${totalSets} sets`);
      
      // Reload sets data
      if (selectedGame) {
        loadSetsFromDB([selectedGame], games);
      }
    },
    onError: (error: any) => {
      console.error('Sets discovery failed:', error);
      toast.error('Sets discovery failed', { description: error.message });
      addLog(`💥 Sets discovery failed: ${error.message}`);
    }
  });

  // Kill jobs mutation
  const killJobsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('catalog-sync-cancel');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('Jobs killed:', data);
      toast.success('All jobs killed', { 
        description: `Cancelled ${data.cancelledJobs || 0} running jobs`
      });
      addLog(`🛑 Killed ${data.cancelledJobs || 0} running jobs`);
      setIsKillingJobs(false);
    },
    onError: (error: any) => {
      console.error('Kill jobs failed:', error);
      toast.error('Failed to kill jobs', { description: error.message });
      addLog(`💥 Kill jobs failed: ${error.message}`);
      setIsKillingJobs(false);
    }
  });

  // Load sets from database for selected game
  const loadSetsFromDB = async (gameIds: string[], allGames?: Game[]) => {
    if (!gameIds || gameIds.length === 0) {
      addLog('⚠️ No game provided to load sets for');
      return;
    }
    
    const gameId = gameIds[0]; // Only load for the first (and only) game
    setIsLoadingSets(true);
    addLog(`📚 Loading sets for ${gameId} from database...`);
    
    try {
      const { data, error } = await supabase.functions.invoke('discover-sets', {
        body: { 
          games: [gameId],
          loadFromDB: true
        }
      });
      
      if (error) {
        throw error;
      }
      
      if (data && data.setsByGame && data.setsByGame[gameId]) {
        const sets = data.setsByGame[gameId].map((set: any) => ({
          id: set.id,
          game: gameId,
          name: set.name,
          released_at: set.released_at,
          cards_count: set.cards_count
        }));
        
        setGameSets(sets);
        addLog(`✅ Loaded ${sets.length} sets for ${gameId}`);
        toast.success('Sets loaded', { description: `Loaded ${sets.length} sets for ${gameId}` });
      } else {
        setGameSets([]);
        addLog('⚠️ No sets found for selected game');
      }
      
    } catch (error: any) {
      console.error('Error loading sets from DB:', error);
      addLog(`❌ Failed to load sets: ${error.message}`);
      toast.error('Failed to load sets', { description: error.message });
      setGameSets([]);
    } finally {
      setIsLoadingSets(false);
    }
  };

  // Utility functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleGameSelection = (gameId: string) => {
    setSelectedGame(gameId);
    setSelectedSets([]); // Clear selected sets when changing games
  };

  const handleSetSelection = (setId: string, checked: boolean) => {
    setSelectedSets(prev => 
      checked ? [...prev, setId] : prev.filter(id => id !== setId)
    );
  };

  const handleSelectAllSets = () => {
    const setIds = gameSets.map(set => set.id);
    setSelectedSets(setIds);
  };

  const handleClearAllSets = () => {
    setSelectedSets([]);
  };

  const handleSyncSelectedSets = () => {
    if (selectedSets.length === 0) {
      toast.warning('No sets selected', { description: 'Please select at least one set to sync' });
      return;
    }
    syncSetsMutation.mutate({ mode: 'selected', setIds: selectedSets });
  };

  const handleSyncAllSetsForSelectedGame = () => {
    if (!selectedGame) {
      toast.warning('No game selected', { description: 'Please select a game to sync all its sets' });
      return;
    }
    syncSetsMutation.mutate({ mode: 'all-for-game', gameId: selectedGame });
  };

  const handleSyncAllGamesAndSets = () => {
    toast.warning('Not supported', { description: 'Use the dropdown to select a specific game instead' });
  };

  const handleHardStop = () => {
    cancelRequestedRef.current = true;
    addLog('🛑 Hard stop requested...');
    toast.info('Stopping sync...', { description: 'Current operations will be cancelled' });
  };

  const handleKillAllJobs = async () => {
    setIsKillingJobs(true);
    addLog('🛑 Killing all running jobs...');
    killJobsMutation.mutate();
  };

  const handleSetSearchChange = (query: string) => {
    setSetSearchQuery(query);
  };

  // Computed values
  const filteredGames = games.filter(game =>
    game.name.toLowerCase().includes(gameSearchQuery.toLowerCase()) ||
    (game.id || '').toLowerCase().includes(gameSearchQuery.toLowerCase())
  );

  const totalProgress = syncProgress.length > 0 
    ? (syncProgress.filter(p => p.status === 'done' || p.status === 'error').length / syncProgress.length) * 100
    : 0;

  if (gamesError) {
    return (
      <>
        <Navigation />
        <div className="container mx-auto p-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">JustTCG Sync</h1>
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-lg font-semibold text-red-900 mb-2">Failed to Load Games</h2>
              <p className="text-red-700 mb-4">{gamesError.message}</p>
              <Button onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="container mx-auto p-6 space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">JustTCG Sync</h1>
          <p className="text-muted-foreground">
            Sync trading card game data from JustTCG API to your local database
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Step 1: Select Game */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
                Select Game
              </CardTitle>
              <CardDescription>
                Choose which trading card game to sync. Data will be fetched from the JustTCG API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Game:</label>
                <Select value={selectedGame} onValueChange={handleGameSelection}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a game to sync..." />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {gamesLoading ? (
                      <div className="flex items-center gap-2 p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading games...</span>
                      </div>
                    ) : filteredGames.length > 0 ? (
                      filteredGames.map((game) => (
                        <SelectItem key={game.id} value={game.id}>
                          {game.name} ({game.sets_count} sets)
                        </SelectItem>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-4 px-2">
                        No games found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedGame && (
                <div className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                  ℹ️ Sets will automatically load when you select a game
                </div>
              )}
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
                Sets will automatically load when you select a game. You can also refresh from the JustTCG API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 items-center">
                <Button
                  onClick={() => selectedGame && loadSetsFromDB([selectedGame], games)}
                  disabled={isLoadingSets || !selectedGame}
                  variant="default"
                >
                  {isLoadingSets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Load Sets from DB
                </Button>
                
                <Button
                  onClick={() => selectedGame && discoverSetsMutation.mutate([selectedGame])}
                  disabled={discoverSetsMutation.isPending || !selectedGame}
                  variant="outline"
                >
                  {discoverSetsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh Sets from API
                </Button>
                
                {gameSets.length > 0 && (
                  <>
                    <Button onClick={handleSelectAllSets} variant="outline" size="sm">
                      Select All Sets
                    </Button>
                    <Button onClick={handleClearAllSets} variant="outline" size="sm">
                      Clear All Sets
                    </Button>
                  </>
                )}
                
                <Badge variant="secondary">
                  {selectedSets.length} sets selected
                </Badge>
              </div>

              {gameSets.length > 0 ? (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">
                        {games.find(g => g.id === selectedGame)?.name || selectedGame} ({gameSets.length} sets)
                      </h4>
                    </div>

                    <div className="mb-3">
                      <div className="relative">
                        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search sets..."
                          value={setSearchQuery}
                          onChange={(e) => handleSetSearchChange(e.target.value)}
                          className="pl-8 h-8"
                        />
                      </div>
                    </div>

                    <ScrollArea className="max-h-[65vh]">
                      <div className="grid grid-cols-1 gap-1">
                        {gameSets
                          .filter(set =>
                            (set.name ?? '').toLowerCase().includes(setSearchQuery.toLowerCase()) ||
                            (set.id ?? '').toLowerCase().includes(setSearchQuery.toLowerCase())
                          )
                          .map((set) => (
                          <div key={set.id} className="flex items-center space-x-2 py-1">
                            <Checkbox
                              id={`set-${set.id}`}
                              checked={selectedSets.includes(set.id)}
                              onCheckedChange={(checked) => handleSetSelection(set.id, checked as boolean)}
                            />
                            <label
                              htmlFor={`set-${set.id}`}
                              className="text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {set.name}
                              {set.cards_count !== undefined && (
                                <span className="text-muted-foreground ml-1">
                                  ({set.cards_count} cards)
                                </span>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              ) : selectedGame ? (
                <div className="text-center text-muted-foreground py-8">
                  <Database className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No sets loaded</p>
                  <p>Click "Load Sets from DB" or "Refresh Sets from API" to load sets for {games.find(g => g.id === selectedGame)?.name}.</p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Database className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Select a game first</p>
                  <p>Choose a game in step 1 to load its sets.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Sync Options & Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">3</div>
                Sync Options & Controls
              </CardTitle>
              <CardDescription>
                Configure sync options and start the synchronization process.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* Smart Sync Options */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Smart Sync Options
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="only-new-sets"
                          checked={onlyNewSets}
                          onCheckedChange={(checked) => setOnlyNewSets(checked === true)}
                        />
                        <label htmlFor="only-new-sets" className="text-sm font-medium">
                          Only sync new sets (no cards in DB)
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="skip-recently-updated"
                          checked={skipRecentlyUpdated}
                          onCheckedChange={(checked) => setSkipRecentlyUpdated(checked === true)}
                        />
                        <label htmlFor="skip-recently-updated" className="text-sm font-medium">
                          Skip recently updated sets
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="force-resync"
                          checked={forceResync}
                          onCheckedChange={(checked) => setForceResync(checked === true)}
                        />
                        <label htmlFor="force-resync" className="text-sm font-medium">
                          Force resync (ignore cooldown)
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label htmlFor="since-days" className="text-sm font-medium">
                          Skip if updated within (days):
                        </label>
                        <Input
                          id="since-days"
                          type="number"
                          min="1"
                          max="365"
                          value={sinceDays}
                          onChange={(e) => setSinceDays(parseInt(e.target.value) || 30)}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                    💡 Smart sync will check existing data and skip sets that don't need updating, making syncs faster and more efficient.
                  </div>
                </div>

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
                    onClick={handleSyncAllSetsForSelectedGame}
                    disabled={isRunning || !selectedGame}
                    variant="outline"
                    className="w-full"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Sync All Sets for Selected Game
                  </Button>
                  <Button
                    onClick={handleSyncAllGamesAndSets}
                    disabled={true}
                    variant="destructive"
                    className="w-full opacity-50"
                    title="Not supported in single-game mode"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Sync All Games (Disabled)
                  </Button>
                </div>

                {(isRunning || isKillingJobs) && (
                  <div className="flex items-center justify-end gap-2">
                    {isRunning && (
                      <Button variant="destructive" onClick={handleHardStop}>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Hard Stop Now
                      </Button>
                    )}
                    <Button 
                      variant="destructive" 
                      onClick={handleKillAllJobs}
                      disabled={isKillingJobs}
                    >
                      {isKillingJobs ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
                      Kill All Jobs
                    </Button>
                  </div>
                )}

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
              </div>
            </CardContent>
          </Card>

          {/* Logs Panel */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sync Logs</CardTitle>
                <CardDescription>
                  Real-time logs from the sync process
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48 font-mono text-sm border rounded-md p-4 bg-muted/30">
                  <div className="space-y-1">
                    {logs.map((log, index) => (
                      <div key={index} className="text-xs whitespace-pre-wrap break-words">
                        {log}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex justify-end mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLogs([])}
                  >
                    Clear Logs
                  </Button>
                </div>
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
                    Selected Game: {games.find(g => g.id === selectedGame)?.name}
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

          {/* Pokemon Japan Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🇯🇵 Pokemon Japan Controls
              </CardTitle>
              <CardDescription>
                Special controls for Pokemon Japan synchronization and management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  onClick={() => runJapanOrchestratorMutation.mutate()}
                  disabled={runJapanOrchestratorMutation.isPending}
                  variant="default"
                  className="w-full"
                >
                  {runJapanOrchestratorMutation.isPending ? 
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 
                    <Play className="h-4 w-4 mr-2" />
                  }
                  Run Japan Orchestrator
                </Button>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter setId..."
                    value={pokemonJapanSetId}
                    onChange={(e) => setPokemonJapanSetId(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => runSingleJapanSetMutation.mutate(pokemonJapanSetId)}
                    disabled={runSingleJapanSetMutation.isPending || !pokemonJapanSetId.trim()}
                    variant="outline"
                  >
                    {runSingleJapanSetMutation.isPending ? 
                      <Loader2 className="h-4 w-4 animate-spin" /> : 
                      <Play className="h-4 w-4" />
                    }
                  </Button>
                </div>
                
                <Button
                  onClick={() => refreshStatsMutation.mutate()}
                  disabled={refreshStatsMutation.isPending}
                  variant="secondary"
                  className="w-full"
                >
                  {refreshStatsMutation.isPending ? 
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 
                    <RefreshCw className="h-4 w-4 mr-2" />
                  }
                  Refresh Stats
                </Button>
              </div>
              
              <div className="text-xs text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-2">
                💡 Use the orchestrator to queue all Pokemon Japan sets, or sync a specific set by entering its setId above.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
