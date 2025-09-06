// Global test setup
import { test as base } from '@playwright/test';

// Extend base test with common mocks and utilities
export const test = base.extend({
  // Add common fixtures or utilities here if needed
});

export { expect } from '@playwright/test';