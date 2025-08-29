// Premium Sync Manager with parallel processing and performance tracking
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

export interface PerformanceMetrics {
  itemsPerSecond: number;
  apiRequestsPerItem: number;
  databaseWritesPerSecond: number;
  memoryUsageMB: number;
  improvement: {
    speedMultiplier: number;
    vsBaseline: string;
    description: string;
  };
}

export class SyncManagerPremium {
  private supabase: any;
  private config: Map<string, any> = new Map();
  private startTime = 0;
  private itemsProcessed = 0;
  private apiRequestsUsed = 0;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // Load premium configuration values
  async loadConfig(): Promise<void> {
    const { data } = await this.supabase
      .from('sync_v3.config')
      .select('key, value');
    
    if (data) {
      data.forEach((item: any) => {
        try {
          // Try parsing as JSON first, fallback to string
          this.config.set(item.key, JSON.parse(item.value));
        } catch {
          this.config.set(item.key, item.value);
        }
      });
    }

    console.log(`📋 Loaded ${this.config.size} premium config settings`);
  }

  // Get configuration value with fallback
  getConfig(key: string, defaultValue?: any): any {
    return this.config.get(key) ?? defaultValue;
  }

  // Record API usage for monitoring
  async recordApiUsage(requestCount: number = 1): Promise<void> {
    if (this.getConfig('track_api_usage', true)) {
      try {
        await this.supabase.rpc('sync_v3.record_api_usage', {
          request_count: requestCount
        });
        this.apiRequestsUsed += requestCount;
      } catch (error) {
        console.error('Failed to record API usage:', error);
      }
    }
  }

  // Get current API usage statistics
  async getApiUsageStats(): Promise<any> {
    try {
      const { data } = await this.supabase.rpc('sync_v3.get_api_usage_stats');
      return data;
    } catch (error) {
      console.error('Failed to get API usage stats:', error);
      return null;
    }
  }

  // Calculate performance metrics with baseline comparison
  async calculatePerformanceMetrics(
    jobType: string,
    game?: string,
    totalItems: number = this.itemsProcessed
  ): Promise<PerformanceMetrics> {
    const duration = (Date.now() - this.startTime) / 1000; // seconds
    const itemsPerSecond = totalItems / Math.max(duration, 1);
    const apiRequestsPerItem = this.apiRequestsUsed / Math.max(totalItems, 1);

    // Get baseline performance for comparison
    const { data: baseline } = await this.supabase
      .from('sync_v3.performance_baselines')
      .select('*')
      .eq('sync_type', jobType)
      .eq('game', game || null)
      .single();

    const baselineSpeed = baseline?.baseline_items_per_second || 5;
    const speedMultiplier = itemsPerSecond / baselineSpeed;

    let improvementDescription = '';
    if (speedMultiplier >= 3) {
      improvementDescription = `🚀 EXCELLENT! ${speedMultiplier.toFixed(1)}x faster than baseline`;
    } else if (speedMultiplier >= 2) {
      improvementDescription = `⚡ GREAT! ${speedMultiplier.toFixed(1)}x faster than baseline`;
    } else if (speedMultiplier >= 1.5) {
      improvementDescription = `✅ GOOD! ${speedMultiplier.toFixed(1)}x faster than baseline`;
    } else {
      improvementDescription = `⚠️  Only ${speedMultiplier.toFixed(1)}x baseline speed`;
    }

    return {
      itemsPerSecond,
      apiRequestsPerItem,
      databaseWritesPerSecond: itemsPerSecond * 0.8, // Estimate
      memoryUsageMB: (process as any)?.memoryUsage?.()?.heapUsed / 1024 / 1024 || 0,
      improvement: {
        speedMultiplier,
        vsBaseline: `${baselineSpeed.toFixed(1)} items/sec`,
        description: improvementDescription
      }
    };
  }

