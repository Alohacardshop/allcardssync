import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, TrendingUp, Database, Activity } from "lucide-react";
import { tcgSupabase } from "@/integrations/supabase/client";
import { usePollingWithCircuitBreaker } from "@/hooks/usePollingWithCircuitBreaker";
import { logger } from '@/lib/logger';

interface PricingJobRun {
  id: string;
  game: string;
  expected_batches: number;
  actual_batches: number;
  cards_processed: number;
  variants_updated: number;
  duration_ms: number;
  started_at: string;
  finished_at: string;
  created_at: string;
}

export function PricingJobsMonitor() {
  const fetchJobRuns = async (): Promise<PricingJobRun[]> => {
    const { data, error } = await tcgSupabase
      .from('pricing_job_runs')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      logger.error('Failed to fetch pricing job runs from TCG DB', error instanceof Error ? error : new Error(String(error)), {}, 'pricing-jobs-monitor');
      throw new Error(`Failed to fetch pricing jobs: ${error.message}`);
    }

    return data || [];
  };

  const { 
    data: jobRuns, 
    isLoading: loading, 
    error, 
    circuitBreaker, 
    retry,
    currentInterval 
  } = usePollingWithCircuitBreaker(
    fetchJobRuns,
    {
      enabled: true,
      baseInterval: 10 * 60 * 1000, // 10 minutes (increased from 5 minutes)
      maxInterval: 30 * 60 * 1000, // 30 minutes max
      maxFailures: 2,
      circuitOpenTime: 2 * 60 * 1000, // 2 minutes
      onError: (error) => logger.error('Polling error', error, {}, 'pricing-jobs-monitor'),
      onCircuitOpen: () => logger.warn('Circuit breaker opened', {}, 'pricing-jobs-monitor'),
      onCircuitClose: () => logger.info('Circuit breaker closed', {}, 'pricing-jobs-monitor'),
    }
  );

  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const getGameBadgeColor = (game: string) => {
    switch (game) {
      case 'pokemon': return 'bg-blue-600';
      case 'pokemon-japan': return 'bg-purple-600';
      case 'mtg': return 'bg-orange-600';
      default: return 'bg-gray-600';
    }
  };

  const calculateCallsUsed = (cardsProcessed: number) => {
    return Math.ceil(cardsProcessed / 200); // PAGE_SIZE = 200
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pricing Jobs (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Activity className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading pricing jobs...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Pricing Jobs (24h)
            </div>
            {circuitBreaker.isOpen && (
              <Badge variant="destructive" className="text-xs">
                Circuit Open
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="destructive">Failed to Load</Badge>
          <p className="text-sm text-muted-foreground mt-2">
            {error.message}
          </p>
          {circuitBreaker.isOpen && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Circuit breaker is open. Next attempt in {Math.max(0, Math.ceil((circuitBreaker.nextAttemptTime - Date.now()) / 1000))}s
              </p>
              <Button onClick={retry} size="sm" variant="outline">
                Retry Now
              </Button>
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            Polling interval: {Math.round(currentInterval / 60000)}min
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!jobRuns || jobRuns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pricing Jobs (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pricing jobs found in the last 24 hours</p>
            <p className="text-sm mt-2">Nightly pricing refreshes will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pricing Jobs (24h)
            <Badge variant="secondary">{jobRuns.length} runs</Badge>
          </div>
          <div className="flex gap-2">
            {circuitBreaker.isOpen && (
              <Badge variant="destructive" className="text-xs">
                Circuit Open
              </Badge>
            )}
            {circuitBreaker.failureCount > 0 && !circuitBreaker.isOpen && (
              <Badge variant="secondary" className="text-xs">
                {circuitBreaker.failureCount} failures
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {Math.round(currentInterval / 60000)}min interval
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {jobRuns.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-muted/30"
            >
              <div className="flex items-center gap-4">
                <Badge className={`${getGameBadgeColor(run.game)} text-white`}>
                  {run.game.toUpperCase()}
                </Badge>
                
                <div className="flex flex-col">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">
                      {run.expected_batches} expected → {run.actual_batches} actual batches
                    </span>
                    <span className="text-muted-foreground">
                      {run.cards_processed.toLocaleString()} cards processed
                    </span>
                    <span className="text-green-600">
                      {run.variants_updated.toLocaleString()} variants updated
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(run.duration_ms)}
                    </span>
                    <span>
                      API calls: {calculateCallsUsed(run.cards_processed)}
                    </span>
                    <span>
                      {formatTimestamp(run.started_at)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge 
                  variant={run.actual_batches === run.expected_batches ? "default" : "secondary"}
                  className={run.actual_batches === run.expected_batches ? "bg-green-600" : ""}
                >
                  {run.actual_batches === run.expected_batches ? "Complete" : "Partial"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">
                {jobRuns.reduce((sum, run) => sum + run.cards_processed, 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Total Cards</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {jobRuns.reduce((sum, run) => sum + run.variants_updated, 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Variants Updated</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {jobRuns.reduce((sum, run) => sum + calculateCallsUsed(run.cards_processed), 0)}
              </div>
              <div className="text-xs text-muted-foreground">API Calls</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {formatDuration(jobRuns.reduce((sum, run) => sum + run.duration_ms, 0) / jobRuns.length)}
              </div>
              <div className="text-xs text-muted-foreground">Avg Duration</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}