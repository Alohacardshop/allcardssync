// Circuit breaker pattern for external services

interface CircuitState {
  fails: number;
  openedAt?: number;
}

const circuits: Record<string, CircuitState> = {};

/**
 * Check if we can call a service (circuit not open)
 * @param key - Service identifier (e.g., "justtcg", "psa")
 * @param cooldownMs - How long to wait before retrying after circuit opens
 */
export function canCall(key: string, cooldownMs = 120000): boolean {
  const state = circuits[key];
  
  if (!state?.openedAt) {
    return true;
  }

  const elapsed = Date.now() - state.openedAt;
  
  // Circuit has cooled down, allow retry
  if (elapsed > cooldownMs) {
    return true;
  }

  return false;
}

/**
 * Report success or failure to the circuit breaker
 * @param key - Service identifier
 * @param success - Whether the call succeeded
 * @param threshold - Number of consecutive failures before opening circuit
 */
export function report(key: string, success: boolean, threshold = 5): void {
  const state = circuits[key] ?? { fails: 0 };
  circuits[key] = state;

  if (success) {
    // Success - reset failures and close circuit
    state.fails = 0;
    state.openedAt = undefined;
  } else {
    // Failure - increment counter
    state.fails += 1;

    // Open circuit if threshold reached
    if (state.fails >= threshold && !state.openedAt) {
      state.openedAt = Date.now();
      console.warn(`🔴 Circuit opened for ${key} after ${threshold} failures`);
    }
  }
}

/**
 * Get current circuit state for monitoring
 */
export function getState(key: string): CircuitState {
  return circuits[key] ?? { fails: 0 };
}

/**
 * Manually reset a circuit (useful for admin actions)
 */
export function reset(key: string): void {
  delete circuits[key];
  console.log(`🔄 Circuit reset for ${key}`);
}
