 // Types for saved inventory views
 
 import type { InventoryFilterState } from '../types';
 
 /**
  * Column definitions for inventory table
  */
 export type InventoryColumn = 
   | 'checkbox'
   | 'sku'
   | 'title'
   | 'location'
   | 'price'
   | 'quantity'
   | 'shopify_status'
   | 'print_status'
   | 'ebay_status'
   | 'updated_at'
   | 'actions';
 
 /**
  * Column configuration for display
  */
 export interface ColumnConfig {
   id: InventoryColumn;
   label: string;
   defaultVisible: boolean;
   locked?: boolean; // Can't be hidden (checkbox, actions)
   width?: string;
 }
 
 /**
  * Default column configurations
  */
export const INVENTORY_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: 'Select', defaultVisible: true, locked: true, width: '40px' },
  { id: 'sku', label: 'SKU', defaultVisible: true, width: '100px' },
  { id: 'title', label: 'Title', defaultVisible: true, width: 'minmax(220px, 1fr)' },
  { id: 'location', label: 'Location', defaultVisible: true, width: '120px' },
  { id: 'price', label: 'Price', defaultVisible: true, width: '80px' },
  { id: 'quantity', label: 'Qty', defaultVisible: true, width: '65px' },
  { id: 'shopify_status', label: 'Shopify', defaultVisible: true, width: '80px' },
  { id: 'print_status', label: 'Print', defaultVisible: true, width: '75px' },
  { id: 'ebay_status', label: 'eBay', defaultVisible: true, width: '80px' },
  { id: 'updated_at', label: 'Updated', defaultVisible: true, width: '100px' },
  { id: 'actions', label: '', defaultVisible: true, locked: true, width: '44px' },
];
 
 /**
  * Sort configuration for views
  */
 export type SortField = 'sku' | 'title' | 'price' | 'quantity' | 'created_at' | 'updated_at';
 export type SortDirection = 'asc' | 'desc';
 
 export interface SortConfig {
   field: SortField;
   direction: SortDirection;
 }
 
 /**
  * Saved view structure (matches database schema)
  */
 export interface SavedInventoryView {
   id: string;
   user_id: string;
   name: string;
   is_default: boolean;
   is_system: boolean;
   filters: Partial<InventoryFilterState>;
   visible_columns: InventoryColumn[];
   sort_column: SortField | null;
   sort_direction: SortDirection;
   created_at: string;
   updated_at: string;
 }
 
 /**
  * Create view input
  */
 export interface CreateViewInput {
   name: string;
   filters: Partial<InventoryFilterState>;
   visible_columns: InventoryColumn[];
   sort_column?: SortField | null;
   sort_direction?: SortDirection;
   is_default?: boolean;
 }
 
 /**
  * Default system views
  */
 export const DEFAULT_SYSTEM_VIEWS: Omit<SavedInventoryView, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
   {
     name: 'Needs Sync',
     is_default: false,
     is_system: true,
     filters: { shopifySyncFilter: 'not-synced', statusFilter: 'active' },
     visible_columns: ['checkbox', 'sku', 'title', 'price', 'quantity', 'shopify_status', 'actions'],
     sort_column: 'created_at',
     sort_direction: 'desc',
   },
   {
     name: 'Drifted',
     is_default: false,
     is_system: true,
     filters: { statusFilter: 'errors' },
     visible_columns: ['checkbox', 'sku', 'title', 'location', 'quantity', 'shopify_status', 'updated_at', 'actions'],
     sort_column: 'updated_at',
     sort_direction: 'desc',
   },
   {
     name: 'Out of Stock',
     is_default: false,
     is_system: true,
     filters: { statusFilter: 'out-of-stock' },
     visible_columns: ['checkbox', 'sku', 'title', 'price', 'quantity', 'shopify_status', 'ebay_status', 'actions'],
     sort_column: 'updated_at',
     sort_direction: 'desc',
   },
   {
     name: 'Printed=No',
     is_default: false,
     is_system: true,
     filters: { printStatusFilter: 'not-printed', statusFilter: 'active' },
     visible_columns: ['checkbox', 'sku', 'title', 'price', 'print_status', 'actions'],
     sort_column: 'created_at',
     sort_direction: 'desc',
   },
   {
     name: 'eBay Listed',
     is_default: false,
     is_system: true,
     filters: { ebayStatusFilter: 'listed', statusFilter: 'active' },
     visible_columns: ['checkbox', 'sku', 'title', 'price', 'quantity', 'ebay_status', 'updated_at', 'actions'],
     sort_column: 'updated_at',
     sort_direction: 'desc',
   },
 ];
 
 /**
  * Get all visible columns (with locked columns always included)
  */
 export function getVisibleColumns(selectedColumns: InventoryColumn[]): InventoryColumn[] {
   const lockedColumns = INVENTORY_COLUMNS.filter(c => c.locked).map(c => c.id);
   const allVisible = [...new Set([...lockedColumns, ...selectedColumns])];
   // Maintain original order
   return INVENTORY_COLUMNS.filter(c => allVisible.includes(c.id)).map(c => c.id);
 }
 
 /**
  * Build grid template string from visible columns
  */
 export function buildGridTemplate(visibleColumns: InventoryColumn[]): string {
   return visibleColumns
     .map(colId => {
       const config = INVENTORY_COLUMNS.find(c => c.id === colId);
       return config?.width || '1fr';
     })
     .join(' ');
 }