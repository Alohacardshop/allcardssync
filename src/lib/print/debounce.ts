/**
 * Debounce / duplicate-click protection for print triggers.
 *
 * oncePer(ms) returns a wrapper: any call within `ms` of the previous
 * call is silently dropped. The lock is released after the wrapped
 * function completes + the cooldown period.
 */
export function oncePer(ms = 600) {
  let lock = false;
  return (fn: () => void | Promise<void>) => async () => {
    if (lock) return;
    lock = true;
    try { 
      await fn(); 
    } finally { 
      setTimeout(() => { lock = false; }, ms); 
    }
  };
}

/**
 * React hook-friendly guard: returns `[execute, isLocked]`.
 * Prevents duplicate submissions in event handlers.
 *
 * Usage:
 *   const [guardedPrint, isPrinting] = useGuard(600);
 *   onClick={() => guardedPrint(async () => { ... })}
 */
export function createGuard(cooldownMs = 800) {
  let locked = false;

  async function execute<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (locked) return undefined;
    locked = true;
    try {
      return await fn();
    } finally {
      setTimeout(() => { locked = false; }, cooldownMs);
    }
  }

  return { execute, get isLocked() { return locked; } };
}