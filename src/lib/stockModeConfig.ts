/**
 * Stock Mode Configuration
 * Simple config for label stock type (gap vs continuous)
 */

import { logger } from '@/lib/logger';

export interface StockModeConfig {
  mode: 'gap' | 'continuous';
  speed?: number;
  darkness?: number;
}

// Get stock mode from localStorage
export function getStockModeConfig(): StockModeConfig {
  try {
    const saved = localStorage.getItem('zebra-stock-config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    logger.warn('Failed to load stock config', { error: String(error) }, 'stock-config');
  }
  
  // Default configuration
  return {
    mode: 'gap',
    speed: 4,
    darkness: 10
  };
}

// Save stock mode to localStorage
export function saveStockModeConfig(config: StockModeConfig): void {
  try {
    localStorage.setItem('zebra-stock-config', JSON.stringify(config));
  } catch (error) {
    logger.warn('Failed to save stock config', { error: String(error) }, 'stock-config');
  }
}
