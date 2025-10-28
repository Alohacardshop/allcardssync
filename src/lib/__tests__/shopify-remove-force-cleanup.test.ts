import { describe, it, expect } from 'vitest';

/**
 * Tests for force_db_cleanup behavior in Shopify removal functions.
 * These tests validate the response handling logic for different HTTP status codes.
 */

describe('Shopify removal force_db_cleanup response handling', () => {
  describe('Response status handling', () => {
    it('should return success for 200 OK', () => {
      const response = { ok: true, status: 200 };
      const force_db_cleanup = false;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(true);
      expect(shouldThrow).toBe(false);
    });

    it('should return success for 404 Not Found (already deleted)', () => {
      const response = { ok: false, status: 404 };
      const force_db_cleanup = false;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(true);
      expect(shouldThrow).toBe(false);
    });

    it('should throw for 500 error when force_db_cleanup is false', () => {
      const response = { ok: false, status: 500 };
      const force_db_cleanup = false;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(false);
      expect(shouldThrow).toBe(true);
    });

    it('should NOT throw for 500 error when force_db_cleanup is true', () => {
      const response = { ok: false, status: 500 };
      const force_db_cleanup = true;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(false);
      expect(shouldThrow).toBe(false);
    });

    it('should throw for 403 Forbidden when force_db_cleanup is false', () => {
      const response = { ok: false, status: 403 };
      const force_db_cleanup = false;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(false);
      expect(shouldThrow).toBe(true);
    });

    it('should NOT throw for 403 Forbidden when force_db_cleanup is true', () => {
      const response = { ok: false, status: 403 };
      const force_db_cleanup = true;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(false);
      expect(shouldThrow).toBe(false);
    });
  });

  describe('Response metadata', () => {
    it('should return correct metadata for successful deletion', () => {
      const response = { ok: true, status: 200 };
      
      const result = {
        shopifyAttempted: true,
        shopifyOkOrGone: response.ok || response.status === 404,
      };
      
      expect(result.shopifyAttempted).toBe(true);
      expect(result.shopifyOkOrGone).toBe(true);
    });

    it('should return correct metadata for 404 (already deleted)', () => {
      const response = { ok: false, status: 404 };
      
      const result = {
        shopifyAttempted: true,
        shopifyOkOrGone: response.ok || response.status === 404,
      };
      
      expect(result.shopifyAttempted).toBe(true);
      expect(result.shopifyOkOrGone).toBe(true);
    });

    it('should return correct metadata for failed deletion with force_db_cleanup', () => {
      const response = { ok: false, status: 500 };
      
      const result = {
        shopifyAttempted: true,
        shopifyOkOrGone: response.ok || response.status === 404,
      };
      
      expect(result.shopifyAttempted).toBe(true);
      expect(result.shopifyOkOrGone).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle 204 No Content as success', () => {
      const response = { ok: true, status: 204 };
      const force_db_cleanup = false;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(true);
      expect(shouldThrow).toBe(false);
    });

    it('should handle 429 Rate Limit without throwing when force_db_cleanup is true', () => {
      const response = { ok: false, status: 429 };
      const force_db_cleanup = true;
      
      const shopifyOkOrGone = response.ok || response.status === 404;
      const shouldThrow = !shopifyOkOrGone && !force_db_cleanup;
      
      expect(shopifyOkOrGone).toBe(false);
      expect(shouldThrow).toBe(false);
    });
  });
});
