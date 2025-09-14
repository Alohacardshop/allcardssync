// Comprehensive error type definitions for the application

export interface APIError {
  message: string
  code?: string | number
  status?: number
  details?: Record<string, unknown> | string
}

export interface ValidationError extends APIError {
  field?: string
  value?: unknown
}

export interface NetworkError extends APIError {
  timeout?: boolean
  retryable?: boolean
  retryCount?: number
}

export interface SupabaseError extends APIError {
  hint?: string
  details?: string
}

export interface ShopifyError extends APIError {
  shopifyCode?: string
  rateLimited?: boolean
  retryAfter?: number
}

export interface PrinterError extends APIError {
  printerIp?: string
  printerPort?: number
  actionable?: boolean
  suggestions?: string[]
}

export interface ZPLError extends APIError {
  templateId?: string
  lineNumber?: number
}

export interface CSVParseError extends APIError {
  row?: number
  column?: string
  rawValue?: string
}

export interface BatchProcessError extends APIError {
  itemId?: string
  batchId?: string
  operation?: string
}

// Generic error handler result
export interface ErrorHandlerResult<T = unknown> {
  success: boolean
  data?: T
  error?: APIError
}

// Error severity levels
export type ErrorLevel = 'info' | 'warn' | 'error' | 'fatal'

// Standardized error response
export interface StandardError {
  level: ErrorLevel
  message: string
  code?: string
  timestamp: string
  source?: string
  context?: Record<string, unknown>
  stack?: string
}

// Rate limiting error
export interface RateLimitError extends APIError {
  rateLimitType: 'shopify' | 'api' | 'database'
  retryAfter: number
  requestsRemaining?: number
}

// Authentication errors
export interface AuthError extends APIError {
  authType: 'supabase' | 'shopify' | 'external'
  tokenExpired?: boolean
  refreshNeeded?: boolean
}

// Database operation errors  
export interface DatabaseError extends APIError {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  table?: string
  function?: string
  sqlState?: string
}