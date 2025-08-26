import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Database, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  RefreshCw,
  Activity,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const FUNCTIONS_BASE = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1`;

interface GameOption {
  value: string;
  label: string;
  gameParam: string;
  filterJapanese?: boolean;
}

const GAME_OPTIONS: GameOption[] = [
  {
    value: 'mtg',
    label: 'Magic: The Gathering (MTG)',
    gameParam: 'mtg'
  },
  {
    value: 'pokemon_japan',
    label: 'Pokémon (pokemon) — Japanese only',
    gameParam: 'pokemon',
    filterJapanese: true
  }
];

interface CatalogStats {
  sets_count: number;
  cards_count: number;
  pending_sets: number;
}

interface SyncError {
  set_id: string;
  step: string;
  message: string;
  created_at: string;
}

export default function GameScopedCatalogSync() {
  const { toast } = useToast();
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [setId, setSetId] = useState('');
  const [since, setSince] = useState('');
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [isActiveSync, setIsActiveSync] = useState(false);

  const selectedGameOption = GAME_OPTIONS.find(g => g.value === selectedGame);

  useEffect(() => {
    if (selectedGame) {
      loadStats();
      loadRecentErrors();
    }
  }, [selectedGame]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActiveSync && selectedGame) {
      // Auto-refresh stats during active sync
      interval = setInterval(loadStats, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActiveSync, selectedGame]);

  const loadStats = async () => {
    if (!selectedGameOption) return;

    try {
      const { data, error } = await supabase.rpc('catalog_v2_stats', { 
        game_in: selectedGameOption.gameParam 
      });
      
      if (error) throw error;
      
      const row = Array.isArray(data) ? data[0] : data;
      const newStats = {
        sets_count: Number(row?.sets_count ?? 0),
        cards_count: Number(row?.cards_count ?? 0),
        pending_sets: Number(row?.pending_sets ?? 0),
      };
      
      setStats(newStats);
      setIsActiveSync(newStats.pending_sets > 0);
      
    } catch (error: any) {
      console.error('Error loading catalog stats:', error);
      toast({
        title: "Error",
        description: `Failed to load stats: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const loadRecentErrors = async () => {
    if (!selectedGameOption) return;

    try {
      const { data, error } = await supabase.rpc('catalog_v2_get_recent_sync_errors', {
        game_in: selectedGameOption.gameParam,
        limit_in: 5
      });
      
      if (error) throw error;
      setErrors(data || []);
      
    } catch (error: any) {
      console.error('Error loading sync errors:', error);
    }
  };

  const callSync = async (params: { setId?: string; since?: string } = {}) => {
    if (!selectedGameOption) {
      toast({
        title: "Error",
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const url = new URL(`${FUNCTIONS_BASE}/catalog-sync`);
      url.searchParams.set('game', selectedGameOption.gameParam);
      
      if (selectedGameOption.filterJapanese) {
        url.searchParams.set('filterJapanese', 'true');
      }
      
      if (params.setId) url.searchParams.set('setId', params.setId);
      if (params.since) url.searchParams.set('since', params.since);

      const response = await fetch(url.toString(), { method: 'POST' });
      const data = await response.json();
      
      setResult({ ok: response.ok, ...data, at: new Date().toISOString() });

      if (response.ok) {
        if (data.queued_sets) {
          toast({
            title: "Success",
            description: `Started sync for ${data.queued_sets} sets`,
          });
          setIsActiveSync(true);
        } else if (data.cards !== undefined) {
          toast({
            title: "Success",
            description: `Synced ${data.cards} cards for set ${data.setId}`,
          });
        } else {
          toast({
            title: "Success",
            description: "Sync operation completed",
          });
        }
        await loadStats();
        await loadRecentErrors();
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || 'Unknown error occurred',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Network error';
      setResult({ ok: false, error: errorMsg, at: new Date().toISOString() });
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const queuePendingSets = async () => {
    if (!selectedGameOption) return;

    setQueueing(true);
    try {
      const { data, error } = await supabase.rpc('catalog_v2_queue_pending_sets_generic', {
        game_in: selectedGameOption.gameParam,
        functions_base: FUNCTIONS_BASE,
        function_path: `/catalog-sync?game=${selectedGameOption.gameParam}${selectedGameOption.filterJapanese ? '&filterJapanese=true' : ''}`
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Queued ${data ?? 0} pending sets for processing`,
      });
      
      await loadStats();
      setIsActiveSync(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to queue sets: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setQueueing(false);
    }
  };

  const getIncrementalDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date.toISOString().split('T')[0];
  };

  const retryError = (error: SyncError) => {
    setSetId(error.set_id);
    callSync({ setId: error.set_id });
  };

  const isDisabled = loading || queueing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Game-Scoped Catalog Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Game Selection */}
        <div className="space-y-2">
          <Label htmlFor="game-select">Select Game</Label>
          <Select value={selectedGame} onValueChange={setSelectedGame} disabled={isDisabled}>
            <SelectTrigger id="game-select">
              <SelectValue placeholder="Choose a game to sync..." />
            </SelectTrigger>
            <SelectContent>
              {GAME_OPTIONS.map((game) => (
                <SelectItem key={game.value} value={game.value}>
                  {game.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedGame && stats && (
          <>
            {/* Current Status */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.sets_count}</div>
                <div className="text-xs text-muted-foreground">Sets in Catalog</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.cards_count}</div>
                <div className="text-xs text-muted-foreground">Cards in Catalog</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.pending_sets}</div>
                <div className="text-xs text-muted-foreground">Pending Sets</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {isActiveSync ? (
                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                  ) : stats.cards_count > 0 ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Database className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Badge variant={isActiveSync ? "secondary" : stats.cards_count > 0 ? "default" : "outline"}>
                    {isActiveSync ? "Syncing..." : stats.cards_count > 0 ? "Ready" : "Empty"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Manual Sync Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label htmlFor="set-id">Set ID (optional)</Label>
                <Input
                  id="set-id"
                  placeholder="e.g. sv6pt5 or unfinity"
                  value={setId}
                  onChange={(e) => setSetId(e.target.value)}
                  disabled={isDisabled}
                />
              </div>
              <div>
                <Label htmlFor="since-date">Since Date (YYYY-MM-DD, optional)</Label>
                <Input
                  id="since-date"
                  placeholder="e.g. 2025-01-01"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  disabled={isDisabled}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => callSync({ setId: setId || undefined, since: since || undefined })}
                  disabled={isDisabled}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Syncing...
                    </>
                  ) : (
                    'Sync Now'
                  )}
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={queuePendingSets}
                disabled={isDisabled || stats.pending_sets === 0}
                className="flex items-center gap-2"
              >
                {queueing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                Queue Pending Sets ({stats.pending_sets})
              </Button>

              <Button
                variant="outline"
                onClick={() => callSync({ since: getIncrementalDate() })}
                disabled={isDisabled}
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Incremental (6 months)
              </Button>
            </div>

            {/* Recent Errors */}
            {errors.length > 0 && (
              <div className="space-y-2">
                <Label>Recent Sync Errors</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {errors.map((error, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex items-center justify-between">
                          <div>
                            <strong>Set {error.set_id}:</strong> {error.message}
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(error.created_at).toLocaleString()}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryError(error)}
                            disabled={isDisabled}
                          >
                            Retry
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
                  {result.ok ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  Last Operation Result
                </summary>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            )}

            {/* Help Text */}
            <div className="text-sm text-muted-foreground space-y-1 border-t pt-4">
              <p>
                <strong>Sync Now:</strong> Sync specific set ID or date range. Leave empty for full sync.
              </p>
              <p>
                <strong>Queue Pending:</strong> Process sets that haven't been synced yet.
              </p>
              <p>
                <strong>Incremental:</strong> Sync only sets released in the last 6 months.
              </p>
              {selectedGameOption?.filterJapanese && (
                <p>
                  <strong>Japanese Filter:</strong> Only Japanese language variants will be processed for Pokémon cards.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}