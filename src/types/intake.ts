// Type definitions for intake forms and batch processing
import type { PSACertificateData } from './psa';

export type { PSACertificateData };

export interface UserShopifyAssignment {
  store_key: string;
  location_gid: string;
  location_name: string;
  is_default: boolean;
}

export interface StoreContext {
  assignedStore: string;
  selectedLocation: string;
}

/**
 * Catalog Snapshot - TCG/Comic data from external catalogs
 */
export interface CatalogSnapshot {
  cardId?: string;
  tcgplayerId?: string;
  name?: string;
  set?: string;
  number?: string | number;
  year?: string;
  varietyPedigree?: string;
  type?: string;
  rarity?: string;
  artist?: string;
  images?: {
    small?: string;
    large?: string;
  };
  prices?: {
    market?: number;
    low?: number;
    mid?: number;
    high?: number;
  };
  [key: string]: any;
}

/**
 * Intake Item - Core item during intake process
 */
export interface IntakeItem {
  id: string;
  subject?: string;
  brand_title?: string;
  sku?: string;
  card_number?: string | number;
  quantity: number;
  price: number;
  cost?: number;
  lot_number: string;
  lot_id?: string;
  type?: string;
  processing_notes?: string;
  printed_at?: string;
  pushed_at?: string;
  removed_from_batch_at?: string;
  created_at: string;
  psa_cert?: string;
  cgc_cert?: string;
  grade?: string;
  variant?: string;
  category?: string;
  year?: string;
  catalog_snapshot?: CatalogSnapshot | null;
  store_key?: string;
  shopify_location_gid?: string;
  image_urls?: string[];
  main_category?: string;
  sub_category?: string;
  grading_company?: string;
}

export interface ComicIntakeData {
  title: string;
  issueNumber?: string;
  publisher?: string;
  year?: string;
  condition?: string;
  price: number;
  cost: number;
  quantity: number;
  mainCategory: 'comics';
  subCategory: string;
  processingNotes?: string;
}

export interface GradedComicIntakeData extends Omit<ComicIntakeData, 'condition'> {
  certNumber: string;
  grade: string;
  cgcData?: Record<string, any>;
}

export interface BatchProcessingConfig {
  vendor?: string;
  autoPrice?: boolean;
  chunkSize?: number;
  sendToShopify?: boolean;
}
