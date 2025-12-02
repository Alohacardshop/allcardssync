/**
 * Permission helpers for role-based access control
 * All users (including admins) are scoped to their assigned location
 */

export type AppKey = 'inventory' | 'barcode' | 'docs' | 'intake' | 'admin';
export type UserRole = 'staff' | 'manager' | 'admin';
export type LocationRegion = 'hawaii' | 'las_vegas';

// App access by role
const APP_PERMISSIONS: Record<UserRole, AppKey[]> = {
  staff: ['inventory', 'barcode', 'docs', 'intake'],
  manager: ['inventory', 'barcode', 'docs', 'intake'],
  admin: ['inventory', 'barcode', 'docs', 'intake', 'admin'],
};

/**
 * Check if a user with the given role can access an app
 */
export function canUseApp(role: UserRole | null | undefined, appKey: AppKey): boolean {
  if (!role) return false;
  return APP_PERMISSIONS[role]?.includes(appKey) ?? false;
}

/**
 * Check if user is a manager or admin
 */
export function isManagerOrAdmin(role: UserRole | null | undefined): boolean {
  return role === 'manager' || role === 'admin';
}

/**
 * Check if user is an admin
 */
export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if user is assigned to Hawaii region
 */
export function isHawaii(region: string | null | undefined): boolean {
  return region === 'hawaii';
}

/**
 * Check if user is assigned to Las Vegas region
 */
export function isLasVegas(region: string | null | undefined): boolean {
  return region === 'las_vegas';
}

/**
 * Get user's effective role from isAdmin/isStaff flags
 * Note: manager role check would need to be added to AuthContext
 */
export function getUserRole(isAdmin: boolean | null, isStaff: boolean | null): UserRole | null {
  if (isAdmin) return 'admin';
  if (isStaff) return 'staff';
  return null;
}

/**
 * Get display name for a region
 */
export function getRegionDisplayName(region: string | null | undefined): string {
  if (region === 'hawaii') return 'Hawaii';
  if (region === 'las_vegas') return 'Las Vegas';
  return 'Unknown';
}
