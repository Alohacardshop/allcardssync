import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PATHS } from './paths';

// Lazy load admin pages (heavy, rarely accessed)
const Admin = lazy(() => import('@/pages/Admin'));
const DiscordNotifications = lazy(() => import('@/pages/admin/DiscordNotifications'));
const PendingNotifications = lazy(() => import('@/pages/PendingNotifications'));
const ShopifyBackfill = lazy(() => import('@/pages/admin/ShopifyBackfill'));
const InventorySyncDashboard = lazy(() => import('@/pages/admin/InventorySyncDashboard'));
const SyncHealthPage = lazy(() => import('@/pages/admin/SyncHealthPage'));

// Light component - no lazy loading
import { CatalogMigrationPlaceholder } from '@/components/CatalogMigrationPlaceholder';

/**
 * Admin routes - uses AdminLayout which provides its own Suspense boundary
 */
export const adminRoutes = (
  <Route path={PATHS.admin} element={<AdminLayout />}>
    <Route index element={<Admin />} />
    <Route path="catalog" element={<div className="p-8"><CatalogMigrationPlaceholder /></div>} />
    <Route path="notifications/discord" element={<DiscordNotifications />} />
    <Route path="notifications/pending" element={<PendingNotifications />} />
    <Route path="shopify-backfill" element={<ShopifyBackfill />} />
    <Route path="inventory-sync" element={<InventorySyncDashboard />} />
    <Route path="sync-health" element={<SyncHealthPage />} />
    <Route path="ebay-settings" element={<Navigate to={PATHS.ebay} replace />} />
  </Route>
);
