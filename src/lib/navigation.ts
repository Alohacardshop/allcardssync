/**
 * Navigation helper for programmatic routing
 * Provides a central place for navigation that works with React Router
 */

import { PATHS } from '@/routes/paths';

let navigateRef: ((to: string) => void) | null = null;

/**
 * Set the navigate function from React Router
 * Call this once in your app's root component
 */
export function setNavigate(navigate: (to: string) => void) {
  navigateRef = navigate;
}

/**
 * Navigate to a path using React Router (no page reload)
 * Falls back to window.location if navigate isn't set
 */
export function navigateTo(path: string) {
  if (navigateRef) {
    navigateRef(path);
  } else {
    // Fallback for edge cases where router isn't available
    window.location.href = path;
  }
}

/**
 * Pre-defined navigation destinations
 * @deprecated Use PATHS from '@/routes/paths' directly
 */
export const routes = {
  adminQueue: '/admin#queue',
  inventory: PATHS.inventory,
  dashboard: PATHS.dashboard,
  admin: PATHS.admin,
} as const;
