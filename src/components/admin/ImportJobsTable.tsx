import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, RotateCcw, X } from 'lucide-react';
import { formatTimeAgo } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportJob {
  id: string;
  source: string;
  game: string;
  set_id: string | null;
  set_code: string | null;
  total: number | null;
  inserted: number | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ImportJobsTableProps {
  game: string;
  refreshInterval?: number;
}

export function ImportJobsTable({ game, refreshInterval = 5000 }: ImportJobsTableProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueingAll, setQueueingAll] = useState(false);
  const [retryingJobs, setRetryingJobs] = useState<Set<string>>(new Set());
  const [cancellingJobs, setCancellingJobs] = useState<Set<string>>(new Set());

  const loadJobs = async () => {
    try {
      const SUPABASE_URL = "https://dmpoandoydaqxhzdjnmk.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk";
      
      const url = new URL(`${SUPABASE_URL}/functions/v1/catalog-sync-status`);
      url.searchParams.set('game', game);
      url.searchParams.set('limit', '50');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading import jobs:', error);
      toast.error('Failed to load import jobs', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleQueueAll = async () => {
    setQueueingAll(true);
    try {
      const gameMap: Record<string, string> = {
        'mtg': 'magic-the-gathering',
        'pokemon': 'pokemon',
        'pokemon-japan': 'pokemon-japan'
      };
      
      const externalGame = gameMap[game];
      if (!externalGame) {
        throw new Error(`Unsupported game: ${game}`);
      }

      const { data, error } = await supabase.functions.invoke('catalog-sync-justtcg', {
        body: { game: externalGame }
      });

      if (error) throw error;
      
      toast.success(`Started sync for ${data?.queued_sets || 0} sets`);
      loadJobs(); // Refresh the jobs list
    } catch (error: any) {
      console.error('Error queuing all sets:', error);
      toast.error('Failed to queue all sets', { description: error.message });
    } finally {
      setQueueingAll(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobs(prev => new Set(prev).add(jobId));
    try {
      const { data, error } = await supabase.functions.invoke('catalog-sync-retry', {
        body: { job_id: jobId }
      });

      if (error) throw error;
      
      toast.success('Job retry initiated');
      loadJobs(); // Refresh the jobs list
    } catch (error: any) {
      console.error('Error retrying job:', error);
      toast.error('Failed to retry job', { description: error.message });
    } finally {
      setRetryingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setCancellingJobs(prev => new Set(prev).add(jobId));
    try {
      const { data, error } = await supabase.functions.invoke('catalog-sync-cancel', {
        body: { job_id: jobId }
      });

      if (error) throw error;
      
      toast.success('Job cancelled');
      loadJobs(); // Refresh the jobs list
    } catch (error: any) {
      console.error('Error cancelling job:', error);
      toast.error('Failed to cancel job', { description: error.message });
    } finally {
      setCancellingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const handleCancelAllRunning = async () => {
    const runningJobs = jobs.filter(job => ['queued', 'running'].includes(job.status));
    if (runningJobs.length === 0) {
      toast.info('No active jobs to cancel');
      return;
    }

    for (const job of runningJobs) {
      try {
        await handleCancelJob(job.id);
      } catch (error) {
        console.error(`Failed to cancel job ${job.id}:`, error);
      }
    }
  };

  useEffect(() => {
    loadJobs();
    
    const interval = setInterval(loadJobs, refreshInterval);
    return () => clearInterval(interval);
  }, [game, refreshInterval]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'succeeded':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'secondary';
      case 'running':
        return 'default';
      case 'succeeded':
        return 'secondary';
      case 'failed':
        return 'destructive';
      case 'cancelled':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getDuration = (job: ImportJob) => {
    if (!job.started_at) return null;
    
    const start = new Date(job.started_at);
    const end = job.finished_at ? new Date(job.finished_at) : new Date();
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.round(duration / 60)}m`;
    return `${Math.round(duration / 3600)}h`;
  };

  const getProgress = (job: ImportJob) => {
    if (job.status === 'succeeded' && job.total && job.inserted) {
      return (job.inserted / job.total) * 100;
    }
    if (job.status === 'running') return undefined; // Indeterminate
    if (job.status === 'succeeded') return 100;
    if (job.status === 'failed') return 0;
    return 0;
  };

  // Calculate summary stats
  const summary = jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    if (job.status === 'succeeded' && job.inserted) {
      acc.totalCards += job.inserted;
    }
    return acc;
  }, { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, totalCards: 0 } as any);

  const activeJobs = jobs.filter(job => ['queued', 'running'].includes(job.status));
  const hasActiveJobs = activeJobs.length > 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading import jobs...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Recent Imports
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleQueueAll}
              disabled={queueingAll}
              size="sm"
              variant="outline"
            >
              {queueingAll ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Queue All Pending
            </Button>
            {hasActiveJobs && (
              <>
                <Button
                  onClick={handleCancelAllRunning}
                  size="sm"
                  variant="destructive"
                  disabled={activeJobs.length === 0}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel All Running
                </Button>
                <Badge variant="secondary" className="animate-pulse">
                  {activeJobs.length} active
                </Badge>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        {/* Summary */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-6 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-500">{summary.queued}</div>
              <div className="text-xs text-muted-foreground">Queued</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{summary.running}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">{summary.succeeded}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-600">{summary.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-yellow-600">{summary.cancelled}</div>
              <div className="text-xs text-muted-foreground">Cancelled</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-primary">{summary.totalCards}</div>
              <div className="text-xs text-muted-foreground">Cards</div>
            </div>
          </div>
        )}

        {/* Jobs Table */}
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No import jobs found. Click "Queue All Pending" to start importing sets.
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  {getStatusIcon(job.status)}
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {job.set_code || job.set_id || '—'}
                      </span>
                      <Badge variant={getStatusColor(job.status) as any} className="text-xs">
                        {job.status}
                      </Badge>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      {formatTimeAgo(job.created_at)}
                      {job.inserted !== null && job.total !== null && (
                        <span className="ml-2">
                          {job.inserted}/{job.total} cards
                        </span>
                      )}
                      {getDuration(job) && (
                        <span className="ml-2">({getDuration(job)})</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {job.status === 'failed' && (
                      <Button
                        onClick={() => handleRetryJob(job.id)}
                        disabled={retryingJobs.has(job.id)}
                        size="sm"
                        variant="outline"
                      >
                        {retryingJobs.has(job.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                    
                    {['queued', 'running'].includes(job.status) && (
                      <Button
                        onClick={() => handleCancelJob(job.id)}
                        disabled={cancellingJobs.has(job.id)}
                        size="sm"
                        variant="destructive"
                      >
                        {cancellingJobs.has(job.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Progress indicator */}
                  {job.status === 'running' && (
                    <div className="w-20">
                      <Progress value={undefined} className="h-2" />
                    </div>
                  )}
                  
                  {job.status === 'succeeded' && job.total && job.inserted && (
                    <div className="w-20">
                      <Progress value={getProgress(job)} className="h-2" />
                    </div>
                  )}

                  {/* Error indicator */}
                  {job.error && (
                    <div className="max-w-xs truncate text-sm text-red-600" title={job.error}>
                      {job.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}