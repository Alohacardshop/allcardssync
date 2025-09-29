/**
 * Central backoff utility for consistent retry behavior
 */

export interface BackoffOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
  retryCondition?: (error: any, attempt: number) => boolean;
}

interface BackoffState {
  retries: number;
  lastAttempt: number;
}

const backoffStates = new Map<string, BackoffState>();

export async function withBackoff<T>(
  fn: () => Promise<T>,
  key: string,
  options: BackoffOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true,
    retryCondition = (error: any) => {
      // Default retry condition: retry on network errors, rate limits, server errors
      if (error?.status >= 500) return true;
      if (error?.status === 429) return true;
      if (error?.code === 'NETWORK_ERROR') return true;
      if (error?.message?.includes('timeout')) return true;
      return false;
    }
  } = options;

  let state = backoffStates.get(key) || { retries: 0, lastAttempt: 0 };
  
  try {
    const result = await fn();
    // Success - reset backoff state
    backoffStates.delete(key);
    return result;
  } catch (error) {
    if (state.retries >= maxRetries || !retryCondition(error, state.retries)) {
      backoffStates.delete(key);
      throw error;
    }

    // Calculate delay with exponential backoff
    let delay = Math.min(baseDelay * Math.pow(2, state.retries), maxDelay);
    
    // Add jitter to prevent thundering herd
    if (jitter) {
      delay *= (0.5 + Math.random() * 0.5);
    }

    // Handle Retry-After header for rate limiting
    if (error?.status === 429) {
      const retryAfter = error?.headers?.['retry-after'];
      if (retryAfter) {
        delay = Math.max(delay, parseInt(retryAfter) * 1000);
      }
    }

    // Update state
    state = {
      retries: state.retries + 1,
      lastAttempt: Date.now()
    };
    backoffStates.set(key, state);

    console.warn(`Retrying ${key} in ${delay}ms (attempt ${state.retries}/${maxRetries})`, error);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return withBackoff(fn, key, options);
  }
}

export function resetBackoff(key: string): void {
  backoffStates.delete(key);
}

export function getBackoffState(key: string): BackoffState | null {
  return backoffStates.get(key) || null;
}