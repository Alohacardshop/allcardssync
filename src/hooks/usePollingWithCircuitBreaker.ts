import { useCallback, useEffect, useRef, useState } from 'react';

interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

interface PollingOptions {
  enabled?: boolean;
  baseInterval?: number; // Base polling interval in ms (default: 60000 = 1 minute)
  maxInterval?: number; // Maximum interval between polls (default: 5 minutes)
  maxFailures?: number; // Max failures before circuit opens (default: 3)
  circuitOpenTime?: number; // Time to keep circuit open in ms (default: 30 seconds)
  exponentialBackoff?: boolean; // Enable exponential backoff (default: true)
  onError?: (error: Error) => void;
  onSuccess?: () => void;
  onCircuitOpen?: () => void;
  onCircuitClose?: () => void;
}

export function usePollingWithCircuitBreaker<T>(
  queryFn: () => Promise<T>,
  options: PollingOptions = {}
) {
  const {
    enabled = true,
    baseInterval = 60000, // 1 minute default
    maxInterval = 5 * 60 * 1000, // 5 minutes max
    maxFailures = 3,
    circuitOpenTime = 30000, // 30 seconds
    exponentialBackoff = true,
    onError,
    onSuccess,
    onCircuitOpen,
    onCircuitClose,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState>({
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<number>(baseInterval);

  const executeQuery = useCallback(async () => {
    const now = Date.now();
    
    // Check if circuit is open and if we should attempt to close it
    if (circuitBreaker.isOpen) {
      if (now < circuitBreaker.nextAttemptTime) {
        console.log('[Circuit Breaker] Circuit is open, skipping query');
        return;
      }
      // Half-open state - try one request
      console.log('[Circuit Breaker] Attempting to close circuit (half-open state)');
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[Polling] Executing query...');
      const result = await queryFn();
      
      // Success - reset circuit breaker and interval
      setData(result);
      setCircuitBreaker({
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      });
      intervalRef.current = baseInterval;
      
      onSuccess?.();
      
      if (circuitBreaker.isOpen) {
        console.log('[Circuit Breaker] Circuit closed after successful request');
        onCircuitClose?.();
      }
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      console.error('[Polling] Query failed:', error.message);
      
      setError(error);
      onError?.(error);
      
      const newFailureCount = circuitBreaker.failureCount + 1;
      const shouldOpenCircuit = newFailureCount >= maxFailures;
      
      if (shouldOpenCircuit && !circuitBreaker.isOpen) {
        console.log(`[Circuit Breaker] Opening circuit after ${newFailureCount} failures`);
        setCircuitBreaker({
          isOpen: true,
          failureCount: newFailureCount,
          lastFailureTime: now,
          nextAttemptTime: now + circuitOpenTime,
        });
        onCircuitOpen?.();
      } else {
        setCircuitBreaker(prev => ({
          ...prev,
          failureCount: newFailureCount,
          lastFailureTime: now,
        }));
      }
      
      // Apply exponential backoff if enabled
      if (exponentialBackoff && !shouldOpenCircuit) {
        const backoffMultiplier = Math.pow(2, Math.min(newFailureCount - 1, 5)); // Cap at 2^5 = 32x
        intervalRef.current = Math.min(baseInterval * backoffMultiplier, maxInterval);
        console.log(`[Polling] Applying exponential backoff: ${intervalRef.current}ms`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [queryFn, circuitBreaker, baseInterval, maxInterval, maxFailures, circuitOpenTime, exponentialBackoff, onError, onSuccess, onCircuitOpen, onCircuitClose]);

  const scheduleNextPoll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (!enabled) return;
    
    const delay = circuitBreaker.isOpen ? 
      Math.max(circuitBreaker.nextAttemptTime - Date.now(), 0) : 
      intervalRef.current;
    
    console.log(`[Polling] Scheduling next poll in ${delay}ms`);
    
    timeoutRef.current = setTimeout(() => {
      executeQuery().then(() => {
        scheduleNextPoll();
      });
    }, delay);
  }, [enabled, circuitBreaker, executeQuery]);

  // Start polling
  useEffect(() => {
    if (enabled) {
      console.log('[Polling] Starting polling with circuit breaker');
      executeQuery().then(() => {
        scheduleNextPoll();
      });
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, executeQuery, scheduleNextPoll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const retry = useCallback(() => {
    if (circuitBreaker.isOpen) {
      console.log('[Circuit Breaker] Manual retry - resetting circuit');
      setCircuitBreaker({
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      });
      intervalRef.current = baseInterval;
    }
    executeQuery().then(() => {
      scheduleNextPoll();
    });
  }, [circuitBreaker, executeQuery, scheduleNextPoll, baseInterval]);

  return {
    data,
    isLoading,
    error,
    circuitBreaker,
    retry,
    currentInterval: intervalRef.current,
  };
}