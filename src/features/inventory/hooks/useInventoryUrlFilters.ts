import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InventoryFilterState } from '@/features/inventory/types';

const FILTER_DEFAULTS: InventoryFilterState = {
  searchTerm: '',
  statusFilter: 'active',
  typeFilter: 'all',
  categoryFilter: 'all',
  collectionFilter: 'all',
  shopifySyncFilter: 'all',
  ebayStatusFilter: 'all',
  printStatusFilter: 'all',
  dateRangeFilter: 'all',
  batchFilter: 'all',
  locationFilter: null,
  locationAvailability: 'any',
  tagFilter: [],
  activeQuickFilter: null,
};

/** Keys persisted to URL search params (excludes transient state like activeQuickFilter) */
const URL_KEYS: Array<keyof InventoryFilterState> = [
  'searchTerm',
  'statusFilter',
  'typeFilter',
  'collectionFilter',
  'shopifySyncFilter',
  'ebayStatusFilter',
  'printStatusFilter',
  'dateRangeFilter',
  'batchFilter',
  'locationFilter',
  'locationAvailability',
  'tagFilter',
];

function parseFiltersFromParams(params: URLSearchParams): Partial<InventoryFilterState> {
  const result: Partial<InventoryFilterState> = {};

  for (const key of URL_KEYS) {
    const value = params.get(key);
    if (value === null) continue;

    if (key === 'tagFilter') {
      const tags = value.split(',').filter(Boolean);
      if (tags.length > 0) result.tagFilter = tags;
    } else if (key === 'locationFilter') {
      result.locationFilter = value || null;
    } else {
      (result as any)[key] = value;
    }
  }

  return result;
}

function filtersToParams(filters: InventoryFilterState): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of URL_KEYS) {
    const value = filters[key];
    const defaultValue = FILTER_DEFAULTS[key];

    // Skip defaults
    if (JSON.stringify(value) === JSON.stringify(defaultValue)) continue;

    if (key === 'tagFilter' && Array.isArray(value) && value.length > 0) {
      params.set(key, value.join(','));
    } else if (key === 'locationFilter' && value) {
      params.set(key, value as string);
    } else if (typeof value === 'string' && value) {
      params.set(key, value);
    }
  }

  return params;
}

/**
 * Hook that syncs inventory filter state with URL search params.
 * Returns initialized filter state from URL and a setter that updates both state and URL.
 */
export function useInventoryUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilters = useMemo<InventoryFilterState>(() => {
    const fromUrl = parseFiltersFromParams(searchParams);
    const batchFromStorage = localStorage.getItem('inventory-batch-filter') as InventoryFilterState['batchFilter'] | null;
    return {
      ...FILTER_DEFAULTS,
      ...(batchFromStorage ? { batchFilter: batchFromStorage } : {}),
      ...fromUrl,
    };
    // Only compute on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncToUrl = useCallback((filters: InventoryFilterState) => {
    const params = filtersToParams(filters);
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  return { initialFilters, syncToUrl };
}
