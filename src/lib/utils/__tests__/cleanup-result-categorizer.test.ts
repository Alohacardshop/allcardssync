import { describe, it, expect } from 'vitest';
import { categorizeCleanupResults } from '../cleanup-result-categorizer';

describe('categorizeCleanupResults', () => {
  it('should count successful deletions', () => {
    const results: PromiseSettledResult<any>[] = [
      { status: 'fulfilled', value: { data: { ok: true } } },
      { status: 'fulfilled', value: { data: { ok: true } } },
    ];

    const result = categorizeCleanupResults(results);
    expect(result.deleted).toBe(2);
    expect(result.alreadyGone).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should detect 404 errors as already gone', () => {
    const results: PromiseSettledResult<any>[] = [
      { status: 'fulfilled', value: { data: { error: 'Product not found (404)' } } },
      { status: 'rejected', reason: { message: '404 Not Found' } },
    ];

    const result = categorizeCleanupResults(results);
    expect(result.deleted).toBe(0);
    expect(result.alreadyGone).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('should count other errors as failed', () => {
    const results: PromiseSettledResult<any>[] = [
      { status: 'fulfilled', value: { data: { error: 'Rate limit exceeded' } } },
      { status: 'rejected', reason: { message: 'Internal server error' } },
    ];

    const result = categorizeCleanupResults(results);
    expect(result.deleted).toBe(0);
    expect(result.alreadyGone).toBe(0);
    expect(result.failed).toBe(2);
  });

  it('should handle mixed results', () => {
    const results: PromiseSettledResult<any>[] = [
      { status: 'fulfilled', value: { data: { ok: true } } },
      { status: 'fulfilled', value: { data: { error: '404 not found' } } },
      { status: 'rejected', reason: { message: 'Server error' } },
    ];

    const result = categorizeCleanupResults(results);
    expect(result.deleted).toBe(1);
    expect(result.alreadyGone).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('should handle shopifyOkOrGone flag', () => {
    const results: PromiseSettledResult<any>[] = [
      { status: 'fulfilled', value: { data: { shopifyOkOrGone: true } } },
    ];

    const result = categorizeCleanupResults(results);
    expect(result.deleted).toBe(1);
    expect(result.alreadyGone).toBe(0);
    expect(result.failed).toBe(0);
  });
});
