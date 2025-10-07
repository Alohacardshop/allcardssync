// Helper utilities for location name lookups and formatting

export interface Location {
  gid: string;
  name: string;
  id?: string;
}

/**
 * Get location name from GID by looking it up in available locations
 */
export function getLocationNameFromGid(
  gid: string,
  locations: Location[]
): string {
  const location = locations.find(loc => loc.gid === gid);
  return location?.name || gid.split('/').pop() || gid;
}

/**
 * Format location GID for display (fallback when locations not available)
 */
export function formatLocationGid(gid: string): string {
  return gid.split('/').pop() || gid;
}
