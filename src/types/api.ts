// API response and data type definitions

export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export interface APIResponse<T = unknown> {
  data?: T
  error?: string
  success: boolean
  message?: string
}

export interface BulkOperationResult {
  processed: string[]
  failed: Array<{
    id: string
    reason: string
    error?: string
  }>
  total: number
  successCount: number
  failureCount: number
}

// Shopify specific types
export interface ShopifyProduct {
  id: string
  title: string
  handle: string
  product_type: string
  vendor: string
  tags: string[]
  status: 'active' | 'archived' | 'draft'
  variants: ShopifyVariant[]
  images: ShopifyImage[]
  created_at: string
  updated_at: string
}

export interface ShopifyVariant {
  id: string
  product_id: string
  title: string
  price: string
  sku: string
  inventory_quantity: number
  inventory_management: string
  inventory_policy: string
  weight: number
  weight_unit: string
  requires_shipping: boolean
  taxable: boolean
  image_id?: string
}

export interface ShopifyImage {
  id: string
  product_id: string
  src: string
  alt: string
  width: number
  height: number
  position: number
}

export interface ShopifyLocation {
  id: string
  name: string
  address1?: string
  address2?: string
  city?: string
  zip?: string
  province?: string
  country?: string
  phone?: string
  active: boolean
  legacy: boolean
}

// Print job types
export interface PrintJobData {
  sku?: string
  price?: number
  title?: string
  barcode?: string
  qrCode?: string
  [key: string]: unknown
}

export interface PrintJobTarget {
  type: 'zebra_network'
  printerIp?: string
  printerPort?: number
  printerName?: string
}

export interface PrintJob {
  id: string
  workstation_id: string
  template_id?: string
  data: PrintJobData
  target: PrintJobTarget
  copies: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  error?: string
  created_at: string
  printed_at?: string
}

// Template types
export interface TemplateField {
  name: string
  type: 'text' | 'number' | 'barcode' | 'qr' | 'image'
  required: boolean
  default?: string
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
}

export interface LabelTemplate {
  id: string
  name: string
  template_type: string
  is_default: boolean
  canvas: {
    width: number
    height: number
    dpi: number
    elements: CanvasElement[]
  }
  required_fields: string[]
  optional_fields: string[]
  created_at: string
  updated_at: string
}

export interface CanvasElement {
  id: string
  type: 'text' | 'barcode' | 'qr' | 'image' | 'line' | 'rectangle'
  x: number
  y: number
  width: number
  height: number
  properties: Record<string, unknown>
}

// Inventory types
export interface InventoryItem {
  id: string
  sku: string
  title: string
  price: number
  quantity: number
  cost?: number
  store_key?: string
  location_gid?: string
  shopify_product_id?: string
  shopify_variant_id?: string
  catalog_data?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface InventoryAnalytics {
  totalItems: number
  totalValue: number
  byCondition: Record<string, number>
  byGame: Record<string, number>
  recentActivity: Array<{
    date: string
    count: number
    value: number
  }>
}