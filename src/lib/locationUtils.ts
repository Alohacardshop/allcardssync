// Helper utilities for location name lookups and formatting

import { getLocationNickname, getLocationDisplayInfo } from './locationNicknames';

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
 * Get location nickname from GID
 */
export function getLocationNicknameFromGid(
  gid: string,
  locations: Location[]
): string {
  const fullName = getLocationNameFromGid(gid, locations);
  return getLocationNickname(fullName);
}

/**
 * Get both nickname and full name from GID for display with tooltip
 */
export function getLocationDisplayInfoFromGid(
  gid: string,
  locations: Location[]
): { nickname: string; fullName: string } {
  const fullName = getLocationNameFromGid(gid, locations);
  return getLocationDisplayInfo(fullName);
}

/**
 * Format location GID for display (fallback when locations not available)
 */
export function formatLocationGid(gid: string): string {
  return gid.split('/').pop() || gid;
}
