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

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.replace(/\/+$/, '') || '/functions/v1'

interface ResetResult {
  success: boolean
  total_records_deleted: number
  games_processed: number
  summaries: Array<{
    game: string
    variants_deleted: number
    cards_deleted: number
    sets_deleted: number
    sync_errors_deleted: number
    queue_items_deleted: number
  }>
  error?: string
}

// Reset & Rebuild Catalog Section Component
const ResetCatalogSection = () => {
  const [selectedGames, setSelectedGames] = useState(['pokemon', 'pokemon-japan', 'mtg']);
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [logs, setLogs] = useState<Array<{timestamp: string, level: string, message: string, data?: any}>>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  const gameOptions = [
    { value: 'pokemon', label: 'Pokémon (Global)' },
    { value: 'pokemon-japan', label: 'Pokémon Japan' },
    { value: 'mtg', label: 'Magic: The Gathering' }
  ];

  const handleGameToggle = (gameValue: string) => {
    setSelectedGames(prev => 
      prev.includes(gameValue) 
        ? prev.filter(g => g !== gameValue)
        : [...prev, gameValue]
    );
  };

  const handleResetAndRebuild = async () => {
    setShowConfirmDialog(false);
    setIsResetting(true);
    setResetResult(null);
    setLogs([]);
    setShowLogs(true);

    try {
      console.log('🧹 Starting catalog reset for games:', selectedGames);
      
      // Add initial log
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Starting catalog reset and rebuild for games: ${selectedGames.join(', ')}`
      }]);

      // Try the streaming endpoint first, fallback to regular if it fails
      try {
        const streamUrl = `${FUNCTIONS_BASE}/catalog-rebuild-stream`;
        console.log('Attempting to connect to stream:', streamUrl);
        
        const response = await fetch(streamUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ games: selectedGames })
        });

        console.log('Stream response:', response.status, response.statusText);

        if (!response.ok) {
          throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader');
        }

        const decoder = new TextDecoder();
        
        const readStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const logData = JSON.parse(line.slice(6));
                    setLogs(prev => [...prev, logData]);
                    
                    if (logData.message === 'COMPLETE') {
                      setResetResult(logData.data);
                      setIsResetting(false);
                      
                      const successfulSyncs = logData.data?.successfulSyncs || 0;
                      const totalGames = selectedGames.length;
                      toast.success(`Reset & rebuild completed! ${successfulSyncs}/${totalGames} syncs started`);
                      return;
                    } else if (logData.level === 'error' && logData.message.includes('Process failed')) {
                      setIsResetting(false);
                      toast.error('Reset & rebuild failed', {
                        description: logData.message
                      });
                      return;
                    }
                  } catch (err) {
                    console.error('Error parsing SSE data:', err, line);
                  }
                }
              }
            }
          } catch (streamError) {
            console.error('Stream reading error:', streamError);
            throw streamError;
          }
        };

        await readStream();

      } catch (streamError: any) {
        console.error('Streaming failed, falling back to regular method:', streamError.message);
        
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'warning',
          message: `Streaming unavailable, using fallback method: ${streamError.message}`
        }]);

        // Fallback to the original non-streaming method
        await fallbackResetAndRebuild();
      }

    } catch (error: any) {
      console.error('❌ Reset & rebuild error:', error);
      toast.error('Reset & rebuild failed', {
        description: error.message
      });
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Error: ${error.message}`
      }]);
      setIsResetting(false);
    }
  };

  const fallbackResetAndRebuild = async () => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '🧹 Step 1/2: Resetting catalog data...'
    }]);

    // Step 1: Reset catalogs
    const resetResponse = await fetch(`${FUNCTIONS_BASE}/catalog-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games: selectedGames })
    });

    if (!resetResponse.ok) {
      throw new Error(`Reset failed: ${resetResponse.statusText}`);
    }

    const resetData: ResetResult = await resetResponse.json();

    if (!resetData.success) {
      throw new Error(resetData.error || 'Reset failed');
    }

    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `✅ Reset completed: ${resetData.total_records_deleted} records deleted`
    }]);

    // Step 2: Trigger syncs for each selected game
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '🚀 Step 2/2: Starting fresh imports...'
    }]);

    const syncResults: any[] = [];

    for (const game of selectedGames) {
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Starting sync for ${game}...`
      }]);
      
      try {
        let syncResponse: Response;
        
        if (game === 'pokemon') {
          syncResponse = await fetch(`${FUNCTIONS_BASE}/catalog-sync-pokemon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
        } else if (game === 'pokemon-japan') {
          syncResponse = await fetch(`${FUNCTIONS_BASE}/catalog-sync-justtcg?game=pokemon-japan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
        } else if (game === 'mtg') {
          syncResponse = await fetch(`${FUNCTIONS_BASE}/catalog-sync-justtcg?game=magic-the-gathering`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
        } else {
          continue;
        }

        const syncData = await syncResponse.json();
        syncResults.push({ game, success: syncResponse.ok, data: syncData });
        
        if (syncResponse.ok) {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'success',
            message: `✅ ${game} sync started successfully`
          }]);
        } else {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `❌ ${game} sync failed: ${syncData.error || 'Unknown error'}`
          }]);
        }
      } catch (syncError: any) {
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `❌ ${game} sync error: ${syncError.message}`
        }]);
        syncResults.push({ game, success: false, error: syncError.message });
      }
    }

    const result = {
      resetData,
      syncResults,
      timestamp: new Date().toISOString()
    };
    
    setResetResult(result);
    
    const successfulSyncs = syncResults.filter(r => r.success).length;
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `🎉 Reset & rebuild completed! ${successfulSyncs}/${selectedGames.length} syncs started successfully`
    }]);
    
    toast.success(`Reset & rebuild completed! ${successfulSyncs}/${selectedGames.length} syncs started`);
    setIsResetting(false);
  };

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This will permanently delete all local catalog data for the selected games and trigger fresh imports from upstream sources.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Select Games to Reset:</Label>
        <div className="grid grid-cols-1 gap-3">
          {gameOptions.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`game-${option.value}`}
                checked={selectedGames.includes(option.value)}
                onCheckedChange={() => handleGameToggle(option.value)}
                disabled={isResetting}
              />
              <Label 
                htmlFor={`game-${option.value}`} 
                className="text-sm cursor-pointer"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={() => setShowConfirmDialog(true)}
          disabled={isResetting || selectedGames.length === 0}
          className="flex-1"
        >
          {isResetting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Resetting...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Reset & Rebuild Catalog
            </>
          )}
        </Button>
      </div>

      {showLogs && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Live Progress:</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
            >
              {showLogs ? 'Hide' : 'Show'} Logs
            </Button>
          </div>
          <div className="bg-background border rounded-lg p-3 max-h-64 overflow-auto font-mono text-xs space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`
                  ${log.level === 'success' ? 'text-green-600' : ''}
                  ${log.level === 'error' ? 'text-red-600' : ''}
                  ${log.level === 'warning' ? 'text-yellow-600' : ''}
                  ${log.level === 'info' ? 'text-blue-600' : ''}
                `}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {resetResult && (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <h4 className="font-semibold mb-2">Final Results:</h4>
          <pre className="text-xs overflow-auto max-h-64">
            {JSON.stringify(resetResult, null, 2)}
          </pre>
        </div>
      )}

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirm Catalog Reset
            </DialogTitle>
            <DialogDescription>
              This will delete all local catalog data for the selected games: <strong>{selectedGames.join(', ')}</strong>.
              <br /><br />
              Fresh imports will be triggered automatically. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetAndRebuild}>
              Yes, Reset & Rebuild
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

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
  const [liveDelta, setLiveDelta] = useState<LiveDelta>({ sets: 0, cards: 0 });
  const [refreshRate, setRefreshRate] = useState<number>(1000); // milliseconds
  const [manualRefreshLoading, setManualRefreshLoading] = useState(false);
  const [draining, setDraining] = useState(false);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mode = GAME_MODES.find(m => m.value === selectedMode);

  // Reset liveDelta when mode changes or on fresh loads
  useEffect(() => {
    setLiveDelta({ sets: 0, cards: 0 });
    if (mode) {
      loadAllData();
    }
  }, [mode]);

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
    setLiveDelta({ sets: 0, cards: 0 }); // Reset delta on new sync
    
    try {
      const result = await runSync(mode, { 
        setId: setId || undefined, 
        since: since || undefined 
      });
      
      const counts = normalizeApiCounts(result);
      setLastRun({ ...result, ...counts });
      
      if (result.ok) {
        if (counts.setsProcessed > 0 && counts.cardsProcessed === 0) {
          toast.success(`Sync completed: ${counts.setsProcessed} sets queued`);
          setIsActiveSync(true);
        } else if (counts.cardsProcessed > 0) {
          toast.success(`Sync completed: ${counts.cardsProcessed} cards processed`);
        } else if (counts.setsProcessed > 0) {
          toast.success(`Sync completed: ${counts.setsProcessed} sets processed`);
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
    setLiveDelta({ sets: 0, cards: 0 }); // Reset delta on new sync
    
    try {
      const result = await runSync(mode, { since: incrementalDate });
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
          toast.success(`Auto-drain complete! Processed ${totalProcessed} items total`);
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
      toast.error('Auto-drain failed', {
        description: error.message
      });
      setIsActiveSync(false);
    } finally {
      setDraining(false);
    }
  };

  const handleProcessAll = async () => {
    if (!mode) return;

    setProcessingAll(true);
    setIsActiveSync(true); // Start active polling
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
        
        // Increment liveDelta immediately for each processed item
        const counts = normalizeApiCounts(result);
        if (counts.cardsProcessed > 0) {
          setLiveDelta(prev => ({ 
            sets: prev.sets + (counts.setsProcessed || 0), 
            cards: prev.cards + counts.cardsProcessed 
          }));
        }
        
        processed++;
        
        // Update stats more frequently for better live feedback
        if (processed % 2 === 0) {
          await Promise.all([loadQueueStats(), loadStats()]);
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
      
      // Final update
      await loadAllData();
      
    } catch (error: any) {
      toast.error('Failed to process queue', {
        description: error.message
      });
    } finally {
      setProcessingAll(false);
      // Let polling handle the final isActiveSync state
    }
  };

  const handleRetryError = async (error: SyncError) => {
    if (!mode) return;
    
    setRetryingError(error.set_id);
    setSetId(error.set_id);
    
    try {
      const result = await runSync(mode, { setId: error.set_id });
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

      {/* Reset & Rebuild Catalog */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Reset & Rebuild Catalog
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResetCatalogSection />
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