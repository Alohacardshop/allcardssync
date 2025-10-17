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

export interface IntakeItem {
  id: string;
  subject?: string;
  brand_title?: string;
  sku?: string;
  card_number?: string;
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
  grade?: string;
  variant?: string;
  category?: string;
  year?: string;
  catalog_snapshot?: Record<string, any> | null;
  store_key?: string;
  shopify_location_gid?: string;
  image_urls?: string[];
}

export interface BatchProcessingConfig {
  vendor?: string;
  autoPrice?: boolean;
  chunkSize?: number;
  sendToShopify?: boolean;
}
