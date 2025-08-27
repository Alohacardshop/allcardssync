import React, { useState, useEffect, useRef } from 'react';
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
  Clock,
  Zap,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_MODES,
  type GameMode,
  type CatalogStats,
  type QueueStats,
  type SyncError,
  type HealthStatus,
  checkHealth,
  getCatalogStats,
  getQueueStatsByMode,
  getRecentSyncErrors,
  runSync,
  queuePendingSets,
  drainQueue,
  getIncrementalDate,
  formatTimeAgo
} from '@/lib/api';
import { ImportJobsTable } from './ImportJobsTable';

interface SyncTabProps {
  selectedMode: string;
  onModeChange: (mode: string) => void;
  healthStatus: HealthStatus | null;
  onHealthUpdate: (status: HealthStatus) => void;
}

export default function SyncTab({ selectedMode, onModeChange, healthStatus, onHealthUpdate }: SyncTabProps) {
  const [setId, setSetId] = useState('');
  const [since, setSince] = useState('');
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingAll, setProcessingAll] = useState(false);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [lastRun, setLastRun] = useState<any>(null);
  const [isActiveSync, setIsActiveSync] = useState(false);
  const [retryingError, setRetryingError] = useState<string | null>(null);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mode = GAME_MODES.find(m => m.value === selectedMode);

  useEffect(() => {
    if (mode) {
      loadAllData();
    }
  }, [mode]);

  useEffect(() => {
    // Poll progress during active sync
    if (isActiveSync && mode) {
      pollIntervalRef.current = setInterval(() => {
        loadStats();
        loadQueueStats();
      }, 3000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isActiveSync, mode]);

  const loadAllData = async () => {
    if (!mode) return;
    
    await Promise.all([
      loadStats(),
      loadQueueStats(),
      loadRecentErrors(),
      loadHealthStatus()
    ]);
  };

  const loadStats = async () => {
    if (!mode) return;
    
    try {
      const newStats = await getCatalogStats(mode);
      setStats(newStats);
      
      // Update active sync status based on pending sets and processing queue
      const hasActivity = newStats.pending_count > 0 || (queueStats && queueStats.processing > 0);
      setIsActiveSync(hasActivity);
      
    } catch (error: any) {
      console.error('Error loading catalog stats:', error);
    }
  };

  const loadQueueStats = async () => {
    if (!mode) return;
    
    try {
      const newQueueStats = await getQueueStatsByMode(mode);
      setQueueStats(newQueueStats);
      
      // Auto-stop polling if nothing is processing
      if (newQueueStats.processing === 0 && newQueueStats.queued === 0) {
        setIsActiveSync(false);
      }
      
    } catch (error: any) {
      console.error('Error loading queue stats:', error);
    }
  };

  const loadRecentErrors = async () => {
    if (!mode) return;
    
    try {
      const recentErrors = await getRecentSyncErrors(mode, 5);
      setErrors(recentErrors);
    } catch (error: any) {
      console.error('Error loading sync errors:', error);
    }
  };

  const loadHealthStatus = async () => {
    try {
      const health = await checkHealth();
      onHealthUpdate(health);
    } catch (error: any) {
      console.error('Error checking health:', error);
      onHealthUpdate({ ok: false, api: 'down', reason: error.message });
    }
  };

  const handleSync = async () => {
    if (!mode) return;

    // Check health first
    if (!healthStatus?.ok) {
      toast.error('System health check failed', {
        description: healthStatus?.reason || 'Please check configuration'
      });
      return;
    }

    setLoading(true);
    
    try {
      const result = await runSync(mode, { 
        setId: setId || undefined, 
        since: since || undefined 
      });
      
      setLastRun(result);
      
      if (result.ok) {
        if (result.queued_sets) {
          toast.success(`Started sync for ${result.queued_sets} sets`);
          setIsActiveSync(true);
        } else if (result.cards !== undefined) {
          toast.success(`Synced ${result.cards} cards for set ${result.setId}`);
        } else {
          toast.success('Sync operation completed');
        }
        await loadAllData();
      } else {
        toast.error('Sync failed', {
          description: result.error || 'Unknown error occurred'
        });
      }
    } catch (error: any) {
      toast.error('Sync failed', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQueuePending = async () => {
    if (!mode) return;

    setQueueing(true);
    
    try {
      const queuedCount = await queuePendingSets(mode);
      
      toast.success(`Queued ${queuedCount} pending sets for processing`);
      setIsActiveSync(true);
      await loadAllData();
      
    } catch (error: any) {
      toast.error('Failed to queue pending sets', {
        description: error.message
      });
    } finally {
      setQueueing(false);
    }
  };

  const handleIncremental = async () => {
    const incrementalDate = getIncrementalDate(6);
    setSince(incrementalDate);
    
    // Trigger sync with the date
    if (!mode) return;

    setLoading(true);
    
    try {
      const result = await runSync(mode, { since: incrementalDate });
      setLastRun(result);
      
      if (result.ok) {
        toast.success('Incremental sync started (6 months)', {
          description: result.queued_sets ? `Processing ${result.queued_sets} sets` : 'Sync completed'
        });
        if (result.queued_sets) setIsActiveSync(true);
        await loadAllData();
      } else {
        toast.error('Incremental sync failed', {
          description: result.error
        });
      }
    } catch (error: any) {
      toast.error('Incremental sync failed', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessNext = async () => {
    if (!mode) return;

    setProcessing(true);
    
    try {
      const result = await drainQueue(mode);
      setLastRun(result);
      
      if (result.ok) {
        if (result.status === 'idle') {
          toast.info('Queue is empty - no items to process');
        } else {
          toast.success('Processed one queue item', {
            description: result.cards ? `Synced ${result.cards} cards` : 'Item processed'
          });
        }
        await loadAllData();
      } else {
        toast.error('Failed to process queue item', {
          description: result.error
        });
      }
    } catch (error: any) {
      toast.error('Failed to process queue item', {
        description: error.message
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessAll = async () => {
    if (!mode) return;

    setProcessingAll(true);
    let processed = 0;
    const maxItems = 100; // Safety limit
    
    try {
      while (processed < maxItems) {
        const result = await drainQueue(mode);
        
        if (!result.ok) {
          toast.error('Processing stopped due to error', {
            description: result.error
          });
          break;
        }
        
        if (result.status === 'idle') {
          // Queue is empty
          break;
        }
        
        processed++;
        
        // Update stats periodically
        if (processed % 5 === 0) {
          await loadAllData();
        }
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (processed === maxItems) {
        toast.warning(`Processed ${processed} items (safety limit reached)`, {
          description: 'Click "Process All" again to continue'
        });
      } else if (processed > 0) {
        toast.success(`Processed ${processed} queue items`);
      } else {
        toast.info('Queue is empty - no items to process');
      }
      
      await loadAllData();
      
    } catch (error: any) {
      toast.error('Failed to process queue', {
        description: error.message
      });
    } finally {
      setProcessingAll(false);
    }
  };

  const handleRetryError = async (error: SyncError) => {
    if (!mode) return;
    
    setRetryingError(error.set_id);
    setSetId(error.set_id);
    
    try {
      const result = await runSync(mode, { setId: error.set_id });
      setLastRun(result);
      
      if (result.ok) {
        toast.success(`Retry successful for set ${error.set_id}`, {
          description: result.cards ? `Synced ${result.cards} cards` : 'Sync completed'
        });
        await loadAllData();
      } else {
        toast.error(`Retry failed for set ${error.set_id}`, {
          description: result.error
        });
      }
    } catch (err: any) {
      toast.error(`Retry failed for set ${error.set_id}`, {
        description: err.message
      });
    } finally {
      setRetryingError(null);
    }
  };

  const isDisabled = loading || queueing || processing || processingAll || retryingError !== null;
  const totalProcessed = (stats?.sets_count || 0) + (stats?.cards_count || 0);
  const queueTotal = (queueStats?.queued || 0) + (queueStats?.processing || 0) + (queueStats?.done || 0) + (queueStats?.error || 0);

  return (
    <div className="space-y-6">
      {/* Mode Selector & Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Catalog Sync
            </div>
            <div className="flex items-center gap-2">
              {healthStatus?.ok ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <Badge variant={healthStatus?.ok ? "secondary" : "destructive"}>
                {healthStatus?.ok ? 'Healthy' : 'Issues'}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mode-select">Mode</Label>
              <Select value={selectedMode} onValueChange={onModeChange} disabled={isDisabled}>
                <SelectTrigger id="mode-select">
                  <SelectValue placeholder="Select a mode..." />
                </SelectTrigger>
                <SelectContent>
                  {GAME_MODES.map((gameMode) => (
                    <SelectItem key={gameMode.value} value={gameMode.value}>
                      {gameMode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!healthStatus?.ok && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {healthStatus?.reason || 'System health check failed. Please check configuration.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {mode && (
        <>
          {/* Controls Row */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Sync Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="set-id">Set ID (optional)</Label>
                  <Input
                    id="set-id"
                    placeholder="e.g. sv3pt5"
                    value={setId}
                    onChange={(e) => setSetId(e.target.value)}
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="since-date">Since Date (optional)</Label>
                  <Input
                    id="since-date"
                    type="date"
                    value={since}
                    onChange={(e) => setSince(e.target.value)}
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <Button 
                    onClick={handleSync}
                    disabled={isDisabled}
                    className="w-full"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sync Now
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="secondary"
                      onClick={handleQueuePending}
                      disabled={isDisabled || !stats?.pending_count}
                      className="flex-1"
                    >
                      {queueing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Queue Pending
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={handleIncremental}
                      disabled={isDisabled}
                      className="flex-1"
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      6m
                    </Button>
                  </div>
                </div>
              </div>

              {/* Queue Processing Controls */}
              {queueStats && (queueStats.queued > 0 || queueStats.processing > 0) && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm font-medium">Queue Processing</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleProcessNext}
                      disabled={isDisabled}
                      className="flex-1"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Process Next
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleProcessAll}
                      disabled={isDisabled}
                      className="flex-1"
                    >
                      {processingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Process All
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {queueStats.queued} items queued • {queueStats.processing} processing
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Today's Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Current Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-primary">{stats?.sets_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Sets</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-primary">{stats?.cards_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Cards</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-primary">{stats?.pending_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Pending</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    {isActiveSync ? (
                      <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                    ) : totalProcessed > 0 ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Database className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Badge variant={isActiveSync ? "secondary" : totalProcessed > 0 ? "default" : "outline"}>
                      {isActiveSync ? "Syncing..." : totalProcessed > 0 ? "Ready" : "Empty"}
                    </Badge>
                  </div>

                  {/* Progress bar for queue processing */}
                  {queueStats && queueTotal > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Queue Progress</span>
                        <span>{queueStats.done}/{queueTotal}</span>
                      </div>
                      <Progress value={(queueStats.done / queueTotal) * 100} className="w-full" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Last Run Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Last Run
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {lastRun ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {lastRun.ok ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium">
                          {lastRun.ok ? 'Success' : 'Failed'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatTimeAgo(lastRun.at)}
                        </span>
                      </div>
                      
                      {lastRun.ok && (
                        <div className="text-sm text-muted-foreground">
                          {lastRun.queued_sets && `Queued ${lastRun.queued_sets} sets`}
                          {lastRun.cards !== undefined && `Synced ${lastRun.cards} cards`}
                          {lastRun.setId && ` for set ${lastRun.setId}`}
                        </div>
                      )}
                      
                      {!lastRun.ok && lastRun.error && (
                        <div className="text-sm text-red-500">
                          {lastRun.error}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No recent runs
                    </div>
                  )}

                  {/* Queue Status */}
                  {queueStats && (
                    <div className="pt-2 border-t space-y-2">
                      <div className="text-sm font-medium">Queue Status</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span>Queued:</span>
                          <span>{queueStats.queued}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Processing:</span>
                          <span>{queueStats.processing}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Done:</span>
                          <span>{queueStats.done}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Errors:</span>
                          <span>{queueStats.error}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Errors */}
          {errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Recent Errors ({mode.label})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {errors.map((error, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Set: {error.set_id}</span>
                          {error.card_id && (
                            <span className="text-muted-foreground">Card: {error.card_id}</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {error.step}: {error.message}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeAgo(error.created_at)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetryError(error)}
                        disabled={retryingError === error.set_id}
                      >
                        {retryingError === error.set_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Import Jobs Table */}
      {mode && (
        <ImportJobsTable game={selectedMode} />
      )}
    </div>
  );
}