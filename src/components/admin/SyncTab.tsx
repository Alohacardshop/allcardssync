import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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
  RotateCcw,
  Trash2
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { RebuildProgressWidget } from './RebuildProgressWidget';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface SyncTabProps {
  selectedMode: string;
  onModeChange: (mode: string) => void;
  healthStatus: HealthStatus | null;
  onHealthUpdate: (status: HealthStatus) => void;
}

interface LiveDelta {
  sets: number;
  cards: number;
}

// Helper function to normalize API response counts
function normalizeApiCounts(result: any): { setsProcessed: number; cardsProcessed: number } {
  return {
    setsProcessed: result.setsProcessed || result.queued_sets || result.sets || 0,
    cardsProcessed: result.cardsProcessed || result.cards || 0
  };
}

const FUNCTIONS_BASE = 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1';



export default function SyncTab({ selectedMode, onModeChange, healthStatus, onHealthUpdate }: SyncTabProps) {
  const [setId, setSetId] = useState('');
  const [since, setSince] = useState('');
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingAll, setProcessingAll] = useState(false);
  const [turboMode, setTurboMode] = useLocalStorage('admin-turbo-mode', false);
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [lastRun, setLastRun] = useState<any>(null);
  const [isActiveSync, setIsActiveSync] = useState(false);
  const [retryingError, setRetryingError] = useState<string | null>(null);
  const [liveDelta, setLiveDelta] = useState<LiveDelta>({ sets: 0, cards: 0 });
  const [refreshRate, setRefreshRate] = useState<number>(1000); // milliseconds
  const [manualRefreshLoading, setManualRefreshLoading] = useState(false);
  const [draining, setDraining] = useState(false);
  const [autoDrainEnabled, setAutoDrainEnabled] = useLocalStorage('sync-auto-drain-enabled', true);
  const [isAutoDraining, setIsAutoDraining] = useState(false);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mode = GAME_MODES.find(m => m.value === selectedMode);

  // Reset liveDelta when mode changes or on fresh loads
  useEffect(() => {
    setLiveDelta({ sets: 0, cards: 0 });
    setIsAutoDraining(false); // Reset auto-drain state when mode changes
    if (mode) {
      loadAllData();
    }
  }, [mode]);

  // Auto-drain when queue has items
  useEffect(() => {
    if (!mode || !autoDrainEnabled || draining || isAutoDraining || processing || processingAll) return;
    
    // Check if queue has items and nothing is currently processing
    if (queueStats && queueStats.queued > 0 && queueStats.processing === 0) {
      console.log('Auto-drain: Starting auto-drain, queue has', queueStats.queued, 'items');
      setIsAutoDraining(true);
      handleAutodrainQueue();
    }
  }, [queueStats, autoDrainEnabled, draining, isAutoDraining, processing, processingAll, mode]);

  useEffect(() => {
    // Poll progress during active sync with configurable interval
    if (isActiveSync && mode) {
      pollIntervalRef.current = setInterval(() => {
        loadStats();
        loadQueueStats();
      }, refreshRate);
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
  }, [isActiveSync, mode, refreshRate]);

  // Refresh on tab focus
  useEffect(() => {
    const handleFocus = () => {
      if (mode && document.visibilityState === 'visible') {
        loadAllData();
      }
    };

    document.addEventListener('visibilitychange', handleFocus);
    return () => document.removeEventListener('visibilitychange', handleFocus);
  }, [mode]);

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

  const handleSyncSets = async () => {
    if (!mode) return;

    // Check health first
    if (!healthStatus?.ok) {
      toast.error('System health check failed', {
        description: healthStatus?.reason || 'Please check configuration'
      });
      return;
    }

    setLoading(true);
    setLiveDelta({ sets: 0, cards: 0 }); // Reset delta on new sync
    
    try {
      const result = await runSync(mode, { 
        setId: setId || undefined, 
        since: since || undefined 
      }, turboMode);
      
      const counts = normalizeApiCounts(result);
      setLastRun({ ...result, ...counts });
      
      if (result.ok) {
        if (counts.setsProcessed > 0) {
          toast.success(`Sets sync completed: ${counts.setsProcessed} sets queued for processing`);
          setIsActiveSync(true);
        } else {
          toast.success('Sets sync completed - no new sets found');
        }
        await loadAllData();
      } else {
        toast.error('Sets sync failed', {
          description: result.error || 'Unknown error occurred'
        });
      }
    } catch (error: any) {
      toast.error('Sets sync failed', {
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
    setLiveDelta({ sets: 0, cards: 0 }); // Reset delta on new sync
    
    try {
      const result = await runSync(mode, { since: incrementalDate }, turboMode);
      const counts = normalizeApiCounts(result);
      setLastRun({ ...result, ...counts });
      
      if (result.ok) {
        toast.success('Incremental sync started (6 months)', {
          description: counts.setsProcessed ? `Processing ${counts.setsProcessed} sets` : 'Sync completed'
        });
        if (counts.setsProcessed) setIsActiveSync(true);
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
    setIsActiveSync(true); // Start active polling
    
    try {
      const result = await drainQueue(mode);
      const counts = normalizeApiCounts(result);
      setLastRun({ ...result, ...counts });
      
      if (result.ok) {
        if (result.status === 'idle') {
          toast.info('Queue is empty - no items to process');
          setIsActiveSync(false);
        } else {
          // Increment liveDelta immediately for instant UI feedback
          if (counts.cardsProcessed > 0) {
            setLiveDelta(prev => ({ 
              sets: prev.sets + (counts.setsProcessed || 0), 
              cards: prev.cards + counts.cardsProcessed 
            }));
          }
          
          toast.success('Processed one queue item', {
            description: counts.cardsProcessed ? `Synced ${counts.cardsProcessed} cards` : 'Item processed'
          });
          // Update local state immediately for faster UI feedback
          await Promise.all([loadQueueStats(), loadStats()]);
        }
      } else {
        toast.error('Failed to process queue item', {
          description: result.error
        });
        setIsActiveSync(false);
      }
    } catch (error: any) {
      toast.error('Failed to process queue item', {
        description: error.message
      });
      setIsActiveSync(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleDrainQueue = async () => {
    if (!mode) return;

    setDraining(true);
    setIsActiveSync(true);
    
    let totalProcessed = 0;
    
    try {
      // Keep processing until queue is empty or error occurs
      while (true) {
        const result = await drainQueue(mode);
        const counts = normalizeApiCounts(result);
        setLastRun({ ...result, ...counts });
        
        if (!result.ok) {
          toast.error('Failed to process queue item', {
            description: result.error
          });
          break;
        }
        
        if (result.status === 'idle') {
          toast.success(`Drain complete! Processed ${totalProcessed} items total`);
          setIsActiveSync(false);
          break;
        }
        
        // Increment counters and update UI
        if (counts.cardsProcessed > 0) {
          totalProcessed++;
          setLiveDelta(prev => ({ 
            sets: prev.sets + (counts.setsProcessed || 0), 
            cards: prev.cards + counts.cardsProcessed 
          }));
        }
        
        // Update stats after each item
        await Promise.all([loadQueueStats(), loadStats()]);
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      toast.error('Drain failed', {
        description: error.message
      });
      setIsActiveSync(false);
    } finally {
      setDraining(false);
    }
  };

  const handleAutodrainQueue = async () => {
    if (!mode || !autoDrainEnabled) return;
    
    let totalProcessed = 0;
    
    try {
      // Keep processing until queue is empty, error occurs, or auto-drain is disabled
      while (autoDrainEnabled) {
        const result = await drainQueue(mode);
        const counts = normalizeApiCounts(result);
        setLastRun({ ...result, ...counts });
        
        if (!result.ok) {
          console.log('Auto-drain: Failed to process item, stopping auto-drain');
          break;
        }
        
        if (result.status === 'idle') {
          console.log(`Auto-drain: Queue empty, processed ${totalProcessed} items total`);
          break;
        }
        
        // Increment counters and update UI
        if (counts.cardsProcessed > 0) {
          totalProcessed++;
          setLiveDelta(prev => ({ 
            sets: prev.sets + (counts.setsProcessed || 0), 
            cards: prev.cards + counts.cardsProcessed 
          }));
        }
        
        // Update stats after each item
        await Promise.all([loadQueueStats(), loadStats()]);
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      console.error('Auto-drain error:', error);
    } finally {
      setIsAutoDraining(false);
    }
  };

  const handleProcessAll = async () => {
    if (!mode) return;

    setProcessingAll(true);
    setIsActiveSync(true);
    
    let totalProcessed = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    
    try {
      // First, enable auto-drain
      setAutoDrainEnabled(true);
      
      // Then queue any pending sets
      console.log('Process All: Queueing pending sets...');
      try {
        const queuedCount = await queuePendingSets(mode);
        if (queuedCount > 0) {
          toast.success(`Queued ${queuedCount} pending sets - auto-processing enabled`);
        } else {
          toast.info('No pending sets to queue - processing existing queue');
        }
        await loadQueueStats(); // Refresh queue stats after queueing
      } catch (error: any) {
        console.warn('Process All: Failed to queue pending sets:', error.message);
        toast.warning('Failed to queue some pending sets', {
          description: 'Continuing with existing queue items'
        });
      }
      
      // Then drain the entire queue
      console.log('Process All: Starting queue drain...');
      while (true) {
        const result = await drainQueue(mode);
        const counts = normalizeApiCounts(result);
        setLastRun({ ...result, ...counts });
        
        if (!result.ok) {
          consecutiveErrors++;
          console.warn(`Process All: Error #${consecutiveErrors}:`, result.error);
          
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            toast.error(`Process All stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`, {
              description: 'Check recent errors for details'
            });
            break;
          } else {
            toast.warning(`Error processing item (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`, {
              description: result.error
            });
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }
        
        // Reset error counter on success
        consecutiveErrors = 0;
        
        if (result.status === 'idle') {
          toast.success(`Process All complete! Processed ${totalProcessed} items total`);
          setIsActiveSync(false);
          break;
        }
        
        // Increment counters and update UI
        if (counts.cardsProcessed > 0) {
          totalProcessed++;
          setLiveDelta(prev => ({ 
            sets: prev.sets + (counts.setsProcessed || 0), 
            cards: prev.cards + counts.cardsProcessed 
          }));
        }
        
        // Update stats after each item
        await Promise.all([loadQueueStats(), loadStats()]);
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      toast.error('Process All failed', {
        description: error.message
      });
      setIsActiveSync(false);
    } finally {
      setProcessingAll(false);
    }
  };

  const handleRetryError = async (error: SyncError) => {
    if (!mode) return;
    
    setRetryingError(error.set_id);
    setSetId(error.set_id);
    
    try {
      const result = await runSync(mode, { setId: error.set_id }, turboMode);
      const counts = normalizeApiCounts(result);
      setLastRun({ ...result, ...counts });
      
      if (result.ok) {
        toast.success(`Retry successful for set ${error.set_id}`, {
          description: counts.cardsProcessed ? `Synced ${counts.cardsProcessed} cards` : 'Sync completed'
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

  const handleManualRefresh = async () => {
    if (!mode) return;
    
    setManualRefreshLoading(true);
    try {
      await loadAllData();
      toast.success('Data refreshed');
    } catch (error: any) {
      toast.error('Failed to refresh data', {
        description: error.message
      });
    } finally {
      setManualRefreshLoading(false);
    }
  };

  const handleFinishInBackground = async () => {
    if (!mode) return;
    
    setIsBackgroundProcessing(true);
    
    try {
      const concurrency = turboMode ? 5 : 3;
      const batches = turboMode ? 20 : 10;
      const batchSize = turboMode ? 8 : 5;
      
      const response = await fetch(`${FUNCTIONS_BASE}/catalog-turbo-worker?mode=${encodeURIComponent(mode.value)}&concurrency=${concurrency}&batches=${batches}&batchSize=${batchSize}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Background processing failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      toast.success('Background processing started', {
        description: `Processing with ${concurrency}x concurrency. Check logs for progress.`
      });
      
    } catch (error: any) {
      toast.error('Background processing failed', {
        description: error.message
      });
      setIsBackgroundProcessing(false);
    }
  };

  const handleRetryAllFailed = async () => {
    if (!mode || !errors.length) return;
    
    try {
      // Requeue all failed sets
      const failedSetIds = [...new Set(errors.map(e => e.set_id))];
      
      for (const setId of failedSetIds) {
        await fetch(`${FUNCTIONS_BASE}/catalog-sync?game=${encodeURIComponent(mode.value)}&setId=${encodeURIComponent(setId)}&turbo=${turboMode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      toast.success(`Retrying ${failedSetIds.length} failed sets`, {
        description: turboMode ? 'Using turbo mode for faster processing' : 'Using standard processing'
      });
      
      await loadAllData();
      
    } catch (error: any) {
      toast.error('Failed to retry failed sets', {
        description: error.message
      });
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
            <div className="flex items-center gap-4">
              {/* Refresh Settings */}
              <div className="flex items-center gap-2">
                <Label htmlFor="refresh-rate" className="text-sm">Refresh:</Label>
                <Select value={refreshRate.toString()} onValueChange={(value) => setRefreshRate(parseInt(value))}>
                  <SelectTrigger id="refresh-rate" className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">0.5s</SelectItem>
                    <SelectItem value="1000">1s</SelectItem>
                    <SelectItem value="2000">2s</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={manualRefreshLoading}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className={`h-3 w-3 ${manualRefreshLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              {/* Health Status */}
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
          {/* Rebuild Progress Widget */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <RebuildProgressWidget
                mode={mode}
                stats={stats}
                queueStats={queueStats}
                errors={errors}
                isActiveSync={isActiveSync}
                onQueuePending={handleQueuePending}
                onProcessNext={handleProcessNext}
                onDrainQueue={handleDrainQueue}
                onRefresh={handleManualRefresh}
                queueing={queueing}
                processing={processing}
                draining={draining}
                refreshing={manualRefreshLoading}
              />
            </div>
            
            {/* Current Progress & Last Run */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Current Progress */}
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
                         <div className="text-2xl font-bold text-primary">{(stats?.sets_count || 0) + liveDelta.sets}</div>
                         <div className="text-xs text-muted-foreground">Sets</div>
                         {liveDelta.sets > 0 && (
                           <div className="text-xs text-green-600 font-medium">+{liveDelta.sets} live</div>
                         )}
                       </div>
                       <div className="text-center p-3 bg-muted/50 rounded-lg">
                         <div className="text-2xl font-bold text-primary">{(stats?.cards_count || 0) + liveDelta.cards}</div>
                         <div className="text-xs text-muted-foreground">Cards</div>
                         {liveDelta.cards > 0 && (
                           <div className="text-xs text-green-600 font-medium">+{liveDelta.cards} live</div>
                         )}
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
                             {lastRun.setsProcessed && `Queued ${lastRun.setsProcessed} sets`}
                             {lastRun.cardsProcessed !== undefined && ` • Synced ${lastRun.cardsProcessed} cards`}
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
          </div>

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
                    onClick={handleSyncSets}
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

              {/* Auto-drain Toggle */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm font-medium">Auto Processing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="auto-drain" className="text-sm">
                      Auto-drain when queue has items
                    </Label>
                    <Switch
                      id="auto-drain"
                      checked={autoDrainEnabled}
                      onCheckedChange={setAutoDrainEnabled}
                    />
                  </div>
                </div>
                
                {/* Auto-drain status banner */}
                {isAutoDraining && (
                  <Alert className="mb-3 bg-blue-50 border-blue-200">
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    <AlertDescription className="text-blue-700">
                      Auto-draining queue... ({queueStats?.queued || 0} items remaining)
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Process All Automatically Button */}
              <div className="pt-4 border-t">
                <Button
                  onClick={handleProcessAll}
                  disabled={isDisabled}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                >
                  {processingAll ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing All...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Process All Automatically
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Queues pending sets, enables auto-drain, and processes everything automatically
                </p>
              </div>

              {/* Queue Processing Controls */}
              {queueStats && (queueStats.queued > 0 || queueStats.processing > 0) && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm font-medium">Manual Queue Processing</span>
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
                      onClick={handleDrainQueue}
                      disabled={isDisabled}
                      className="flex-1"
                    >
                      {draining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Drain Queue
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {queueStats.queued} items queued • {queueStats.processing} processing
                    {autoDrainEnabled && !isAutoDraining && queueStats.queued > 0 && (
                      <span className="text-blue-600"> • Auto-drain enabled</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

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