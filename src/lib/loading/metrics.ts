import { supabase } from '@/integrations/supabase/client';

interface LoadingMetrics {
  pageType: string;
  timeToFirstSkeleton?: number;
  timeToDataVisible?: number;
  totalRetries: number;
  percentTimePaused: number;
  errorCount: number;
  refreshCount: number;
  userDismissedRefresh: number;
  loadingPhaseBreakdown: Record<string, number>;
}

class LoadingMetricsTracker {
  private metrics: Map<string, LoadingMetrics> = new Map();
  private startTimes: Map<string, number> = new Map();
  private phaseStartTimes: Map<string, number> = new Map();
  private lastReportTime = Date.now();
  private sessionId = Math.random().toString(36).substring(7);

  markStart(phase: string, pageType: string = 'unknown') {
    const key = `${pageType}-${phase}`;
    this.startTimes.set(key, Date.now());
    this.phaseStartTimes.set(phase, Date.now());
    
    if (!this.metrics.has(pageType)) {
      this.metrics.set(pageType, {
        pageType,
        totalRetries: 0,
        percentTimePaused: 0,
        errorCount: 0,
        refreshCount: 0,
        userDismissedRefresh: 0,
        loadingPhaseBreakdown: {},
      });
    }
  }

  markEnd(phase: string, pageType: string = 'unknown') {
    const key = `${pageType}-${phase}`;
    const startTime = this.startTimes.get(key);
    const phaseStartTime = this.phaseStartTimes.get(phase);
    
    if (!startTime || !phaseStartTime) return;

    const duration = Date.now() - phaseStartTime;
    const metrics = this.metrics.get(pageType);
    
    if (metrics) {
      // Update phase breakdown
      metrics.loadingPhaseBreakdown[phase] = (metrics.loadingPhaseBreakdown[phase] || 0) + duration;
      
      // Update specific metrics
      if (phase === 'skeleton' && !metrics.timeToFirstSkeleton) {
        metrics.timeToFirstSkeleton = Date.now() - startTime;
      }
      
      if (phase === 'data' && !metrics.timeToDataVisible) {
        metrics.timeToDataVisible = Date.now() - startTime;
      }
    }

    this.startTimes.delete(key);
    this.phaseStartTimes.delete(phase);
  }

  incrementCounter(pageType: string, counter: keyof Pick<LoadingMetrics, 'totalRetries' | 'errorCount' | 'refreshCount' | 'userDismissedRefresh'>) {
    const metrics = this.metrics.get(pageType);
    if (metrics) {
      (metrics[counter] as number)++;
    }
  }

  updatePercentTimePaused(pageType: string, percent: number) {
    const metrics = this.metrics.get(pageType);
    if (metrics) {
      metrics.percentTimePaused = percent;
    }
  }

  async logError(pageType: string, error: any, context: Record<string, any> = {}) {
    this.incrementCounter(pageType, 'errorCount');
    
    try {
      await supabase.rpc('add_system_log', {
        level_in: 'ERROR',
        message_in: `${pageType}_loading_error`,
        context_in: {
          error: error?.message || 'Unknown error',
          code: error?.code,
          pageType,
          sessionId: this.sessionId,
          ...context,
        },
        source_in: 'ui_client',
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  async report(pageType?: string) {
    const now = Date.now();
    const timeSinceLastReport = now - this.lastReportTime;
    
    // Only report every 5 minutes to avoid spam
    if (timeSinceLastReport < 300_000) {
      return;
    }

    const metricsToReport = pageType 
      ? [this.metrics.get(pageType)].filter(Boolean)
      : Array.from(this.metrics.values());

    for (const metrics of metricsToReport) {
      if (!metrics) continue;

      try {
        await supabase.rpc('add_system_log', {
          level_in: 'INFO',
          message_in: 'loading_performance_metrics',
          context_in: {
            ...metrics,
            sessionId: this.sessionId,
            reportInterval: timeSinceLastReport,
          },
          source_in: 'ui_client',
        });
      } catch (error) {
        console.error('Failed to report metrics:', error);
      }
    }

    this.lastReportTime = now;
    
    // Reset metrics after reporting
    if (pageType) {
      this.metrics.delete(pageType);
    } else {
      this.metrics.clear();
    }
  }

  // Get current metrics without reporting
  getMetrics(pageType: string): LoadingMetrics | undefined {
    return this.metrics.get(pageType);
  }

  // Reset all metrics
  reset() {
    this.metrics.clear();
    this.startTimes.clear();
    this.phaseStartTimes.clear();
    this.sessionId = Math.random().toString(36).substring(7);
  }
}

// Singleton metrics tracker
const metricsTracker = new LoadingMetricsTracker();

export { metricsTracker };

// Convenience functions
export function markStart(phase: string, pageType?: string) {
  metricsTracker.markStart(phase, pageType);
}

export function markEnd(phase: string, pageType?: string) {
  metricsTracker.markEnd(phase, pageType);
}

export function logError(pageType: string, error: any, context?: Record<string, any>) {
  return metricsTracker.logError(pageType, error, context);
}

export function reportMetrics(pageType?: string) {
  return metricsTracker.report(pageType);
}

export function incrementRetry(pageType: string) {
  metricsTracker.incrementCounter(pageType, 'totalRetries');
}

export function incrementRefresh(pageType: string) {
  metricsTracker.incrementCounter(pageType, 'refreshCount');
}

export function incrementDismissedRefresh(pageType: string) {
  metricsTracker.incrementCounter(pageType, 'userDismissedRefresh');
}

// Hook for React components to easily track loading phases
export function useLoadingMetrics(pageType: string) {
  return {
    markStart: (phase: string) => markStart(phase, pageType),
    markEnd: (phase: string) => markEnd(phase, pageType),
    logError: (error: any, context?: Record<string, any>) => logError(pageType, error, context),
    reportMetrics: () => reportMetrics(pageType),
    incrementRetry: () => incrementRetry(pageType),
    incrementRefresh: () => incrementRefresh(pageType),
    incrementDismissedRefresh: () => incrementDismissedRefresh(pageType),
  };
}