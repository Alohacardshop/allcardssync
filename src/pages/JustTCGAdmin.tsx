import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Database, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Activity,
  RefreshCw,
  Zap,
  TrendingUp,
  Clock
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
  idsRequested: number;
  cardsProcessed: number;
  variantsProcessed: number;
  orderBy?: string;
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

const FUNCTIONS_BASE = '/functions/v1';

export default function JustTCGAdmin() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult | RefreshResult>>({});
  const [refreshIds, setRefreshIds] = useState<string>('');
  const [orderBy, setOrderBy] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiMetadata, setApiMetadata] = useState<ApiMetadata | null>(null);

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

  const handleRefreshByIds = async () => {
    const key = 'refresh-ids';
    setLoadingState(key, true);

    try {
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

      const requestBody: any = { ids };
      if (orderBy) {
        requestBody.orderBy = orderBy;
      }

      const response = await fetch(`${FUNCTIONS_BASE}/catalog-refresh-by-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: RefreshResult = await response.json();
      setResults(prev => ({ ...prev, [key]: result }));

      toast.success('ID refresh completed', {
        description: `Refreshed ${result.cardsProcessed} cards, ${result.variantsProcessed} variants`
      });

      // Clear the input
      setRefreshIds('');
      setOrderBy('');

      // Refresh metadata
      await loadApiMetadata();
      await loadRecentLogs();

    } catch (error: any) {
      toast.error('ID refresh failed', {
        description: error.message
      });
      console.error('Refresh error:', error);
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

      {/* ID Refresh Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Refresh by IDs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="refresh-ids">Card IDs (one per line or comma-separated)</Label>
              <Textarea
                id="refresh-ids"
                placeholder="Enter card IDs to refresh..."
                value={refreshIds}
                onChange={(e) => setRefreshIds(e.target.value)}
                className="min-h-[100px]"
                disabled={loading['refresh-ids']}
              />
              <div className="text-xs text-muted-foreground">
                Maximum 1000 IDs per request
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="order-by">Order By (optional)</Label>
                <Select value={orderBy} onValueChange={setOrderBy} disabled={loading['refresh-ids']}>
                  <SelectTrigger id="order-by">
                    <SelectValue placeholder="Default order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default</SelectItem>
                    <SelectItem value="price">Current Price</SelectItem>
                    <SelectItem value="24h">24h Price Change</SelectItem>
                    <SelectItem value="7d">7d Price Change</SelectItem>
                    <SelectItem value="30d">30d Price Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button
                onClick={handleRefreshByIds}
                disabled={loading['refresh-ids'] || !refreshIds.trim()}
                className="w-full"
              >
                {loading['refresh-ids'] ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh by IDs
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {results['refresh-ids'] && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Refreshed {formatNumber((results['refresh-ids'] as RefreshResult).cardsProcessed)} cards 
                and {formatNumber((results['refresh-ids'] as RefreshResult).variantsProcessed)} variants
                {(results['refresh-ids'] as RefreshResult).orderBy && 
                  ` (ordered by ${(results['refresh-ids'] as RefreshResult).orderBy})`}
              </AlertDescription>
            </Alert>
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
              <div className="font-bold">100</div>
              <div className="text-muted-foreground">Batch Size</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}