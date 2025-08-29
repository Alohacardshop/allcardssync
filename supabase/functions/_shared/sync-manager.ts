// Sync Manager for job tracking and progress management
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface SyncJob {
  id: string;
  job_type: 'games' | 'sets' | 'cards';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  source: string;
  game?: string;
  set_id?: string;
  card_id?: string;
  total_items: number;
  processed_items: number;
  progress_percentage: number;
  items_per_second?: number;
  estimated_completion_at?: string;
  retry_count: number;
  max_retries: number;
  error_message?: string;
  results: Record<string, any>;
  metrics: Record<string, any>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface SyncResult {
  success: boolean;
  job_id: string;
  message: string;
  stats?: Record<string, any>;
  error?: string;
}

export class SyncManager {
  private supabase: any;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async createJob(
    jobType: 'games' | 'sets' | 'cards',
    options: {
      game?: string;
      set_id?: string;
      card_id?: string;
      total_items?: number;
    } = {}
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('sync_v3.jobs')
      .insert({
        job_type: jobType,
        status: 'queued',
        source: 'justtcg',
        game: options.game,
        set_id: options.set_id,
        card_id: options.card_id,
        total_items: options.total_items || 0,
        processed_items: 0,
        retry_count: 0,
        max_retries: 3,
        results: {},
        metrics: {}
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create sync job: ${error.message}`);
    }

    return data.id;
  }

  async startJob(jobId: string): Promise<void> {
    const { error } = await this.supabase.rpc('sync_v3.start_job', {
      job_id: jobId
    });

    if (error) {
      throw new Error(`Failed to start job: ${error.message}`);
    }
  }

  async updateProgress(
    jobId: string,
    processed: number,
    total?: number
  ): Promise<void> {
    const { error } = await this.supabase.rpc('sync_v3.update_job_progress', {
      job_id: jobId,
      processed: processed,
      total: total
    });

    if (error) {
      console.error(`Failed to update job progress: ${error.message}`);
      // Don't throw - progress updates are not critical
    }
  }

  async completeJob(
    jobId: string,
    status: 'completed' | 'failed' | 'cancelled',
    results: Record<string, any> = {},
    metrics: Record<string, any> = {},
    errorMessage?: string
  ): Promise<void> {
    const { error } = await this.supabase.rpc('sync_v3.complete_job', {
      job_id: jobId,
      job_status: status,
      job_results: results,
      job_metrics: metrics,
      error_msg: errorMessage
    });

    if (error) {
      console.error(`Failed to complete job: ${error.message}`);
      // Try direct update as fallback
      await this.supabase
        .from('sync_v3.jobs')
        .update({
          status,
          completed_at: new Date().toISOString(),
          results,
          metrics,
          error_message: errorMessage
        })
        .eq('id', jobId);
    }
  }

  async getJob(jobId: string): Promise<SyncJob | null> {
    const { data, error } = await this.supabase
      .from('sync_v3.jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  async checkDuplicateSync(
    game?: string,
    setId?: string
  ): Promise<{ should_skip: boolean; reason?: string }> {
    if (!game || !setId) {
      return { should_skip: false };
    }

    // Check if set is already synced
    const { data: setData } = await this.supabase
      .from('catalog_v2.sets')
      .select('sync_status, card_count, last_synced_at')
      .eq('game', game)
      .eq('provider_id', setId)
      .single();

    if (setData?.sync_status === 'synced' && setData.card_count > 0) {
      const hoursSinceSync = setData.last_synced_at 
        ? (Date.now() - new Date(setData.last_synced_at).getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (hoursSinceSync < 24) {
        return {
          should_skip: true,
          reason: `Set was synced ${Math.round(hoursSinceSync)} hours ago`
        };
      }
    }

    // Check for running sync jobs
    const { data: runningJobs } = await this.supabase
      .from('sync_v3.jobs')
      .select('id')
      .eq('job_type', 'cards')
      .eq('game', game)
      .eq('set_id', setId)
      .eq('status', 'running')
      .limit(1);

    if (runningJobs?.length > 0) {
      return {
        should_skip: true,
        reason: 'Another sync job is already running for this set'
      };
    }

    return { should_skip: false };
  }

  // Memory optimization helper
  async batchProcess<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize = 25,
    onProgress?: (processed: number, total: number) => Promise<void>
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);

      // Report progress
      if (onProgress) {
        await onProgress(Math.min(i + batchSize, items.length), items.length);
      }

      // Memory cleanup between batches
      if (global.gc && i % (batchSize * 4) === 0) {
        global.gc();
      }
    }

    return results;
  }

  // Helper to create standardized sync results
  createResult(
    success: boolean,
    jobId: string,
    message: string,
    stats?: Record<string, any>,
    error?: string
  ): SyncResult {
    return {
      success,
      job_id: jobId,
      message,
      stats,
      error
    };
  }
}