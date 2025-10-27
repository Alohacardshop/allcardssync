import { useEffect, useRef, useCallback, useState } from 'react';
import { logger } from '@/lib/logger';

interface PollingOptions {
  interval?: number;
  enabled?: boolean;
  maxRetries?: number;
  backoffMultiplier?: number;
  maxInterval?: number;
}

/**
 * A stable polling hook that prevents cascading refreshes and implements circuit breaker pattern
 */
export function useStablePolling<T>(
  queryFn: () => Promise<T>,
  options: PollingOptions = {}
) {
  const {
    interval = 30000,
    enabled = true,
    maxRetries = 3,
    backoffMultiplier = 2,
    maxInterval = 300000 // 5 minutes max
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [currentInterval, setCurrentInterval] = useState(interval);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef(false);
  const lastExecutionRef = useRef<number>(0);

  const executeQuery = useCallback(async () => {
    // Prevent concurrent executions
    if (isExecutingRef.current) {
      logger.debug('Skipping concurrent execution', {}, 'stable-polling');
      return;
    }

    // Prevent too frequent executions (minimum 5 seconds between calls)
    const now = Date.now();
    if (now - lastExecutionRef.current < 5000) {
      logger.debug('Skipping too frequent execution', { 
        timeSinceLastExecution: now - lastExecutionRef.current 
      }, 'stable-polling');
      return;
    }

    isExecutingRef.current = true;
    lastExecutionRef.current = now;
    setIsPolling(true);
    setError(null);

    try {
      await queryFn();
      // Reset retry count and interval on success
      setRetryCount(0);
      setCurrentInterval(interval);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      
      // Implement exponential backoff
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      if (newRetryCount >= maxRetries) {
        // Circuit breaker - increase interval significantly
        const newInterval = Math.min(currentInterval * backoffMultiplier, maxInterval);
        setCurrentInterval(newInterval);
        logger.warn('Circuit breaker activated', { 
          retryCount: newRetryCount, 
          newInterval, 
          maxRetries 
        }, 'stable-polling');
      }
    } finally {
      isExecutingRef.current = false;
      setIsPolling(false);
    }
  }, [queryFn, retryCount, currentInterval, interval, maxRetries, backoffMultiplier, maxInterval]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (!enabled) return;

    // Execute immediately
    executeQuery();

    // Set up interval
    intervalRef.current = setInterval(executeQuery, currentInterval);
  }, [executeQuery, enabled, currentInterval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetCircuitBreaker = useCallback(() => {
    setRetryCount(0);
    setCurrentInterval(interval);
    setError(null);
  }, [interval]);

  // Effect to manage polling lifecycle
  useEffect(() => {
    if (enabled) {
      startPolling();
    } else {
      stopPolling();
    }

    return stopPolling;
  }, [enabled, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isPolling,
    error,
    retryCount,
    currentInterval,
    resetCircuitBreaker,
    executeNow: executeQuery
  };
}