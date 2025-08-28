import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  
  // Cooldown settings
  const [skipRecentlysynced, setSkipRecentlysynced] = useState(true);
  const [cooldownHours, setCooldownHours] = useState(12);
  const [forceSync, setForceSync] = useState(false);
  
  // Async queue settings
  const [useAsyncQueue, setUseAsyncQueue] = useState(true);
  const [autoProcessQueue, setAutoProcessQueue] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

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

  useEffect(() => {
    localStorage.setItem('justtcg-sets-game-filter', setsGameFilter);
  }, [setsGameFilter]);

  // Helper function to add log entries
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-99), `[${timestamp}] ${message}`]);
  };

  // Load sets from database
  const loadSetsFromDB = async (gameIds?: string[], gamesData?: Game[]) => {
    setIsLoadingSets(true);
    
    // Get available games from the passed parameter or use selected games
    const availableGamesData = gamesData || [];
    const gamesToLoad = gameIds && gameIds.length > 0 ? gameIds : availableGamesData.map(g => g.id).filter(Boolean);
    
    if (gamesToLoad.length === 0) {
      addLog('📋 No games available to load sets for');
      setIsLoadingSets(false);
      return;
    }

    addLog(`📋 Auto-loading sets from DB for ${gamesToLoad.length} games...`);
    
    const setsMap: { [gameId: string]: GameSet[] } = {};
    
    for (const gameId of gamesToLoad) {
      try {        
        const { data: browseResult, error } = await supabase.rpc('catalog_v2_browse_sets', {
          game_in: gameId,
          page_in: 1,
          limit_in: 1000 // Get all sets for the game
        });
        
        if (error) {
          console.warn(`Failed to fetch sets for ${gameId}:`, error);
          addLog(`⚠️ Failed to fetch sets for ${gameId}: ${error.message}`);
          setsMap[gameId] = [];
        } else {
          const setsResponse = browseResult as { sets?: any[], total_count?: number };
          const sets = setsResponse?.sets || [];
          setsMap[gameId] = sets
            .map((set: any) => ({
              id: String(set.set_id || ''),
              game: gameId,
              name: String(set.name || ''),
              released_at: set.release_date,
              cards_count: Number(set.cards_count ?? 0)
            }))
            .filter(set => set.id && set.name); // Filter out sets without ID or name
          addLog(`📋 Loaded ${sets.length} sets for ${gameId} from DB`);
        }
      } catch (e) {
        console.warn(`Error fetching sets for ${gameId}:`, e);
        addLog(`❌ Error fetching sets for ${gameId}: ${e}`);
        setsMap[gameId] = [];
      }
    }
    
    // Preserve existing selected sets
    setGroupedSets(setsMap);
    
    // Reset game filter if current filter game is no longer available
    if (setsGameFilter !== 'all' && !setsMap[setsGameFilter]) {
      setSetsGameFilter('all');
      addLog(`🔄 Reset game filter to "all" (${setsGameFilter} no longer available)`);
    }
    
    const totalSets = Object.values(setsMap).reduce((sum, sets) => sum + sets.length, 0);
    addLog(`📋 Loaded ${totalSets} total sets from database`);
    setIsLoadingSets(false);
  };

  // Fetch discovered games
  const { data: gamesResponse, isLoading: gamesLoading, refetch: refetchGames } = useQuery({
    queryKey: ['discovered-games'],
    queryFn: async () => {
      addLog('📡 Fetching games from JustTCG API...'); 
      const { data, error } = await supabase.functions.invoke('discover-games', {
        body: {}
      });
      
      if (error) {
        throw new Error(`Failed to fetch games: ${error.message}`);
      }
      
      console.log('Games response:', data);
      console.log('Games data:', data?.data);
      addLog(`✅ Discovered ${data?.data?.length || 0} games`);
      addLog(`Response keys: ${Object.keys(data || {}).join(', ')}`);
      if (data?.data?.length > 0) {
        addLog(`First game sample: ${JSON.stringify(data.data[0])}`);
      }
      return data; // Return full response with _metadata
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const games = gamesResponse?.data || [];
  const gamesMetadata = gamesResponse?._metadata;

  // Debug logging
  console.log('Games array:', games);
  console.log('Games length:', games.length);
  console.log('Games metadata:', gamesMetadata);

  // Auto-load sets when selected games change
  useEffect(() => {
    if (selectedGames.length > 0) {
      loadSetsFromDB(selectedGames, games);
    }
  }, [selectedGames, games]);

  // Initial load sets from DB when games are available
  useEffect(() => {
    if (games.length > 0 && selectedGames.length === 0 && Object.keys(groupedSets).length === 0) {
      // On initial load, load sets for all games if no games are selected
      loadSetsFromDB(undefined, games);
    }
  }, [games]);

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

      // Now fetch sets from the catalog_v2 database for selected games
      const setsMap: { [gameId: string]: GameSet[] } = {};
      
      if (selectedGames.length > 0) {
        for (const gameId of selectedGames) {
          try {
            addLog(`📋 Fetching sets for ${gameId} from catalog_v2...`);
            
            const { data: browseResult, error } = await supabase.rpc('catalog_v2_browse_sets', {
              game_in: gameId,
              page_in: 1,
              limit_in: 1000 // Get all sets for the game
            });
            
            if (error) {
              console.warn(`Failed to fetch sets for ${gameId}:`, error);
              addLog(`⚠️ Failed to fetch sets for ${gameId}: ${error.message}`);
              setsMap[gameId] = [];
            } else {
              const setsResponse = browseResult as { sets?: any[], total_count?: number };
              const sets = setsResponse?.sets || [];
              setsMap[gameId] = sets.map((set: any) => ({
                id: set.set_id,
                game: gameId,
                name: set.name,
                released_at: set.release_date,
                cards_count: Number(set.cards_count ?? 0)
              }));
              addLog(`📋 Found ${sets.length} sets for ${gameId}`);
            }
          } catch (e) {
            console.warn(`Error fetching sets for ${gameId}:`, e);
            addLog(`❌ Error fetching sets for ${gameId}: ${e}`);
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

  // Helper function to normalize game names to supported values
  const normalizeGameId = (gameId: string): string => {
    const normalized = gameId.toLowerCase().trim();
    if (normalized.includes('pokemon') && normalized.includes('japan')) {
      return 'pokemon-japan';
    } else if (normalized.includes('pokemon')) {
      return 'pokemon';
    } else if (normalized.includes('mtg') || normalized.includes('magic')) {
      return 'mtg';
    }
    return normalized; // Return as-is if no mapping found
  };

  // Helper function to check if game is supported
  const isSupportedGame = (gameId: string): boolean => {
    const normalized = normalizeGameId(gameId);
    return ['mtg', 'pokemon', 'pokemon-japan'].includes(normalized);
  };

  // Process queue function
  const handleProcessQueue = async () => {
    if (isProcessingQueue) return;
    
    setIsProcessingQueue(true);
    addLog('🔄 Starting queue processing...');
    
    try {
      // Process each supported game's queue
      const games = ['mtg', 'pokemon', 'pokemon-japan'];
      let totalProcessed = 0;
      
      for (const game of games) {
        addLog(`📋 Processing ${game} queue...`);
        
        // Keep processing until queue is empty or we hit an error
        while (true) {
          try {
            const response = await fetch(`https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-sync/drain?mode=${game}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            
            if (result?.status === 'idle') {
              addLog(`✅ ${game} queue empty`);
              break;
            }
            
            if (result?.status === 'done') {
              totalProcessed++;
              addLog(`✅ Processed ${result.setId} from ${game} queue`);
            } else if (result?.status === 'error') {
              addLog(`❌ Queue item ${result.setId} failed: ${result.error}`);
            }
            
            // Small delay between queue drains
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (drainError: any) {
            addLog(`❌ Queue drain failed for ${game}: ${drainError.message}`);
            break;
          }
        }
      }
      
      addLog(`🎉 Queue processing completed. ${totalProcessed} sets processed.`);
      toast.success('Queue processed', { 
        description: `${totalProcessed} sets were processed from the queue`
      });
      
    } catch (error: any) {
      addLog(`💥 Queue processing failed: ${error.message}`);
      toast.error('Queue processing failed', { description: error.message });
    } finally {
      setIsProcessingQueue(false);
    }
  };

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
        
        try {
          const normalizedGameId = normalizeGameId(gameId);
          
          // Check if game is supported
          if (!isSupportedGame(gameId)) {
            throw new Error(`Unsupported game: ${gameId}. Only MTG, Pokémon, and Pokémon Japan are supported.`);
          }
          
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
            const { data: result, error } = await Promise.race([
              supabase.functions.invoke('catalog-sync', {
                body: useAsyncQueue ? { 
                  game: normalizedGameId, 
                  setId,
                  queueOnly: true,
                  cooldownHours: skipRecentlysynced ? cooldownHours : 0,
                  forceSync: forceSync
                } : { 
                  game: normalizedGameId, 
                  setId,
                  cooldownHours: skipRecentlysynced ? cooldownHours : 0,
                  forceSync: forceSync
                }
              }),
              useAsyncQueue ? Promise.resolve({ data: null, error: null }) : timeoutPromise // No timeout for queue mode
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
              
            } else if (result?.status === 'queued') {
              // Handle queued status for async mode
              setSyncProgress(prev => prev.map(p => 
                p.gameId === gameId && p.setId === setId 
                  ? { ...p, status: 'done', message: `Queued for processing` }
                  : p
              ));
              
              addLog(`📥 ${setName}: Queued for async processing`);
              results.push(result);
              
            } else {
              // Normal successful sync
              results.push(result);
              
              // Update progress to done
              setSyncProgress(prev => prev.map(p => 
                p.gameId === gameId && p.setId === setId 
                  ? { ...p, status: 'done', message: `${result.cardsProcessed || 0} cards, ${result.variantsProcessed || 0} variants` }
                  : p
              ));
              
              addLog(`✅ ${setName}: ${result.cardsProcessed || 0} cards, ${result.variantsProcessed || 0} variants`);
            }
          
          } catch (syncError: any) {
            throw syncError;
          }
          
        } catch (error: any) {
          let errorMessage = error.message;
          
          // Check for timeout/abort error
          if (errorMessage?.includes('timed out after 90 seconds')) {
            addLog(`⏱️ Timeout: ${setName} took longer than 90 seconds`);
          }
          
          // Try to parse more detailed error from response
          if (error.message && error.message.includes('Sync failed:')) {
            const match = error.message.match(/Sync failed: (.+)/);
            if (match) {
              try {
                const errorData = JSON.parse(match[1]);
                if (errorData.error) {
                  errorMessage = errorData.error;
                }
              } catch (e) {
                // Keep original error message if parsing fails
              }
            }
          }
          
          // Update progress to error
          setSyncProgress(prev => prev.map(p => 
            p.gameId === gameId && p.setId === setId 
              ? { ...p, status: 'error', message: errorMessage }
              : p
          ));
          
          addLog(`❌ ${setName} failed: ${errorMessage}`);
        }
        
        // Small delay between requests
        if (i < setsToSync.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return { results, totalSets: setsToSync.length, cancelled };
    },
    onSuccess: (data: { results: any[]; totalSets: number; cancelled?: boolean }) => {
      const successCount = syncProgress.filter(p => p.status === 'done').length;
      const errorCount = syncProgress.filter(p => p.status === 'error').length;

      if (data?.cancelled) {
        addLog(`🛑 Sync cancelled by user. ${successCount} completed, ${errorCount} marked as cancelled/errors.`);
        toast.warning('Sync cancelled', { 
          description: `${successCount} sets completed before stop${errorCount > 0 ? `, ${errorCount} cancelled/failed` : ''}`
        });
      } else {
        addLog(`🎉 Sync completed: ${successCount} successful, ${errorCount} failed`);
        toast.success('Sync completed', { 
          description: `${successCount} sets synced successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        });
      }
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

  // Handle set selection with deduplication
  const handleSetSelection = (setId: string, checked: boolean) => {
    if (checked) {
      setSelectedSets(prev => {
        // Deduplicate to prevent accidental duplicate invocations
        if (prev.includes(setId)) {
          return prev;
        }
        return [...prev, setId];
      });
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
    // Deduplicate using Set to prevent duplicate invocations
    setSelectedSets(prev => [...new Set([...prev, ...gameSetIds])]);
  };

  const handleClearAllSetsForGame = (gameId: string) => {
    const gameSets = groupedSets[gameId] || [];
    const gameSetIds = gameSets.map(set => set.id);
    setSelectedSets(prev => prev.filter(id => !gameSetIds.includes(id)));
  };

  // Handle "Select All Shown" / "Clear All Shown" for filtered sets
  const handleSelectAllShownSets = () => {
    const filteredGameSets = setsGameFilter === 'all' ? groupedSets : 
      setsGameFilter in groupedSets ? { [setsGameFilter]: groupedSets[setsGameFilter] } : {};
    
    const allShownSetIds = Object.values(filteredGameSets).flat().map(set => set.id);
    // Deduplicate using Set to prevent duplicate invocations
    setSelectedSets(prev => [...new Set([...prev, ...allShownSetIds])]);
  };

  const handleClearAllShownSets = () => {
    const filteredGameSets = setsGameFilter === 'all' ? groupedSets : 
      setsGameFilter in groupedSets ? { [setsGameFilter]: groupedSets[setsGameFilter] } : {};
    
    const allShownSetIds = Object.values(filteredGameSets).flat().map(set => set.id);
    setSelectedSets(prev => prev.filter(id => !allShownSetIds.includes(id)));
  };

  // Sync button handlers
  const handleSyncSelectedSets = () => {
    // Deduplicate selected sets before proceeding
    const uniqueSelectedSets = [...new Set(selectedSets)];
    
    if (uniqueSelectedSets.length === 0) {
      toast.warning('No sets selected', { description: 'Please select at least one set to sync' });
      return;
    }
    
    // Check if all selected sets are from supported games
    const unsupportedSets = uniqueSelectedSets.filter(setId => {
      const gameId = Object.keys(groupedSets).find(gId => 
        groupedSets[gId].some(set => set.id === setId)
      );
      return gameId && !isSupportedGame(gameId);
    });
    
    if (unsupportedSets.length > 0) {
      toast.error('Unsupported games selected', { 
        description: `${unsupportedSets.length} sets are from unsupported games. Only MTG, Pokémon, and Pokémon Japan are supported.` 
      });
      return;
    }
    
    // Additional UX warning for pokemon-japan with potentially English sets
    const pokemonJapanSets = uniqueSelectedSets.filter(setId => {
      const gameId = Object.keys(groupedSets).find(gId => 
        groupedSets[gId].some(set => set.id === setId)
      );
      if (gameId === 'pokemon-japan') {
        const set = groupedSets[gameId].find(s => s.id === setId);
        return set && !set.name.match(/japanese|japan|日本/i);
      }
      return false;
    });
    
    if (pokemonJapanSets.length > 0) {
      toast.warning('Possible English-only sets', {
        description: `${pokemonJapanSets.length} selected sets for pokemon-japan might be English-only`
      });
    }
    
    syncSetsMutation.mutate({ mode: 'selected', setIds: uniqueSelectedSets });
  };

  const handleSyncAllSetsForSelectedGames = () => {
    if (selectedGames.length === 0) {
      toast.warning('No games selected', { description: 'Please select at least one game' });
      return;
    }
    
    // Check if all selected games are supported
    const unsupportedGames = selectedGames.filter(gameId => !isSupportedGame(gameId));
    if (unsupportedGames.length > 0) {
      const unsupportedNames = unsupportedGames.map(gId => {
        const game = games.find(g => g.id === gId);
        return game?.name || gId;
      }).join(', ');
      
      toast.error('Unsupported games selected', { 
        description: `Selected games not supported: ${unsupportedNames}. Only MTG, Pokémon, and Pokémon Japan are supported.` 
      });
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

  const handleHardStop = () => {
    if (!isRunning) return;
    cancelRequestedRef.current = true;
    addLog('🛑 Hard stop requested by user');
    toast.warning('Stopping sync...', { description: 'Current set will finish, then syncing will halt.' });
  };

  const handleKillAllJobs = async () => {
    setIsKillingJobs(true);
    addLog('🚨 Attempting to kill all running sync jobs...');
    
    try {
      // First, get all running jobs from all games
      const games = ['mtg', 'pokemon', 'pokemon-japan'];
      let totalKilled = 0;
      
      for (const game of games) {
        try {
          // Get status for this game using proper query parameters
          const { data: jobs, error: statusError } = await getCatalogSyncStatus(game, 100);
          
          if (statusError) {
            const errorMessage = parseFunctionError(statusError);
            addLog(`⚠️ Failed to get job status for ${game}: ${errorMessage}`);
            continue;
          }
          
          // Cancel all queued/running jobs
          const activeJobs = (jobs || []).filter((job: any) => 
            job.status === 'queued' || job.status === 'running'
          );
          
          for (const job of activeJobs) {
            try {
              const { error: cancelError } = await supabase.functions.invoke('catalog-sync-cancel', {
                body: { job_id: job.id }
              });
              
              if (cancelError) {
                addLog(`❌ Failed to cancel job ${job.id}: ${cancelError.message}`);
              } else {
                addLog(`✅ Cancelled job ${job.id} (${job.game}/${job.set_name || job.set_id})`);
                totalKilled++;
              }
            } catch (e: any) {
              addLog(`❌ Error cancelling job ${job.id}: ${e.message}`);
            }
          }
        } catch (e: any) {
          addLog(`❌ Error processing ${game} jobs: ${e.message}`);
        }
      }
      
      if (totalKilled > 0) {
        addLog(`🎯 Successfully killed ${totalKilled} running jobs`);
        toast.success('Jobs cancelled', { description: `${totalKilled} running jobs were cancelled` });
      } else {
        addLog('ℹ️ No running jobs found to cancel');
        toast.info('No active jobs', { description: 'No running sync jobs were found' });
      }
      
    } catch (error: any) {
      addLog(`💥 Failed to kill jobs: ${error.message}`);
      toast.error('Failed to kill jobs', { description: error.message });
    } finally {
      setIsKillingJobs(false);
    }
  };

  // Filter games by search query
  const filteredGames = games.filter(game => 
    game.name?.toLowerCase().includes(gameSearchQuery.toLowerCase()) ||
    game.id?.toLowerCase().includes(gameSearchQuery.toLowerCase())
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

            {/* Show diagnostics when no games are returned */}
            {!gamesLoading && games.length === 0 && gamesMetadata && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div>No games returned from JustTCG API.</div>
                    {gamesMetadata.topLevelKeys && (
                      <div className="text-xs">
                        <strong>API Response Keys:</strong> {gamesMetadata.topLevelKeys.join(', ')}
                      </div>
                    )}
                    {gamesMetadata.sample && (
                      <div className="text-xs">
                        <strong>Sample Response:</strong> <code className="bg-muted px-1 rounded">{gamesMetadata.sample.slice(0, 100)}...</code>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

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
                                {Number(set.cards_count) > 0 && (
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
            {/* Cooldown Settings */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Cooldown Settings
              </h4>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="skip-recent"
                    checked={skipRecentlysynced}
                    onCheckedChange={(checked) => setSkipRecentlysynced(checked === true)}
                  />
                  <label htmlFor="skip-recent" className="text-sm font-medium">
                    Skip recently synced sets
                  </label>
                </div>
                
                {skipRecentlysynced && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Cooldown:</span>
                    <Select value={cooldownHours.toString()} onValueChange={(v) => setCooldownHours(parseInt(v))}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1h</SelectItem>
                        <SelectItem value="6">6h</SelectItem>
                        <SelectItem value="12">12h</SelectItem>
                        <SelectItem value="24">24h</SelectItem>
                        <SelectItem value="72">3d</SelectItem>
                        <SelectItem value="168">1w</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="force-sync"
                    checked={forceSync}
                    onCheckedChange={(checked) => setForceSync(checked === true)}
                  />
                  <label htmlFor="force-sync" className="text-sm font-medium">
                    Force resync (ignore cooldown)
                  </label>
                </div>
              </div>
            </div>

            {/* Async Queue Settings */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Processing Mode
              </h4>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-async-queue"
                    checked={useAsyncQueue}
                    onCheckedChange={(checked) => setUseAsyncQueue(checked === true)}
                  />
                  <label htmlFor="use-async-queue" className="text-sm font-medium">
                    Use async queue (recommended)
                  </label>
                </div>
                
                {useAsyncQueue && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="auto-process-queue"
                        checked={autoProcessQueue}
                        onCheckedChange={(checked) => setAutoProcessQueue(checked === true)}
                      />
                      <label htmlFor="auto-process-queue" className="text-sm font-medium">
                        Auto-drain queue
                      </label>
                    </div>
                    
                    <Button
                      onClick={() => handleProcessQueue()}
                      disabled={isProcessingQueue}
                      variant="outline"
                      size="sm"
                    >
                      {isProcessingQueue ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                      Process Queue
                    </Button>
                  </>
                )}
              </div>
              
              {!useAsyncQueue && (
                <div className="mt-2 text-xs text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-2">
                  ⚠️ Inline mode: Sets sync immediately but may timeout on large sets. Use async queue for reliable processing.
                </div>
              )}
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