  // Enhanced job creation with performance tracking
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
        source: 'justtcg-premium',
        game: options.game,
        set_id: options.set_id,
        card_id: options.card_id,
        total_items: options.total_items || 0,
        processed_items: 0,
        retry_count: 0,
        max_retries: this.getConfig('max_retries', 3),
        results: {},
        metrics: {}
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create sync job: ${error.message}`);
    }

    this.startTime = Date.now();
    this.itemsProcessed = 0;
    this.apiRequestsUsed = 0;

    console.log(`🎯 Created premium sync job ${data.id} for ${jobType}${options.game ? ` (${options.game})` : ''}`);
    return data.id;
  }

  async startJob(jobId: string): Promise<void> {
    const { error } = await this.supabase.rpc('sync_v3.start_job', {
      job_id: jobId
    });

    if (error) {
      throw new Error(`Failed to start job: ${error.message}`);
    }

    this.startTime = Date.now();
    console.log(`🚀 Started premium sync job ${jobId}`);
  }

  // Enhanced progress tracking with real-time performance stats
  async updateProgress(
    jobId: string,
    processed: number,
    total?: number,
    showRealTimeStats: boolean = true
  ): Promise<void> {
    this.itemsProcessed = processed;

    if (showRealTimeStats && this.getConfig('show_realtime_stats', true)) {
      const duration = (Date.now() - this.startTime) / 1000;
      const itemsPerSecond = processed / Math.max(duration, 1);
      const eta = total ? ((total - processed) / Math.max(itemsPerSecond, 1)) : null;

      console.log(`📊 Progress: ${processed}${total ? `/${total}` : ''} | ${itemsPerSecond.toFixed(1)} items/sec${eta ? ` | ETA: ${Math.round(eta)}s` : ''}`);
    }

    const { error } = await this.supabase.rpc('sync_v3.update_job_progress', {
      job_id: jobId,
      processed: processed,
      total: total
    });

    if (error) {
      console.error(`Failed to update job progress: ${error.message}`);
    }
  }

  // Parallel batch processor with premium settings
  async parallelBatchProcess<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options: {
      batchSize?: number;
      maxConcurrency?: number;
      onProgress?: (processed: number, total: number) => Promise<void>;
      onBatchComplete?: (batchResults: R[], batchIndex: number) => Promise<void>;
    } = {}
  ): Promise<R[]> {
    const batchSize = options.batchSize || this.getConfig('db_batch_size', 50);
    const maxConcurrency = options.maxConcurrency || this.getConfig('parallel_set_count', 3);
    
    console.log(`🔄 Starting parallel batch processing: ${items.length} items, ${batchSize} per batch, ${maxConcurrency} concurrent`);

    const results: R[] = [];
    const batches: T[][] = [];
    
    // Create batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process batches in parallel with concurrency limit
    const semaphore = new Array(maxConcurrency).fill(0);
    let completedBatches = 0;

    const processBatch = async (batch: T[], batchIndex: number): Promise<R[]> => {
      try {
        const batchResults = await processor(batch);
        
        if (options.onBatchComplete) {
          await options.onBatchComplete(batchResults, batchIndex);
        }

        completedBatches++;
        if (options.onProgress) {
          await options.onProgress(
            completedBatches * batchSize, 
            items.length
          );
        }

        console.log(`✅ Completed batch ${batchIndex + 1}/${batches.length} (${batchResults.length} items)`);
        return batchResults;
      } catch (error) {
        console.error(`❌ Batch ${batchIndex + 1} failed:`, error);
        throw error;
      }
    };

    // Process batches with concurrency control
    const promises: Promise<R[]>[] = [];
    for (let i = 0; i < batches.length; i++) {
      const promise = processBatch(batches[i], i);
      promises.push(promise);

      // Wait if we've reached the concurrency limit
      if (promises.length >= maxConcurrency) {
        const batchResults = await Promise.race(promises);
        results.push(...batchResults);
        
        // Remove completed promise
        const completedIndex = promises.findIndex(async p => {
          try { await p; return true; } catch { return true; }
        });
        if (completedIndex !== -1) {
          promises.splice(completedIndex, 1);
        }
      }

      // Memory cleanup
      if (i % (maxConcurrency * 2) === 0 && global.gc) {
        global.gc();
      }
    }

    // Wait for remaining promises
    const remainingResults = await Promise.all(promises);
    for (const batchResults of remainingResults) {
      results.push(...batchResults);
    }

    console.log(`🎉 Parallel processing completed: ${results.length} total results`);
    return results;
  }

  // Enhanced job completion with performance metrics
  async completeJob(
    jobId: string,
    status: 'completed' | 'failed' | 'cancelled',
    results: Record<string, any> = {},
    metrics: Record<string, any> = {},
    errorMessage?: string
  ): Promise<void> {
    // Calculate final performance metrics
    if (status === 'completed' && results.game) {
      const perfMetrics = await this.calculatePerformanceMetrics(
        results.sync_type || 'unknown',
        results.game,
        results.total || this.itemsProcessed
      );

      metrics.performance = perfMetrics;
      
      // Log performance improvement
      if (this.getConfig('log_sync_speed_improvements', true)) {
        console.log(`\n🎯 PERFORMANCE REPORT for Job ${jobId}:`);
        console.log(`📈 Speed: ${perfMetrics.itemsPerSecond.toFixed(1)} items/sec`);
        console.log(`📊 API Efficiency: ${perfMetrics.apiRequestsPerItem.toFixed(2)} requests/item`);
        console.log(`🚀 ${perfMetrics.improvement.description}`);
        console.log(`📋 Baseline: ${perfMetrics.improvement.vsBaseline}\n`);
      }
    }

    const { error } = await this.supabase.rpc('sync_v3.complete_job', {
      job_id: jobId,
      job_status: status,
      job_results: results,
      job_metrics: metrics,
      error_msg: errorMessage
    });

    if (error) {
      console.error(`Failed to complete job: ${error.message}`);
      
      // Fallback direct update
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

    const duration = (Date.now() - this.startTime) / 1000;
    console.log(`🏁 Job ${jobId} ${status} in ${duration.toFixed(1)}s`);
  }

  // Check API usage and warn if approaching limits
  async checkApiUsageLimits(): Promise<void> {
    const usage = await this.getApiUsageStats();
    if (!usage) return;

    const threshold = this.getConfig('usage_alert_threshold', 0.8);
    
    if (usage.current_hour.percentage > threshold * 100) {
      console.warn(`⚠️  API usage warning: ${usage.current_hour.percentage}% of hourly limit used`);
    }
    
    if (usage.daily.percentage > threshold * 100) {
      console.warn(`⚠️  API usage warning: ${usage.daily.percentage}% of daily limit used`);
    }
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