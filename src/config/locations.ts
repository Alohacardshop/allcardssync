/**
 * Location configuration for multi-store setup
 * Maps regions to their Shopify store configurations
 */

export const LOCATION = {
  HAWAII: 'hawaii',
  LAS_VEGAS: 'las_vegas',
} as const;

export type LocationKey = typeof LOCATION[keyof typeof LOCATION];

export interface LocationConfig {
  id: string;
  name: string;
  storeKey: string;
  shopDomain: string;
  regionId: string;
}

export const LOCATION_CONFIG: Record<LocationKey, LocationConfig> = {
  [LOCATION.HAWAII]: {
    id: 'hawaii',
    name: 'Hawaii',
    storeKey: 'hawaii',
    shopDomain: 'aloha-card-shop.myshopify.com',
    regionId: 'hawaii',
  },
  [LOCATION.LAS_VEGAS]: {
    id: 'las_vegas',
    name: 'Las Vegas',
    storeKey: 'las_vegas',
    shopDomain: 'vqvxdi-ar.myshopify.com',
    regionId: 'las_vegas',
  },
} as const;

/**
 * Get location config by store key
 */
export function getLocationByStoreKey(storeKey: string | null | undefined): LocationConfig | null {
  if (!storeKey) return null;
  return Object.values(LOCATION_CONFIG).find(loc => loc.storeKey === storeKey) ?? null;
}

/**
 * Get location config by region id
 */
export function getLocationByRegion(regionId: string | null | undefined): LocationConfig | null {
  if (!regionId) return null;
  return Object.values(LOCATION_CONFIG).find(loc => loc.regionId === regionId) ?? null;
}
