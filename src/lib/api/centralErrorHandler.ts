/**
 * Central API error handler for consistent error messaging
 */

import { toast } from "@/hooks/use-toast";

export interface APIErrorContext {
  operation: string;
  endpoint?: string;
  userId?: string;
  timestamp?: number;
}

export interface StandardAPIError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
  context?: APIErrorContext;
  timestamp?: number;
}

export function createAPIError(
  message: string, 
  options: Partial<StandardAPIError> = {}
): StandardAPIError {
  return {
    message,
    timestamp: Date.now(),
    ...options,
  };
}

export function handleAPIError(error: any, context: APIErrorContext): StandardAPIError {
  // Normalize error object
  const normalizedError: StandardAPIError = {
    message: 'An unexpected error occurred',
    context: {
      ...context,
      timestamp: Date.now()
    }
  };

  // Extract meaningful error information
  if (typeof error === 'string') {
    normalizedError.message = error;
  } else if (error?.message) {
    normalizedError.message = error.message;
  }

  if (error?.status || error?.statusCode) {
    normalizedError.status = error.status || error.statusCode;
  }

  if (error?.code) {
    normalizedError.code = error.code;
  }

  // Set status-specific messages
  switch (normalizedError.status) {
    case 401:
      normalizedError.message = 'Authentication required. Please log in again.';
      break;
    case 403:
      normalizedError.message = 'You do not have permission to perform this action.';
      break;
    case 404:
      normalizedError.message = 'The requested resource was not found.';
      break;
    case 409:
      normalizedError.message = 'There was a conflict with the current state.';
      break;
    case 429:
      normalizedError.message = 'Too many requests. Please wait and try again.';
      break;
    case 500:
      normalizedError.message = 'Internal server error. Please try again later.';
      break;
    case 503:
      normalizedError.message = 'Service temporarily unavailable. Please try again.';
      break;
  }

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', {
      ...normalizedError,
      originalError: error
    });
  }

  return normalizedError;
}

export function showAPIError(error: any, context: APIErrorContext): void {
  const standardError = handleAPIError(error, context);
  
  toast({
    title: "Error",
    description: standardError.message,
    variant: "destructive",
  });
}

export function showAPIErrorWithRetry(
  error: any, 
  context: APIErrorContext, 
  retryFn: () => void
): void {
  const standardError = handleAPIError(error, context);
  
  toast({
    title: "Error",
    description: standardError.message,
    variant: "destructive",
  });
  
  // Note: Toast action implementation would need to be added separately
  // as it requires React components which can't be in a .ts file
}