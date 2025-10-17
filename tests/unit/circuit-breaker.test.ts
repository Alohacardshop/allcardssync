import { describe, it, expect, beforeEach } from "vitest";

// Mock circuit breaker for testing
class CircuitBreaker {
  private failures = new Map<string, { count: number; openedAt?: number }>();
  
  canCall(key: string, cooldownMs = 120000): boolean {
    const state = this.failures.get(key);
    if (!state?.openedAt) return true;
    
    const elapsed = Date.now() - state.openedAt;
    return elapsed > cooldownMs;
  }
  
  report(key: string, success: boolean, threshold = 5): void {
    const state = this.failures.get(key) ?? { count: 0 };
    
    if (success) {
      state.count = 0;
      state.openedAt = undefined;
    } else {
      state.count += 1;
      if (state.count >= threshold && !state.openedAt) {
        state.openedAt = Date.now();
      }
    }
    
    this.failures.set(key, state);
  }
  
  reset(key: string): void {
    this.failures.delete(key);
  }
}

describe("Circuit Breaker", () => {
  let breaker: CircuitBreaker;
  
  beforeEach(() => {
    breaker = new CircuitBreaker();
  });
  
  it("should allow calls initially", () => {
    expect(breaker.canCall("test-service")).toBe(true);
  });
  
  it("should open circuit after threshold failures", () => {
    // Report 5 failures (default threshold)
    for (let i = 0; i < 5; i++) {
      breaker.report("test-service", false);
    }
    
    // Circuit should be open
    expect(breaker.canCall("test-service")).toBe(false);
  });
  
  it("should reset on success", () => {
    // Report 3 failures
    breaker.report("test-service", false);
    breaker.report("test-service", false);
    breaker.report("test-service", false);
    
    // Then a success
    breaker.report("test-service", true);
    
    // Should still allow calls
    expect(breaker.canCall("test-service")).toBe(true);
  });
  
  it("should allow retry after cooldown", () => {
    // Open circuit
    for (let i = 0; i < 5; i++) {
      breaker.report("test-service", false);
    }
    
    expect(breaker.canCall("test-service")).toBe(false);
    
    // With very short cooldown (1ms), should allow retry
    expect(breaker.canCall("test-service", 1)).toBe(true);
  });
  
  it("should handle multiple services independently", () => {
    // Fail service A
    for (let i = 0; i < 5; i++) {
      breaker.report("service-a", false);
    }
    
    // Service A blocked
    expect(breaker.canCall("service-a")).toBe(false);
    
    // Service B still works
    expect(breaker.canCall("service-b")).toBe(true);
  });
  
  it("should manually reset circuit", () => {
    // Open circuit
    for (let i = 0; i < 5; i++) {
      breaker.report("test-service", false);
    }
    
    expect(breaker.canCall("test-service")).toBe(false);
    
    // Manual reset
    breaker.reset("test-service");
    
    // Should allow calls again
    expect(breaker.canCall("test-service")).toBe(true);
  });
});
