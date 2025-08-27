import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Activity,
  RefreshCw,
  Zap,
  TrendingUp,
  Clock,
  BarChart3,
  Eye,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SyncResult {
  setsProcessed?: number;
  cardsProcessed: number;
  variantsProcessed: number;
  skipped?: number;
  errors?: number;
  message?: string;
}

interface RefreshResult {
  mode?: string;
  idsRequested?: number;
  game?: string;
  set?: string;
  cardsProcessed: number;
  variantsProcessed: number;
  orderBy?: string;
  cardSortBy?: string;
  variantSortBy?: string;
  _metadata?: any;
  message: string;
}

interface ApiMetadata {
  apiRequestsUsed: number;
  apiRequestsRemaining: number;
  apiRateLimit: number;
  resetTime?: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service?: string;
  [key: string]: any;
}

interface AnalyticsSnapshot {
  id: number;
  captured_at: string;
  game: string;
  card_id: string;
  card_name: string;
  cheapest_price: number;
  change_24h: number;
  change_7d: number;
  change_30d: number;
}

const FUNCTIONS_BASE = '/functions/v1';

export default function JustTCGAdmin() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult | RefreshResult>>({});
  
  // Refresh/Analytics state
  const [refreshMode, setRefreshMode] = useState<'list' | 'id'>('list');
  const [refreshIds, setRefreshIds] = useState<string>('');
  const [listGame, setListGame] = useState<string>('');
  const [listSet, setListSet] = useState<string>('');
  const [orderBy, setOrderBy] = useState<string>('');
  const [order, setOrder] = useState<string>('asc');
  const [cardSortBy, setCardSortBy] = useState<string>('');
  const [cardSortOrder, setCardSortOrder] = useState<string>('asc');
  const [variantSortBy, setVariantSortBy] = useState<string>('');
  const [variantSortOrder, setVariantSortOrder] = useState<string>('asc');
  
  // Analytics state
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [snapshotGame, setSnapshotGame] = useState<string>('');
  const [snapshotMetric, setSnapshotMetric] = useState<string>('change_24h');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata | null>(null);

  // Load snapshots on component mount
  useEffect(() => {
    loadSnapshots();
  }, [snapshotGame, snapshotMetric, startDate, endDate]);

  // Load API metadata and recent logs
  useEffect(() => {
    loadApiMetadata();
    loadRecentLogs();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadApiMetadata();
      loadRecentLogs();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadApiMetadata = async () => {
    try {
      // This would typically come from a system settings table or edge function
      // For now, we'll simulate it
      setApiMetadata({
        apiRequestsUsed: 1250,
        apiRequestsRemaining: 28750,
        apiRateLimit: 30000,
        resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    } catch (error) {
      console.error('Failed to load API metadata:', error);
    }
  };

  const loadRecentLogs = async () => {
    try {
      // Query recent logs from edge function logs or system logs table
      // This is a simplified version - in production you'd query actual logs
      const recentLogs: LogEntry[] = [
        {
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: 'System ready',
          service: 'catalog-sync-justtcg'
        }
      ];
      setLogs(recentLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const setLoadingState = (key: string, isLoading: boolean) => {
    setLoading(prev => ({ ...prev, [key]: isLoading }));
  };

  const handleSyncGame = async (game: string, gameName: string) => {
    const key = `sync-${game}`;
    setLoadingState(key, true);
    
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/catalog-sync-justtcg?game=${encodeURIComponent(game)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: SyncResult = await response.json();
      setResults(prev => ({ ...prev, [key]: result }));

      toast.success(`${gameName} sync completed`, {
        description: `Processed ${result.cardsProcessed} cards, ${result.variantsProcessed} variants${result.skipped ? `, skipped ${result.skipped} unchanged` : ''}`
      });

      // Refresh metadata after sync
      await loadApiMetadata();
      await loadRecentLogs();

    } catch (error: any) {
      toast.error(`${gameName} sync failed`, {
        description: error.message
      });
      console.error(`Sync error for ${game}:`, error);
    } finally {
      setLoadingState(key, false);
    }
  };

  const handleRefresh = async () => {
    const key = 'refresh';
    setLoadingState(key, true);

    try {
      let requestBody: any = {};
      
      if (refreshMode === 'id') {
        // ID Mode
        const ids = refreshIds
          .split(/[\n,\s]+/)
          .map(id => id.trim())
          .filter(id => id.length > 0);

        if (ids.length === 0) {
          throw new Error('Please provide at least one card ID');
        }

        if (ids.length > 1000) {
          throw new Error('Maximum 1000 IDs allowed per request');
        }

        requestBody.ids = ids;
        if (orderBy && orderBy !== 'default') requestBody.orderBy = orderBy;
        if (cardSortBy && cardSortBy !== 'none') requestBody.cardSortBy = cardSortBy;
        if (cardSortOrder) requestBody.cardSortOrder = cardSortOrder;
        if (variantSortBy && variantSortBy !== 'none') requestBody.variantSortBy = variantSortBy;
        if (variantSortOrder) requestBody.variantSortOrder = variantSortOrder;
      } else {
        // List Mode
        if (!listGame) {
          throw new Error('Please select a game');
        }

        requestBody.game = listGame;
        if (listSet) requestBody.set = listSet;
        if (orderBy && orderBy !== 'default') requestBody.orderBy = orderBy;
        if (order) requestBody.order = order;
      }

      const response = await fetch(`${FUNCTIONS_BASE}/catalog-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: RefreshResult = await response.json();
      setResults(prev => ({ ...prev, [key]: result }));

      toast.success(`${result.mode} refresh completed`, {
        description: `Processed ${result.cardsProcessed} cards, ${result.variantsProcessed} variants`
      });

      // Clear inputs
      if (refreshMode === 'id') {
        setRefreshIds('');
      }

      // Refresh metadata
      await loadApiMetadata();
      await loadRecentLogs();

    } catch (error: any) {
      toast.error('Refresh failed', {
        description: error.message
      });
      console.error('Refresh error:', error);
    } finally {
      setLoadingState(key, false);
    }
  };

  const loadSnapshots = async () => {
    try {
      let query = supabase
        .from('justtcg_analytics_snapshots')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(100);

      if (snapshotGame && snapshotGame !== 'all') {
        query = query.eq('game', snapshotGame);
      }

      if (startDate) {
        query = query.gte('captured_at', startDate);
      }

      if (endDate) {
        query = query.lte('captured_at', endDate + 'T23:59:59');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by metric and sort
      const filtered = (data || [])
        .filter(row => row[snapshotMetric] !== null)
        .sort((a, b) => Math.abs(b[snapshotMetric]) - Math.abs(a[snapshotMetric]));

      setSnapshots(filtered);
    } catch (error: any) {
      console.error('Failed to load snapshots:', error);
    }
  };

  const runSnapshot = async () => {
    const key = 'snapshot';
    setLoadingState(key, true);

    try {
      const response = await fetch(`${FUNCTIONS_BASE}/catalog-snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      toast.success('Analytics snapshot completed', {
        description: `Saved ${result.totalSnapshots} snapshots for ${result.games?.length} games`
      });

      // Refresh snapshots
      await loadSnapshots();

    } catch (error: any) {
      toast.error('Snapshot failed', {
        description: error.message
      });
      console.error('Snapshot error:', error);
    } finally {
      setLoadingState(key, false);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const getUsagePercentage = () => {
    if (!apiMetadata) return 0;
    return (apiMetadata.apiRequestsUsed / apiMetadata.apiRateLimit) * 100;
  };

  const getUsageColor = () => {
    const percentage = getUsagePercentage();
    if (percentage > 90) return 'text-red-500';
    if (percentage > 75) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">JustTCG Admin</h1>
          <p className="text-muted-foreground">
            Enhanced catalog sync with 500 RPM rate limiting and bulk operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <Badge variant="secondary">Enhanced Performance</Badge>
        </div>
      </div>

      {/* API Usage Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            API Usage & Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {apiMetadata ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-2xl font-bold ${getUsageColor()}`}>
                  {formatNumber(apiMetadata.apiRequestsUsed)}
                </div>
                <div className="text-xs text-muted-foreground">Requests Used</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-green-500">
                  {formatNumber(apiMetadata.apiRequestsRemaining)}
                </div>
                <div className="text-xs text-muted-foreground">Remaining</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-blue-500">
                  {formatNumber(apiMetadata.apiRateLimit)}
                </div>
                <div className="text-xs text-muted-foreground">Daily Limit</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-2xl font-bold ${getUsageColor()}`}>
                  {getUsagePercentage().toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Usage</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading API status...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Game Sync Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-red-500" />
              Magic: The Gathering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => handleSyncGame('magic-the-gathering', 'Magic: The Gathering')}
              disabled={loading['sync-magic-the-gathering']}
              className="w-full"
            >
              {loading['sync-magic-the-gathering'] ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing MTG...
                </>
              ) : (
                'Sync MTG'
              )}
            </Button>
            
            {results['sync-magic-the-gathering'] && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Cards:</span>
                  <span className="font-medium">
                    {formatNumber((results['sync-magic-the-gathering'] as SyncResult).cardsProcessed)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Variants:</span>
                  <span className="font-medium">
                    {formatNumber((results['sync-magic-the-gathering'] as SyncResult).variantsProcessed)}
                  </span>
                </div>
                {(results['sync-magic-the-gathering'] as SyncResult).skipped && (
                  <div className="flex justify-between">
                    <span>Skipped:</span>
                    <span className="font-medium text-muted-foreground">
                      {formatNumber((results['sync-magic-the-gathering'] as SyncResult).skipped!)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              Pokémon (Global)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => handleSyncGame('pokemon', 'Pokémon (Global)')}
              disabled={loading['sync-pokemon']}
              className="w-full"
            >
              {loading['sync-pokemon'] ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing Pokémon...
                </>
              ) : (
                'Sync Pokémon (EN)'
              )}
            </Button>
            
            {results['sync-pokemon'] && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Cards:</span>
                  <span className="font-medium">
                    {formatNumber((results['sync-pokemon'] as SyncResult).cardsProcessed)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Variants:</span>
                  <span className="font-medium">
                    {formatNumber((results['sync-pokemon'] as SyncResult).variantsProcessed)}
                  </span>
                </div>
                {(results['sync-pokemon'] as SyncResult).skipped && (
                  <div className="flex justify-between">
                    <span>Skipped:</span>
                    <span className="font-medium text-muted-foreground">
                      {formatNumber((results['sync-pokemon'] as SyncResult).skipped!)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Pokémon Japan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => handleSyncGame('pokemon-japan', 'Pokémon Japan')}
              disabled={loading['sync-pokemon-japan']}
              className="w-full"
            >
              {loading['sync-pokemon-japan'] ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing Pokémon JP...
                </>
              ) : (
                'Sync Pokémon (JP)'
              )}
            </Button>
            
            {results['sync-pokemon-japan'] && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Cards:</span>
                  <span className="font-medium">
                    {formatNumber((results['sync-pokemon-japan'] as SyncResult).cardsProcessed)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Variants:</span>
                  <span className="font-medium">
                    {formatNumber((results['sync-pokemon-japan'] as SyncResult).variantsProcessed)}
                  </span>
                </div>
                {(results['sync-pokemon-japan'] as SyncResult).skipped && (
                  <div className="flex justify-between">
                    <span>Skipped:</span>
                    <span className="font-medium text-muted-foreground">
                      {formatNumber((results['sync-pokemon-japan'] as SyncResult).skipped!)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Refresh/Analytics Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Refresh & Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={refreshMode} onValueChange={(value) => setRefreshMode(value as 'list' | 'id')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">List Mode</TabsTrigger>
              <TabsTrigger value="id">ID Mode</TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="list-game">Game</Label>
                  <Select value={listGame} onValueChange={setListGame} disabled={loading['refresh']}>
                    <SelectTrigger id="list-game">
                      <SelectValue placeholder="Select game" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                      <SelectItem value="pokemon">Pokémon (Global)</SelectItem>
                      <SelectItem value="pokemon-japan">Pokémon Japan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="list-set">Set (optional)</Label>
                  <Input
                    id="list-set"
                    placeholder="Enter set name"
                    value={listSet}
                    onChange={(e) => setListSet(e.target.value)}
                    disabled={loading['refresh']}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="list-order-by">Order By</Label>
                  <Select value={orderBy} onValueChange={setOrderBy} disabled={loading['refresh']}>
                    <SelectTrigger id="list-order-by">
                      <SelectValue placeholder="Default order" />
                    </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="default">Default</SelectItem>
                       <SelectItem value="price">Current Price</SelectItem>
                       <SelectItem value="24h">24h Change</SelectItem>
                       <SelectItem value="7d">7d Change</SelectItem>
                       <SelectItem value="30d">30d Change</SelectItem>
                     </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="list-order">Order</Label>
                  <Select value={order} onValueChange={setOrder} disabled={loading['refresh']}>
                    <SelectTrigger id="list-order">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="id" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="refresh-ids">Card IDs (one per line or comma-separated)</Label>
                    <Textarea
                      id="refresh-ids"
                      placeholder="Enter card IDs to refresh..."
                      value={refreshIds}
                      onChange={(e) => setRefreshIds(e.target.value)}
                      className="min-h-[100px]"
                      disabled={loading['refresh']}
                    />
                    <div className="text-xs text-muted-foreground">
                      Maximum 1000 IDs per request
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="id-order-by">Order By</Label>
                    <Select value={orderBy} onValueChange={setOrderBy} disabled={loading['refresh']}>
                      <SelectTrigger id="id-order-by">
                        <SelectValue placeholder="Default order" />
                      </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="default">Default</SelectItem>
                         <SelectItem value="price">Current Price</SelectItem>
                         <SelectItem value="24h">24h Change</SelectItem>
                         <SelectItem value="7d">7d Change</SelectItem>
                         <SelectItem value="30d">30d Change</SelectItem>
                       </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Card Sorting</Label>
                    <div className="flex gap-2">
                      <Select value={cardSortBy} onValueChange={setCardSortBy} disabled={loading['refresh']}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="none">None</SelectItem>
                           <SelectItem value="price">Price</SelectItem>
                           <SelectItem value="24h">24h Change</SelectItem>
                           <SelectItem value="7d">7d Change</SelectItem>
                           <SelectItem value="30d">30d Change</SelectItem>
                         </SelectContent>
                      </Select>
                      <Select value={cardSortOrder} onValueChange={setCardSortOrder} disabled={loading['refresh']}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Asc</SelectItem>
                          <SelectItem value="desc">Desc</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Variant Sorting</Label>
                    <div className="flex gap-2">
                      <Select value={variantSortBy} onValueChange={setVariantSortBy} disabled={loading['refresh']}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="none">None</SelectItem>
                           <SelectItem value="price">Price</SelectItem>
                           <SelectItem value="24h">24h Change</SelectItem>
                           <SelectItem value="7d">7d Change</SelectItem>
                           <SelectItem value="30d">30d Change</SelectItem>
                         </SelectContent>
                      </Select>
                      <Select value={variantSortOrder} onValueChange={setVariantSortOrder} disabled={loading['refresh']}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Asc</SelectItem>
                          <SelectItem value="desc">Desc</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleRefresh}
                disabled={loading['refresh'] || (refreshMode === 'list' && !listGame) || (refreshMode === 'id' && !refreshIds.trim())}
                className="flex-1"
              >
                {loading['refresh'] ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh ({refreshMode === 'list' ? 'List Mode' : 'ID Mode'})
                  </>
                )}
              </Button>
            </div>
            
            {results['refresh'] && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {(results['refresh'] as RefreshResult).mode}: Processed {formatNumber((results['refresh'] as RefreshResult).cardsProcessed)} cards 
                  and {formatNumber((results['refresh'] as RefreshResult).variantsProcessed)} variants
                  {(results['refresh'] as RefreshResult)._metadata?.apiRequestsUsed && 
                    ` (Used ${(results['refresh'] as RefreshResult)._metadata.apiRequestsUsed} API requests)`}
                </AlertDescription>
              </Alert>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Analytics Snapshots */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Analytics Snapshots
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="snapshot-game">Game</Label>
              <Select value={snapshotGame} onValueChange={setSnapshotGame}>
                <SelectTrigger id="snapshot-game">
                  <SelectValue placeholder="All games" />
                </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All games</SelectItem>
                   <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                   <SelectItem value="pokemon">Pokémon (Global)</SelectItem>
                   <SelectItem value="pokemon-japan">Pokémon Japan</SelectItem>
                 </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="snapshot-metric">Metric</Label>
              <Select value={snapshotMetric} onValueChange={setSnapshotMetric}>
                <SelectTrigger id="snapshot-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheapest_price">Cheapest Price</SelectItem>
                  <SelectItem value="change_24h">24h Change</SelectItem>
                  <SelectItem value="change_7d">7d Change</SelectItem>
                  <SelectItem value="change_30d">30d Change</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={loadSnapshots} className="flex-1">
              <Eye className="h-4 w-4 mr-2" />
              Load Snapshots
            </Button>
            <Button onClick={runSnapshot} disabled={loading['snapshot']}>
              {loading['snapshot'] ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Run Snapshot
                </>
              )}
            </Button>
          </div>
          
          {snapshots.length > 0 && (
            <div className="border rounded-lg">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Card</th>
                      <th className="text-left p-2">Game</th>
                      <th className="text-right p-2">Value</th>
                      <th className="text-right p-2">Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.slice(0, 20).map((snapshot) => (
                      <tr key={snapshot.id} className="border-t">
                        <td className="p-2 truncate max-w-32" title={snapshot.card_name}>
                          {snapshot.card_name || snapshot.card_id}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">
                            {snapshot.game.replace('-', ' ')}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {snapshotMetric.includes('price') 
                            ? `$${snapshot[snapshotMetric]?.toFixed(2) || '0.00'}`
                            : `${snapshot[snapshotMetric]?.toFixed(1) || '0.0'}%`
                          }
                        </td>
                        <td className="p-2 text-right text-xs text-muted-foreground">
                          {new Date(snapshot.captured_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {snapshots.length > 20 && (
                <div className="p-2 text-xs text-center text-muted-foreground border-t">
                  Showing 20 of {snapshots.length} snapshots
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-3 text-sm border-b border-muted/20 pb-2">
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <Badge 
                    variant={log.level === 'ERROR' ? 'destructive' : log.level === 'WARN' ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {log.level}
                  </Badge>
                  <div className="flex-1">{log.message}</div>
                  {log.service && (
                    <div className="text-xs text-muted-foreground">{log.service}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              No recent activity
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-2 bg-muted/30 rounded">
              <div className="font-bold">500</div>
              <div className="text-muted-foreground">RPM Limit</div>
            </div>
            <div className="text-center p-2 bg-muted/30 rounded">
              <div className="font-bold">200</div>
              <div className="text-muted-foreground">Page Size</div>
            </div>
            <div className="text-center p-2 bg-muted/30 rounded">
              <div className="font-bold">24</div>
              <div className="text-muted-foreground">Max Concurrent</div>
            </div>
            <div className="text-center p-2 bg-muted/30 rounded">
              <div className="font-bold">3:15 AM</div>
              <div className="text-muted-foreground">Nightly Cron</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}