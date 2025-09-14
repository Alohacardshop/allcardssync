// Template and ZPL-related type definitions

export interface ZPLTemplateData {
  sku?: string
  price?: number | string
  title?: string
  barcode?: string
  qrCode?: string
  [key: string]: unknown
}

export interface TSPLSettings {
  width: number
  height: number
  dpi: number
  speed: number
  density: number
  gapInches: number
  zplLabel?: ZPLTemplateData
}

export interface CanvasConfig {
  width: number
  height: number
  dpi: number
  gapInches: number
  zplLabel?: ZPLTemplateData
}

export interface TemplateCanvas {
  width: number
  height: number
  dpi: number
  elements: CanvasElement[]
  gapInches: number
  zplLabel?: ZPLTemplateData
}

export interface CanvasElement {
  id: string
  type: 'text' | 'barcode' | 'qr' | 'image' | 'line' | 'rectangle'
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  properties: ElementProperties
}

export interface ElementProperties {
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  color?: string
  backgroundColor?: string
  borderWidth?: number
  borderColor?: string
  alignment?: 'left' | 'center' | 'right'
  verticalAlignment?: 'top' | 'middle' | 'bottom'
  padding?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  // Barcode specific
  barcodeType?: string
  barcodeData?: string
  showText?: boolean
  // QR Code specific  
  qrData?: string
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
  // Image specific
  src?: string
  fit?: 'contain' | 'cover' | 'fill'
}

export interface FieldConfig {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea'
  required: boolean
  default?: string | number | boolean
  options?: Array<{ value: string; label: string }>
  validation?: {
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    message?: string
  }
  placeholder?: string
  description?: string
}

export interface LabelTemplateComplete {
  id: string
  name: string
  template_type: string
  is_default: boolean
  canvas: TemplateCanvas
  data?: Record<string, unknown>
  created_at: string
  updated_at: string
  zplLabel?: ZPLTemplateData
}

export interface TemplateRenderOptions {
  name: string
  fieldConfig: FieldConfig
  labelData: ZPLTemplateData
  tsplSettings: TSPLSettings
  templateId?: string
  zplData?: ZPLTemplateData
}