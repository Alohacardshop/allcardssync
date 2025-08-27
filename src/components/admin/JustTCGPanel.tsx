import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  Activity,
  RefreshCw,
  TrendingUp,
  Clock,
  BarChart3,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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

export default function JustTCGPanel() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RefreshResult>>({});
  
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
    <div className="space-y-6">
      {/* API Usage Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            JustTCG API Usage & Status
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

      <Tabs defaultValue="refresh" className="space-y-4">
        <TabsList>
          <TabsTrigger value="refresh">Refresh & Analytics</TabsTrigger>
          <TabsTrigger value="snapshots">Analytics Snapshots</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="refresh" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Enhanced Refresh & Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label>Mode:</Label>
                <Select value={refreshMode} onValueChange={(value: 'list' | 'id') => setRefreshMode(value)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">List Mode</SelectItem>
                    <SelectItem value="id">ID Mode</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {refreshMode === 'list' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Game</Label>
                    <Select value={listGame} onValueChange={setListGame}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select game" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                        <SelectItem value="pokemon">Pokémon</SelectItem>
                        <SelectItem value="pokemon_japan">Pokémon Japan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Set (optional)</Label>
                    <Input
                      value={listSet}
                      onChange={(e) => setListSet(e.target.value)}
                      placeholder="Set name"
                    />
                  </div>
                  <div>
                    <Label>Order By</Label>
                    <Select value={orderBy} onValueChange={setOrderBy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select order" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="set">Set</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {refreshMode === 'id' && (
                <div className="space-y-4">
                  <div>
                    <Label>Card IDs (one per line or comma-separated)</Label>
                    <Textarea
                      value={refreshIds}
                      onChange={(e) => setRefreshIds(e.target.value)}
                      placeholder="Enter card IDs..."
                      className="h-32"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Order By</Label>
                      <Select value={orderBy} onValueChange={setOrderBy}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select order" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="updatedAt">Updated At</SelectItem>
                          <SelectItem value="cheapest">Cheapest Price</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Card Sort By</Label>
                      <Select value={cardSortBy} onValueChange={setCardSortBy}>
                        <SelectTrigger>
                          <SelectValue placeholder="Card sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="cheapest">Cheapest</SelectItem>
                          <SelectItem value="change24h">24h Change</SelectItem>
                          <SelectItem value="change7d">7d Change</SelectItem>
                          <SelectItem value="change30d">30d Change</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Variant Sort By</Label>
                      <Select value={variantSortBy} onValueChange={setVariantSortBy}>
                        <SelectTrigger>
                          <SelectValue placeholder="Variant sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="price">Price</SelectItem>
                          <SelectItem value="change24h">24h Change</SelectItem>
                          <SelectItem value="change7d">7d Change</SelectItem>
                          <SelectItem value="change30d">30d Change</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleRefresh}
                disabled={loading.refresh}
                className="w-full"
              >
                {loading.refresh ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing Refresh...
                  </>
                ) : (
                  'Run Enhanced Refresh'
                )}
              </Button>

              {results.refresh && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Refresh Results:</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Mode: {results.refresh.mode}</div>
                    <div>Cards: {formatNumber(results.refresh.cardsProcessed)}</div>
                    <div>Variants: {formatNumber(results.refresh.variantsProcessed)}</div>
                    {results.refresh.idsRequested && (
                      <div>IDs Requested: {formatNumber(results.refresh.idsRequested)}</div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Analytics Snapshots
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Button 
                  onClick={runSnapshot}
                  disabled={loading.snapshot}
                  className="flex items-center gap-2"
                >
                  {loading.snapshot ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      Run Snapshot
                    </>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Game</Label>
                  <Select value={snapshotGame} onValueChange={setSnapshotGame}>
                    <SelectTrigger>
                      <SelectValue placeholder="All games" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Games</SelectItem>
                      <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                      <SelectItem value="pokemon">Pokémon</SelectItem>
                      <SelectItem value="pokemon_japan">Pokémon Japan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Metric</Label>
                  <Select value={snapshotMetric} onValueChange={setSnapshotMetric}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="change_24h">24h Change</SelectItem>
                      <SelectItem value="change_7d">7d Change</SelectItem>
                      <SelectItem value="change_30d">30d Change</SelectItem>
                      <SelectItem value="cheapest_price">Cheapest Price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {snapshots.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-3">
                    Top {snapshots.length} Cards by {snapshotMetric.replace('_', ' ')}
                  </h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {snapshots.map((snapshot, index) => (
                      <div key={snapshot.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{snapshot.card_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {snapshot.game} • {new Date(snapshot.captured_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">
                            {snapshotMetric === 'cheapest_price' 
                              ? `$${snapshot.cheapest_price?.toFixed(2) || '0.00'}`
                              : `${Number(snapshot[snapshotMetric as keyof AnalyticsSnapshot]) > 0 ? '+' : ''}${Number(snapshot[snapshotMetric as keyof AnalyticsSnapshot])?.toFixed(1) || 0}%`
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${snapshot.cheapest_price?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded">
                      <Badge variant="outline">{log.level}</Badge>
                      <div className="flex-1">
                        <div className="text-sm">{log.message}</div>
                        {log.service && (
                          <div className="text-xs text-muted-foreground">{log.service}</div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent activity
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}