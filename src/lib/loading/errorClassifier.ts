export type ErrorCategory = 'auth' | 'store' | 'rate_limit' | 'transient' | 'permanent';

export interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  retryDelay?: number; // milliseconds
  message: string;
}

export function classifyError(error: any): ClassifiedError {
  // Handle Supabase auth errors
  if (error?.message?.includes('JWT') || 
      error?.message?.includes('session') ||
      error?.message?.includes('unauthorized') ||
      error?.code === 'PGRST301') {
    return {
      category: 'auth',
      retryable: true,
      retryDelay: 1000,
      message: 'Authentication required. Please sign in again.',
    };
  }

  // Handle permission/role errors
  if (error?.message?.includes('permission') ||
      error?.message?.includes('access') ||
      error?.message?.includes('role') ||
      error?.code === 'PGRST116') {
    return {
      category: 'store',
      retryable: true,
      retryDelay: 2000,
      message: 'Access restricted. Check your permissions.',
    };
  }

  // Handle rate limiting
  if (error?.status === 429 || 
      error?.message?.includes('rate limit') ||
      error?.message?.includes('too many requests')) {
    const retryAfter = error?.headers?.['retry-after'];
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // Default to 30s
    
    return {
      category: 'rate_limit',
      retryable: true,
      retryDelay: delay,
      message: 'Too many requests. Please wait before trying again.',
    };
  }

  // Handle network/connection errors (transient)
  if (error?.name === 'NetworkError' ||
      error?.message?.includes('fetch') ||
      error?.message?.includes('network') ||
      error?.message?.includes('connection') ||
      error?.code === 'NETWORK_ERROR' ||
      !navigator.onLine) {
    return {
      category: 'transient',
      retryable: true,
      retryDelay: Math.min(1000 * Math.pow(2, Math.floor(Math.random() * 3)), 8000), // Jittered exponential backoff
      message: 'Connection problem. Please check your internet connection.',
    };
  }

  // Handle server errors (5xx - potentially transient)
  if (error?.status >= 500 && error?.status < 600) {
    return {
      category: 'transient',
      retryable: true,
      retryDelay: Math.min(2000 * Math.pow(2, Math.floor(Math.random() * 3)), 20000), // Longer backoff for server errors
      message: 'Server error. We\'ll try again automatically.',
    };
  }

  // Handle client errors (4xx - mostly permanent except specific cases)
  if (error?.status >= 400 && error?.status < 500) {
    // Some 4xx errors might be transient (like 408, 409, 423, 424)
    if ([408, 409, 423, 424].includes(error.status)) {
      return {
        category: 'transient',
        retryable: true,
        retryDelay: 5000,
        message: 'Temporary issue. Retrying...',
      };
    }
    
    return {
      category: 'permanent',
      retryable: false,
      message: error?.message || 'Request failed. Please check your input and try again.',
    };
  }

  // Handle Supabase specific errors
  if (error?.code?.startsWith('PGRST')) {
    return {
      category: 'permanent',
      retryable: false,
      message: 'Database query failed. Please contact support if this persists.',
    };
  }

  // Default to transient for unknown errors (safer to retry)
  return {
    category: 'transient',
    retryable: true,
    retryDelay: Math.min(1000 * Math.pow(2, Math.floor(Math.random() * 2)), 4000), // Conservative backoff
    message: error?.message || 'An unexpected error occurred. Retrying...',
  };
}

export function getRetryDelay(attemptCount: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attemptCount - 1);
  const jitter = Math.random() * 0.3; // 30% jitter
  const delay = exponentialDelay * (1 + jitter);
  
  return Math.min(delay, maxDelay);
}

export function shouldRetry(error: ClassifiedError, attemptCount: number, maxRetries: number = 3): boolean {
  if (!error.retryable || attemptCount >= maxRetries) {
    return false;
  }

  // Different retry limits for different error types
  switch (error.category) {
    case 'auth':
      return attemptCount < 2; // Only retry auth once
    case 'rate_limit':
      return attemptCount < 5; // More retries for rate limits
    case 'transient':
      return attemptCount < maxRetries;
    default:
      return false;
  }
}