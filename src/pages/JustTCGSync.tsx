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
  Play, 
  Database, 
  RefreshCw, 
  Search, 
  Settings, 
  CheckCircle, 
  Clock, 
  Loader2, 
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCatalogSyncStatus, parseFunctionError } from '@/lib/fns';

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
  const [setsGameFilter, setSetsGameFilter] = useState<string>('all');
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isKillingJobs, setIsKillingJobs] = useState(false);
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata | null>(null);
  
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
    const savedGames = localStorage.getItem('justtcg-selected-games');
    const savedSets = localStorage.getItem('justtcg-selected-sets');
    const savedSetsGameFilter = localStorage.getItem('justtcg-sets-game-filter');
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
    if (savedSetsGameFilter) {
      setSetsGameFilter(savedSetsGameFilter);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('justtcg-selected-games', JSON.stringify(selectedGames));
  }, [selectedGames]);

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

  useEffect(() => {
    localStorage.setItem('justtcg-sets-game-filter', setsGameFilter);
  }, [setsGameFilter]);

  // Auto-load sets when games are selected
  useEffect(() => {
    if (selectedGames.length > 0) {
      loadSetsFromDB(selectedGames, games);
    }
  }, [selectedGames]);

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

  // No longer using async queue - removed handleProcessQueue function

  // Sync sets mutation
  const syncSetsMutation = useMutation({
    mutationFn: async (params: { mode: 'selected' | 'all-for-games' | 'all-games'; gameIds?: string[]; setIds?: string[] }) => {
      setIsRunning(true);
      setSyncProgress([]);
      cancelRequestedRef.current = false;
      
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
            
            // Inline processing - call the function directly
            const { data: result, error } = await Promise.race([
              supabase.functions.invoke('catalog-sync', {
                body: requestPayload
              }),
              timeoutPromise
            ]) as any;
            
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
                  ? { ...p, status: 'done', message: `${result?.cardsProcessed || 0} cards, ${result?.variantsProcessed || 0} variants` }
                  : p
              ));
              
              addLog(`✅ ${setName}: ${result?.cardsProcessed || 0} cards, ${result?.variantsProcessed || 0} variants`);
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

  // Discover sets mutation
  const discoverSetsMutation = useMutation({
    mutationFn: async (gameIds?: string[]) => {
      const payload = gameIds && gameIds.length > 0 ? { gameIds } : {};
      const { data, error } = await supabase.functions.invoke('discover-sets', {
        body: payload
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('Sets discovery completed:', data);
      toast.success('Sets discovery completed', { 
        description: `Discovered ${data.totalSets || 'unknown'} sets`
      });
      addLog(`🔍 Sets discovery completed: ${data.totalSets || 'unknown'} sets`);
      
      // Reload sets data
      if (selectedGames.length > 0) {
        loadSetsFromDB(selectedGames, games);
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

  // Load sets from database
  const loadSetsFromDB = async (gameIds: string[], allGames: Game[]) => {
    setIsLoadingSets(true);
    addLog(`📚 Loading sets for ${gameIds.length} games from database...`);
    
    try {
      const { data, error } = await supabase.functions.invoke('discover-sets', {
        body: { 
          gameIds: gameIds.length > 0 ? gameIds : undefined,
          loadFromDB: true
        }
      });
      
      if (error) {
        throw error;
      }
      
      if (data && data.setsByGame) {
        const newGroupedSets: { [gameId: string]: GameSet[] } = {};
        
        // Process the returned sets
        Object.entries(data.setsByGame).forEach(([gameId, sets]: [string, any]) => {
          if (Array.isArray(sets)) {
            newGroupedSets[gameId] = sets.map((set: any) => ({
              id: set.id,
              game: gameId,
              name: set.name,
              released_at: set.released_at,
              cards_count: set.cards_count
            }));
          }
        });
        
        setGroupedSets(newGroupedSets);
        
        const totalSets = Object.values(newGroupedSets).reduce((sum, sets) => sum + sets.length, 0);
        addLog(`✅ Loaded ${totalSets} sets from database`);
        toast.success('Sets loaded', { description: `Loaded ${totalSets} sets from database` });
      } else {
        addLog('⚠️ No sets data returned from database');
      }
      
    } catch (error: any) {
      console.error('Error loading sets from DB:', error);
      addLog(`❌ Failed to load sets: ${error.message}`);
      toast.error('Failed to load sets', { description: error.message });
    } finally {
      setIsLoadingSets(false);
    }
  };

  // Utility functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleGameSelection = (gameId: string, checked: boolean) => {
    setSelectedGames(prev => 
      checked ? [...prev, gameId] : prev.filter(id => id !== gameId)
    );
  };

  const handleSetSelection = (setId: string, checked: boolean) => {
    setSelectedSets(prev => 
      checked ? [...prev, setId] : prev.filter(id => id !== setId)
    );
  };

  const handleSelectAllSetsForGame = (gameId: string) => {
    const sets = groupedSets[gameId] || [];
    const setIds = sets.map(set => set.id);
    setSelectedSets(prev => [...new Set([...prev, ...setIds])]);
  };

  const handleClearAllSetsForGame = (gameId: string) => {
    const sets = groupedSets[gameId] || [];
    const setIds = sets.map(set => set.id);
    setSelectedSets(prev => prev.filter(id => !setIds.includes(id)));
  };

  const handleSelectAllShownSets = () => {
    const shownSets = Object.entries(groupedSets)
      .filter(([gameId]) => setsGameFilter === 'all' || gameId === setsGameFilter)
      .flatMap(([_, sets]) => sets.map(set => set.id));
    setSelectedSets(prev => [...new Set([...prev, ...shownSets])]);
  };

  const handleClearAllShownSets = () => {
    const shownSets = Object.entries(groupedSets)
      .filter(([gameId]) => setsGameFilter === 'all' || gameId === setsGameFilter)
      .flatMap(([_, sets]) => sets.map(set => set.id));
    setSelectedSets(prev => prev.filter(id => !shownSets.includes(id)));
  };

  const handleSyncSelectedSets = () => {
    if (selectedSets.length === 0) {
      toast.warning('No sets selected', { description: 'Please select at least one set to sync' });
      return;
    }
    syncSetsMutation.mutate({ mode: 'selected', setIds: selectedSets });
  };

  const handleSyncAllSetsForSelectedGames = () => {
    if (selectedGames.length === 0) {
      toast.warning('No games selected', { description: 'Please select at least one game to sync all its sets' });
      return;
    }
    syncSetsMutation.mutate({ mode: 'all-for-games', gameIds: selectedGames });
  };

  const handleSyncAllGamesAndSets = () => {
    syncSetsMutation.mutate({ mode: 'all-games' });
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

  const handleSetSearchChange = (gameId: string, query: string) => {
    setSetSearchQueries(prev => ({
      ...prev,
      [gameId]: query
    }));
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
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">JustTCG Sync</h1>
        <p className="text-muted-foreground">
          Sync trading card game data from JustTCG API to your local database
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Select Games */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
              Select Games
            </CardTitle>
            <CardDescription>
              Choose which trading card games to sync. Data will be fetched from the JustTCG API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              Load sets from the database or refresh from the JustTCG API. Sets auto-load when games are selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-center">
              <Button
                onClick={() => loadSetsFromDB(selectedGames.length > 0 ? selectedGames : undefined, games)}
                disabled={isLoadingSets}
                variant="default"
              >
                {isLoadingSets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                Load Sets from DB
              </Button>
              
              <Button
                onClick={() => discoverSetsMutation.mutate(selectedGames.length > 0 ? selectedGames : undefined)}
                disabled={discoverSetsMutation.isPending}
                variant="outline"
              >
                {discoverSetsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh Sets from API
              </Button>
              
              {Object.keys(groupedSets).length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Game:</span>
                    <Select value={setsGameFilter} onValueChange={setSetsGameFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All games</SelectItem>
                        {Object.keys(groupedSets).map(gameId => {
                          const game = games.find(g => g.id === gameId);
                          return (
                            <SelectItem key={gameId} value={gameId}>
                              {game?.name || gameId}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button onClick={handleSelectAllShownSets} variant="outline" size="sm">
                    Select All Shown
                  </Button>
                  <Button onClick={handleClearAllShownSets} variant="outline" size="sm">
                    Clear All Shown
                  </Button>
                </>
              )}
              
              <Badge variant="secondary">
                {selectedSets.length} sets selected
              </Badge>
            </div>

            {Object.keys(groupedSets).length > 0 && (
              <div className="space-y-4">
                {Object.entries(groupedSets)
                  .filter(([gameId]) => setsGameFilter === 'all' || gameId === setsGameFilter)
                  .map(([gameId, sets]) => {
                  const game = games.find(g => g.id === gameId);
                  const searchQuery = setSearchQueries[gameId] || '';
                  const filteredSets = sets.filter(set =>
                    (set.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (set.id ?? '').toLowerCase().includes(searchQuery.toLowerCase())
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

                      <div className="mb-3">
                        <div className="relative">
                          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search sets..."
                            value={searchQuery}
                            onChange={(e) => handleSetSearchChange(gameId, e.target.value)}
                            className="pl-8 h-8"
                          />
                        </div>
                      </div>

                      <ScrollArea className="h-32">
                        <div className="grid grid-cols-1 gap-1">
                          {filteredSets.map((set) => (
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}