import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  RotateCw,
  Database, 
  TrendingUp, 
  Activity,
  RefreshCcw,
  Timer,
  Settings2,
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  syncGame, 
  syncSets,
  drainQueueUntilEmpty,
  getQueueStats,
  startBackgroundProcessing,
  refreshList, 
  refreshById, 
  runSnapshots,
  getSnapshots,
  getCachedApiMetadata,
  parseIdList,
  formatPrice,
  formatChange,
  getChangeColor
} from '@/lib/justtcg-api';
import type { 
  GameType, 
  OrderByType, 
  SortOrderType, 
  MetricType,
  RefreshListRequest,
  RefreshIdRequest,
  ApiMetadata
} from '@/types/justtcg';

export default function JustTCGPanel() {
  const queryClient = useQueryClient();
  
  // State for sync sets
  const [syncSetsForm, setSyncSetsForm] = useState({
    game: 'pokemon' as GameType,
    setId: '',
    since: ''
  });

  // State for queue processing
  const [queueStats, setQueueStats] = useState<Record<GameType, { queued: number; processing: number; done: number; error: number }>>({
    'magic-the-gathering': { queued: 0, processing: 0, done: 0, error: 0 },
    'pokemon': { queued: 0, processing: 0, done: 0, error: 0 },
    'pokemon-japan': { queued: 0, processing: 0, done: 0, error: 0 }
  });
  
  const [processingState, setProcessingState] = useState<Record<GameType, { isProcessing: boolean; processed: number }>>({
    'magic-the-gathering': { isProcessing: false, processed: 0 },
    'pokemon': { isProcessing: false, processed: 0 },
    'pokemon-japan': { isProcessing: false, processed: 0 }
  });
  
  // State for forms
  const [refreshMode, setRefreshMode] = useState<'list' | 'id'>('list');
  const [listForm, setListForm] = useState<RefreshListRequest>({
    game: '',
    set: '',
    orderBy: 'price',
    order: 'desc',
    limit: 200
  });
  const [idForm, setIdForm] = useState<RefreshIdRequest & { idsText: string }>({
    ids: [],
    idsText: '',
    cardSortBy: 'name',
    cardSortOrder: 'asc',
    variantSortBy: 'price',
    variantSortOrder: 'asc'
  });
  
  // Snapshots filters
  const [snapshotFilters, setSnapshotFilters] = useState({
    game: 'pokemon',
    startDate: '',
    endDate: '',
    metric: 'change_24h' as MetricType
  });

  // API metadata query
  const { data: apiMetadata } = useQuery({
    queryKey: ['api-metadata'],
    queryFn: getCachedApiMetadata,
    refetchInterval: 30000,
    staleTime: 30000
  });

  // Update queue stats periodically
  useEffect(() => {
    const updateQueueStats = async () => {
      const games: GameType[] = ['magic-the-gathering', 'pokemon', 'pokemon-japan'];
      const newStats: Record<GameType, { queued: number; processing: number; done: number; error: number }> = {} as any;
      
      for (const game of games) {
        try {
          newStats[game] = await getQueueStats(game);
        } catch (error) {
          console.warn(`Failed to get queue stats for ${game}:`, error);
          newStats[game] = { queued: 0, processing: 0, done: 0, error: 0 };
        }
      }
      
      setQueueStats(newStats);
    };

    updateQueueStats();
    const interval = setInterval(updateQueueStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Snapshots query
  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', snapshotFilters],
    queryFn: () => getSnapshots(snapshotFilters),
    enabled: !!snapshotFilters.game
  });

  // Mutations
  const syncSetsMutation = useMutation({
    mutationFn: ({ game, options }: { game: GameType; options?: { setId?: string; since?: string } }) => 
      syncSets(game, options),
    onSuccess: (data, { game }) => {
      toast.success(`${getGameDisplayName(game)} sets sync completed`, {
        description: `${data.setsProcessed || 0} sets queued for processing`
      });
      queryClient.invalidateQueries({ queryKey: ['api-metadata'] });
    },
    onError: (error: any, { game }) => {
      toast.error(`${getGameDisplayName(game)} sets sync failed`, {
        description: error.message
      });
    }
  });

  const syncMutation = useMutation({
    mutationFn: syncGame,
    onSuccess: (data, game) => {
      toast.success(`${getGameDisplayName(game)} cards sync completed`, {
        description: `Processed ${data.cardsProcessed} cards, ${data.variantsProcessed} variants`
      });
      queryClient.invalidateQueries({ queryKey: ['api-metadata'] });
    },
    onError: (error: any, game) => {
      toast.error(`${getGameDisplayName(game)} cards sync failed`, {
        description: error.message
      });
    }
  });

  const refreshListMutation = useMutation({
    mutationFn: refreshList,
    onSuccess: (data) => {
      toast.success('List refresh completed', {
        description: `Processed ${data.cardsProcessed} cards, ${data.variantsProcessed} variants`
      });
      queryClient.invalidateQueries({ queryKey: ['api-metadata'] });
    },
    onError: (error: any) => {
      toast.error('List refresh failed', {
        description: error.message
      });
    }
  });

  const refreshIdMutation = useMutation({
    mutationFn: refreshById,
    onSuccess: (data) => {
      toast.success('ID refresh completed', {
        description: `Processed ${data.cardsProcessed} cards, ${data.variantsProcessed} variants`
      });
      setIdForm(prev => ({ ...prev, idsText: '', ids: [] }));
      queryClient.invalidateQueries({ queryKey: ['api-metadata'] });
    },
    onError: (error: any) => {
      toast.error('ID refresh failed', {
        description: error.message
      });
    }
  });

  const snapshotMutation = useMutation({
    mutationFn: runSnapshots,
    onSuccess: (data) => {
      toast.success('Analytics snapshot completed', {
        description: `Saved snapshots for ${data.games?.length || 0} games`
      });
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
    },
    onError: (error: any) => {
      toast.error('Snapshot failed', {
        description: error.message
      });
    }
  });

  // Handlers
  const handleSyncSets = () => {
    const options: { setId?: string; since?: string } = {};
    if (syncSetsForm.setId.trim()) options.setId = syncSetsForm.setId.trim();
    if (syncSetsForm.since.trim()) options.since = syncSetsForm.since.trim();
    
    syncSetsMutation.mutate({ 
      game: syncSetsForm.game, 
      options: Object.keys(options).length > 0 ? options : undefined 
    });
  };

  const handlePullCards = async (game: GameType) => {
    setProcessingState(prev => ({ 
      ...prev, 
      [game]: { isProcessing: true, processed: 0 } 
    }));

    try {
      const result = await drainQueueUntilEmpty(game, (processed, queued) => {
        setProcessingState(prev => ({ 
          ...prev, 
          [game]: { isProcessing: true, processed } 
        }));
      });

      setProcessingState(prev => ({ 
        ...prev, 
        [game]: { isProcessing: false, processed: result.totalProcessed } 
      }));

      if (result.status === 'idle') {
        toast.success(`${getGameDisplayName(game)} queue processing completed`, {
          description: `Processed ${result.totalProcessed} sets`
        });
      } else {
        toast.error(`${getGameDisplayName(game)} queue processing stopped`, {
          description: `Processed ${result.totalProcessed} sets before error`
        });
      }
    } catch (error: any) {
      setProcessingState(prev => ({ 
        ...prev, 
        [game]: { isProcessing: false, processed: 0 } 
      }));
      toast.error(`${getGameDisplayName(game)} queue processing failed`, {
        description: error.message
      });
    }
  };

  const handleBackgroundProcessing = async (game: GameType) => {
    try {
      await startBackgroundProcessing(game, { 
        concurrency: 3, 
        batches: 20, 
        batchSize: 5 
      });
      
      toast.success(`${getGameDisplayName(game)} background processing started`, {
        description: 'Processing will continue in the background'
      });
    } catch (error: any) {
      toast.error(`${getGameDisplayName(game)} background processing failed`, {
        description: error.message
      });
    }
  };

  const handleListRefresh = () => {
    if (!listForm.game) {
      toast.error('Please select a game');
      return;
    }
    refreshListMutation.mutate(listForm);
  };

  const handleIdRefresh = () => {
    const ids = parseIdList(idForm.idsText);
    if (ids.length === 0) {
      toast.error('Please provide at least one card ID');
      return;
    }
    if (ids.length > 100) {
      toast.error('Maximum 100 IDs allowed per request');
      return;
    }
    
    const request: RefreshIdRequest = {
      ids,
      cardSortBy: idForm.cardSortBy,
      cardSortOrder: idForm.cardSortOrder,
      variantSortBy: idForm.variantSortBy,
      variantSortOrder: idForm.variantSortOrder
    };
    
    refreshIdMutation.mutate(request);
  };

  const exportCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getGameDisplayName = (game: GameType): string => {
    switch (game) {
      case 'magic-the-gathering': return 'Magic: The Gathering';
      case 'pokemon': return 'Pokémon (EN)';
      case 'pokemon-japan': return 'Pokémon (JP)';
      default: return game;
    }
  };

  const getUsagePercentage = (): number => {
    if (!apiMetadata) return 0;
    return (apiMetadata.apiRequestsUsed / apiMetadata.apiRateLimit) * 100;
  };

  const getUsageColor = (): string => {
    const percentage = getUsagePercentage();
    if (percentage > 90) return 'text-red-500';
    if (percentage > 75) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">JustTCG Admin</h1>
        <p className="text-muted-foreground mt-2">
          Manage catalog syncing, analytics refresh, and API usage monitoring
        </p>
        {apiMetadata && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Last updated:</span>
            <span>{new Date().toLocaleString()}</span>
            <Badge variant="outline" className={getUsageColor()}>
              {Math.round(getUsagePercentage())}% API usage
            </Badge>
          </div>
        )}
      </div>

      <Tabs defaultValue="sync" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Sync
          </TabsTrigger>
          <TabsTrigger value="refresh" className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4" />
            Refresh & Analytics
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Usage & Logs
          </TabsTrigger>
          <TabsTrigger value="snapshots" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Snapshots
          </TabsTrigger>
        </TabsList>

        {/* Sync Tab */}
        <TabsContent value="sync" className="space-y-6">
          {/* Step 1: Sync Sets */}
          <Card className="rounded-2xl border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-semibold">1</div>
                <Database className="h-5 w-5 text-primary" />
                Sync Sets (Categories)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                First, sync the available sets/categories. This will queue them for card processing.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Game</Label>
                  <Select 
                    value={syncSetsForm.game} 
                    onValueChange={(v: GameType) => setSyncSetsForm(prev => ({ ...prev, game: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                      <SelectItem value="pokemon">Pokémon (EN)</SelectItem>
                      <SelectItem value="pokemon-japan">Pokémon (JP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Set ID (Optional)</Label>
                  <Input
                    placeholder="e.g., sv5"
                    value={syncSetsForm.setId}
                    onChange={(e) => setSyncSetsForm(prev => ({ ...prev, setId: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Since Date (Optional)</Label>
                  <Input
                    type="date"
                    value={syncSetsForm.since}
                    onChange={(e) => setSyncSetsForm(prev => ({ ...prev, since: e.target.value }))}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleSyncSets}
                    disabled={syncSetsMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {syncSetsMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Syncing Sets...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Sync Sets
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {syncSetsMutation.isSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Successfully queued {syncSetsMutation.data.setsProcessed || 0} sets for processing
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Pull Cards from Queue */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-sm flex items-center justify-center font-semibold">2</div>
                <RotateCw className="h-5 w-5 text-secondary" />
                Pull Cards from Sets
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                After syncing sets, process the queued sets to pull card data.
              </p>
            </CardHeader>
            <CardContent>
              {/* Queue Status Overview */}
              <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="text-sm font-medium mb-3">Queue Status</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {(['magic-the-gathering', 'pokemon', 'pokemon-japan'] as GameType[]).map((game) => (
                    <div key={game} className="space-y-1">
                      <div className="text-xs text-muted-foreground">{getGameDisplayName(game)}</div>
                      <div className="flex justify-center gap-2 text-xs">
                        <Badge variant="outline" className="text-blue-600">
                          {queueStats[game].queued} queued
                        </Badge>
                        {queueStats[game].processing > 0 && (
                          <Badge variant="outline" className="text-yellow-600">
                            {queueStats[game].processing} processing
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['magic-the-gathering', 'pokemon', 'pokemon-japan'] as GameType[]).map((game) => (
                  <Card key={game} className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <RotateCw className="h-5 w-5 text-primary" />
                        {getGameDisplayName(game)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Queue Stats */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>Queued:</span>
                          <span className="font-medium">{queueStats[game].queued}</span>
                        </div>
                        {queueStats[game].processing > 0 && (
                          <div className="flex justify-between text-yellow-600">
                            <span>Processing:</span>
                            <span className="font-medium">{queueStats[game].processing}</span>
                          </div>
                        )}
                        {processingState[game].processed > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Processed:</span>
                            <span className="font-medium">{processingState[game].processed}</span>
                          </div>
                        )}
                      </div>

                      {/* Processing Status */}
                      {processingState[game].isProcessing && (
                        <div className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing queue... ({processingState[game].processed} completed)
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Button
                          onClick={() => handlePullCards(game)}
                          disabled={processingState[game].isProcessing || queueStats[game].queued === 0}
                          className="w-full"
                          size="lg"
                        >
                          {processingState[game].isProcessing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing Queue...
                            </>
                          ) : (
                            `Pull Cards from ${getGameDisplayName(game)}`
                          )}
                        </Button>

                        <Button
                          onClick={() => handleBackgroundProcessing(game)}
                          disabled={queueStats[game].queued === 0}
                          variant="outline"
                          className="w-full"
                          size="sm"
                        >
                          <Timer className="h-4 w-4 mr-2" />
                          Finish in Background
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Refresh & Analytics Tab */}
        <TabsContent value="refresh" className="space-y-6">
          <Tabs value={refreshMode} onValueChange={(v) => setRefreshMode(v as 'list' | 'id')}>
            <TabsList>
              <TabsTrigger value="list">List Mode</TabsTrigger>
              <TabsTrigger value="id">ID Mode</TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-4">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>List Refresh</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Refresh cards by game/set with sorting options
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Game</Label>
                      <Select 
                        value={listForm.game} 
                        onValueChange={(v) => setListForm(prev => ({ ...prev, game: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select game" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                          <SelectItem value="pokemon">Pokémon (EN)</SelectItem>
                          <SelectItem value="pokemon-japan">Pokémon (JP)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Set (Optional)</Label>
                      <Input
                        placeholder="Enter set name"
                        value={listForm.set}
                        onChange={(e) => setListForm(prev => ({ ...prev, set: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Order By</Label>
                      <Select 
                        value={listForm.orderBy} 
                        onValueChange={(v: OrderByType) => setListForm(prev => ({ ...prev, orderBy: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="price">Price</SelectItem>
                          <SelectItem value="24h">24h Change</SelectItem>
                          <SelectItem value="7d">7d Change</SelectItem>
                          <SelectItem value="30d">30d Change</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Order</Label>
                      <Select 
                        value={listForm.order} 
                        onValueChange={(v: SortOrderType) => setListForm(prev => ({ ...prev, order: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Ascending</SelectItem>
                          <SelectItem value="desc">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button 
                      onClick={handleListRefresh}
                      disabled={refreshListMutation.isPending || !listForm.game}
                      size="lg"
                    >
                      {refreshListMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        'Run List Refresh'
                      )}
                    </Button>

                    {refreshListMutation.data?.data && (
                      <Button 
                        variant="outline" 
                        onClick={() => exportCSV(refreshListMutation.data.data!, 'list-refresh.csv')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    )}
                  </div>

                  {refreshListMutation.data && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        {refreshListMutation.data.message} - {' '}
                        Processed {refreshListMutation.data.cardsProcessed} cards
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="id" className="space-y-4">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>ID Refresh</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Refresh specific cards by ID (max 100 per request)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Card IDs</Label>
                    <Textarea
                      placeholder="Enter card IDs (one per line or comma-separated)&#10;Example:&#10;xy1-1&#10;base1-4&#10;neo1-17"
                      value={idForm.idsText}
                      onChange={(e) => setIdForm(prev => ({ ...prev, idsText: e.target.value }))}
                      className="min-h-[120px]"
                    />
                    <div className="text-xs text-muted-foreground">
                      {parseIdList(idForm.idsText).length} IDs entered (max 100)
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Card Sort By</Label>
                      <Select 
                        value={idForm.cardSortBy} 
                        onValueChange={(v) => setIdForm(prev => ({ ...prev, cardSortBy: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="set">Set</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Card Order</Label>
                      <Select 
                        value={idForm.cardSortOrder} 
                        onValueChange={(v: SortOrderType) => setIdForm(prev => ({ ...prev, cardSortOrder: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Ascending</SelectItem>
                          <SelectItem value="desc">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Variant Sort By</Label>
                      <Select 
                        value={idForm.variantSortBy} 
                        onValueChange={(v) => setIdForm(prev => ({ ...prev, variantSortBy: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="price">Price</SelectItem>
                          <SelectItem value="condition">Condition</SelectItem>
                          <SelectItem value="printing">Printing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Variant Order</Label>
                      <Select 
                        value={idForm.variantSortOrder} 
                        onValueChange={(v: SortOrderType) => setIdForm(prev => ({ ...prev, variantSortOrder: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Ascending</SelectItem>
                          <SelectItem value="desc">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button 
                      onClick={handleIdRefresh}
                      disabled={refreshIdMutation.isPending || parseIdList(idForm.idsText).length === 0}
                      size="lg"
                    >
                      {refreshIdMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        'Run ID Refresh'
                      )}
                    </Button>

                    {refreshIdMutation.data?.data && (
                      <Button 
                        variant="outline" 
                        onClick={() => exportCSV(refreshIdMutation.data.data!, 'id-refresh.csv')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    )}
                  </div>

                  {refreshIdMutation.data && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        {refreshIdMutation.data.message} - {' '}
                        Processed {refreshIdMutation.data.cardsProcessed} cards
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Usage & Logs Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  API Usage Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apiMetadata ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Requests Used</Label>
                        <div className="text-2xl font-bold">
                          {apiMetadata.apiRequestsUsed.toLocaleString()}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Remaining</Label>
                        <div className="text-2xl font-bold">
                          {apiMetadata.apiRequestsRemaining.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Usage</Label>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all" 
                          style={{ width: `${Math.min(100, getUsagePercentage())}%` }}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {Math.round(getUsagePercentage())}% of {apiMetadata.apiRateLimit.toLocaleString()} daily limit
                      </div>
                    </div>

                    {apiMetadata.resetTime && (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Resets At</Label>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {new Date(apiMetadata.resetTime).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    No usage data available
                    <div className="text-xs mt-1">
                      Run a sync or refresh operation to see API usage
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sync Functions</span>
                    <Badge variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Online
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Refresh Functions</span>
                    <Badge variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Online
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Analytics</span>
                    <Badge variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Online
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Rate limit: 500 requests/minute</div>
                  <div>Page size: 200 cards per request</div>
                  <div>Worker concurrency: 24</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Snapshots Tab */}
        <TabsContent value="snapshots" className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Analytics Snapshots
                </div>
                <Button 
                  onClick={() => snapshotMutation.mutate()}
                  disabled={snapshotMutation.isPending}
                  variant="outline"
                >
                  {snapshotMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="h-4 w-4 mr-2" />
                      Run Snapshot
                    </>
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Game</Label>
                  <Select 
                    value={snapshotFilters.game} 
                    onValueChange={(v) => setSnapshotFilters(prev => ({ ...prev, game: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Games</SelectItem>
                      <SelectItem value="magic-the-gathering">Magic: The Gathering</SelectItem>
                      <SelectItem value="pokemon">Pokémon (EN)</SelectItem>
                      <SelectItem value="pokemon-japan">Pokémon (JP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Metric</Label>
                  <Select 
                    value={snapshotFilters.metric} 
                    onValueChange={(v: MetricType) => setSnapshotFilters(prev => ({ ...prev, metric: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="change_24h">24h Change</SelectItem>
                      <SelectItem value="change_7d">7d Change</SelectItem>
                      <SelectItem value="change_30d">30d Change</SelectItem>
                      <SelectItem value="cheapest_price">Price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={snapshotFilters.startDate}
                    onChange={(e) => setSnapshotFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={snapshotFilters.endDate}
                    onChange={(e) => setSnapshotFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {snapshots && snapshots.length > 0 && (
                <>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">
                      {snapshots.length} snapshots found
                    </Badge>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => exportCSV(snapshots, 'analytics-snapshots.csv')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Card</TableHead>
                          <TableHead>Game</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>24h</TableHead>
                          <TableHead>7d</TableHead>
                          <TableHead>30d</TableHead>
                          <TableHead>Captured</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshots.slice(0, 50).map((snapshot) => (
                          <TableRow key={`${snapshot.id}-${snapshot.captured_at}`}>
                            <TableCell className="font-medium">
                              {snapshot.card_name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {snapshot.game}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatPrice(snapshot.cheapest_price)}</TableCell>
                            <TableCell className={getChangeColor(snapshot.change_24h)}>
                              {formatChange(snapshot.change_24h)}
                            </TableCell>
                            <TableCell className={getChangeColor(snapshot.change_7d)}>
                              {formatChange(snapshot.change_7d)}
                            </TableCell>
                            <TableCell className={getChangeColor(snapshot.change_30d)}>
                              {formatChange(snapshot.change_30d)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(snapshot.captured_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {snapshotsLoading && (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin mb-2" />
                  <div className="text-muted-foreground">Loading snapshots...</div>
                </div>
              )}

              {!snapshotsLoading && (!snapshots || snapshots.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2" />
                  No snapshots found
                  <div className="text-xs mt-1">
                    Adjust your filters or run a snapshot to see data
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}