/**
 * Centralized route path constants
 * Single source of truth for all application routes
 */

export const PATHS = {
  // Public routes
  auth: '/auth',
  privacy: '/privacy',

  // Dashboard
  dashboard: '/',

  // Intake app
  intake: '/intake',
  intakeGraded: '/intake/graded',
  intakeBulk: '/intake/bulk',

  // Inventory app
  inventory: '/inventory',
  batches: '/batches',
  bulkImport: '/bulk-import',
  bulkTransfer: '/bulk-transfer',
  crossRegionTransfers: '/cross-region-transfers',
  shopifyMapping: '/shopify-mapping',
  shopifySync: '/shopify-sync',

  // Barcode app
  barcodePrinting: '/barcode-printing',
  labelEditor: '/barcode/label-editor',

  // Documents app
  docs: '/docs',

  // eBay app
  ebay: '/ebay',
  ebaySync: '/ebay/sync',

  // Admin routes
  admin: '/admin',
  adminDiscordNotifications: '/admin/notifications/discord',
  adminPendingNotifications: '/admin/notifications/pending',
  adminShopifyBackfill: '/admin/shopify-backfill',
  adminInventorySync: '/admin/inventory-sync',
  adminSyncHealth: '/admin/sync-health',

  // Utility routes
  testHardware: '/test-hardware',
  qzTrayTest: '/qz-tray-test',
} as const;

export type PathKey = keyof typeof PATHS;
export type PathValue = (typeof PATHS)[PathKey];
