import { 
  Home, 
  PackagePlus, 
  Package, 
  Archive,
  Printer, 
  FileText, 
  ShoppingBag, 
  Settings,
  LayoutDashboard,
  Store,
  Database,
  Users,
  Globe,
  Bell,
  RefreshCw,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

/**
 * Centralized navigation configuration
 * Single source of truth for all app and admin navigation
 */

// =============================================================================
// APP NAVIGATION (main app sidebar, bottom nav)
// =============================================================================

export interface AppNavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

/** Main app navigation items (shown in sidebar and partially in bottom nav) */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { key: 'home', label: 'Home', href: PATHS.dashboard, icon: Home },
  { key: 'intake', label: 'Intake', href: PATHS.intake, icon: PackagePlus },
  { key: 'inventory', label: 'Inventory', href: PATHS.inventory, icon: Package },
  { key: 'batches', label: 'Batches', href: PATHS.batches, icon: Archive },
  { key: 'barcode', label: 'Print', href: PATHS.barcodePrinting, icon: Printer },
  { key: 'docs', label: 'Documents', href: PATHS.docs, icon: FileText },
];

/** Admin-only app navigation items */
export const APP_ADMIN_ITEMS: AppNavItem[] = [
  { key: 'ebay', label: 'eBay', href: PATHS.ebay, icon: ShoppingBag, adminOnly: true },
  { key: 'admin', label: 'Admin', href: PATHS.admin, icon: Settings, adminOnly: true },
];

/** Bottom nav primary items (first 4 shown directly, rest go in "More") */
export const BOTTOM_NAV_PRIMARY: AppNavItem[] = [
  { key: 'home', label: 'Home', href: PATHS.dashboard, icon: Home },
  { key: 'intake', label: 'Intake', href: PATHS.intake, icon: PackagePlus },
  { key: 'inventory', label: 'Inventory', href: PATHS.inventory, icon: Package },
  { key: 'barcode', label: 'Print', href: PATHS.barcodePrinting, icon: Printer },
];

/** Bottom nav "More" menu items */
export const BOTTOM_NAV_MORE: AppNavItem[] = [
  { key: 'batches', label: 'Batches', href: PATHS.batches, icon: Archive },
  { key: 'docs', label: 'Documents', href: PATHS.docs, icon: FileText },
  { key: 'ebay', label: 'eBay', href: PATHS.ebay, icon: ShoppingBag, adminOnly: true },
  { key: 'admin', label: 'Admin', href: PATHS.admin, icon: Settings, adminOnly: true },
];

// =============================================================================
// ADMIN NAVIGATION (admin sidebar, command palette)
// =============================================================================

export interface AdminNavItem {
  id: string;
  title: string;
  path: string;
  icon: LucideIcon;
  description?: string;
  keywords?: string[];
}

/** Admin sidebar sections (query-param based navigation) */
export const ADMIN_NAV_SECTIONS: AdminNavItem[] = [
  { 
    id: 'overview', 
    path: PATHS.admin, 
    title: 'Overview', 
    icon: LayoutDashboard,
    description: 'System overview and quick actions',
    keywords: ['dashboard', 'home', 'stats'],
  },
  { 
    id: 'store', 
    path: `${PATHS.admin}?section=store`, 
    title: 'Store', 
    icon: Store,
    description: 'Shopify integration and sync',
    keywords: ['shopify', 'integration', 'sync'],
  },
  { 
    id: 'data', 
    path: `${PATHS.admin}?section=data`, 
    title: 'Data & Intake', 
    icon: Database,
    description: 'TCG database and intake settings',
    keywords: ['tcg', 'database', 'intake', 'data'],
  },
  { 
    id: 'queue', 
    path: `${PATHS.admin}?section=queue`, 
    title: 'Queue', 
    icon: Package,
    description: 'Monitor queue health and settings',
    keywords: ['queue', 'sync', 'health'],
  },
  { 
    id: 'users', 
    path: `${PATHS.admin}?section=users`, 
    title: 'Users', 
    icon: Users,
    description: 'Manage user assignments',
    keywords: ['users', 'permissions', 'access'],
  },
  { 
    id: 'hardware', 
    path: `${PATHS.admin}?section=hardware`, 
    title: 'Hardware', 
    icon: Printer,
    description: 'Test printers and connectivity',
    keywords: ['printer', 'test', 'zebra'],
  },
  { 
    id: 'regions', 
    path: `${PATHS.admin}?section=regions`, 
    title: 'Regions', 
    icon: Globe,
    description: 'Region and location settings',
    keywords: ['regions', 'locations', 'discord'],
  },
  { 
    id: 'system', 
    path: `${PATHS.admin}?section=system`, 
    title: 'System', 
    icon: Settings,
    description: 'View system logs',
    keywords: ['logs', 'debug', 'errors'],
  },
];

/** Admin tools (separate routes under /admin/*) */
export const ADMIN_TOOLS: AdminNavItem[] = [
  { 
    id: 'discord', 
    path: PATHS.adminDiscordNotifications, 
    title: 'Discord', 
    icon: Bell,
    description: 'Discord notification settings',
    keywords: ['discord', 'notifications', 'webhooks'],
  },
  { 
    id: 'pending', 
    path: PATHS.adminPendingNotifications, 
    title: 'Pending', 
    icon: Bell,
    description: 'Pending notifications queue',
    keywords: ['pending', 'notifications', 'queue'],
  },
  { 
    id: 'backfill', 
    path: PATHS.adminShopifyBackfill, 
    title: 'Backfill', 
    icon: RefreshCw,
    description: 'Shopify backfill operations',
    keywords: ['shopify', 'backfill', 'sync'],
  },
  { 
    id: 'inventory-sync', 
    path: PATHS.adminInventorySync, 
    title: 'Inv Sync', 
    icon: RefreshCw,
    description: 'Inventory sync dashboard',
    keywords: ['inventory', 'sync', 'dashboard'],
  },
  { 
    id: 'sync-health', 
    path: PATHS.adminSyncHealth, 
    title: 'Health', 
    icon: Activity,
    description: 'Sync health monitoring',
    keywords: ['health', 'sync', 'monitoring'],
  },
];

/** Get all admin navigation items for command palette */
export function getAllAdminNavItems(): AdminNavItem[] {
  return [...ADMIN_NAV_SECTIONS, ...ADMIN_TOOLS];
}

/** Find admin nav item by ID */
export function getAdminNavById(id: string): AdminNavItem | undefined {
  return getAllAdminNavItems().find(item => item.id === id);
}
