import { supabase } from "@/integrations/supabase/client";

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  action?: string;
  component?: string;
  userId?: string;
  route?: string;
  [key: string]: any;
}

export interface ErrorDetails {
  message: string;
  stack?: string;
  code?: string | number;
  name?: string;
}

class Logger {
  private async log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    source?: string,
    errorDetails?: ErrorDetails,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.rpc('add_system_log', {
        level_in: level,
        message_in: message,
        context_in: context ? JSON.stringify(context) : null,
        source_in: source || 'frontend',
        error_details_in: errorDetails ? JSON.stringify(errorDetails) : null,
        metadata_in: metadata ? JSON.stringify(metadata) : null,
      });
    } catch (error) {
      // Fallback to console logging if database logging fails
      console.error('Failed to log to database:', error);
      console[level](message, { context, source, errorDetails, metadata });
    }
  }

  error(message: string, error?: Error, context?: LogContext, source?: string): void {
    const errorDetails: ErrorDetails | undefined = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : undefined;

    this.log('error', message, context, source, errorDetails);
    console.error(message, error, context);
  }

  warn(message: string, context?: LogContext, source?: string): void {
    this.log('warn', message, context, source);
    console.warn(message, context);
  }

  info(message: string, context?: LogContext, source?: string): void {
    this.log('info', message, context, source);
    console.info(message, context);
  }

  debug(message: string, context?: LogContext, source?: string): void {
    this.log('debug', message, context, source);
    console.debug(message, context);
  }

  // Convenience methods for common scenarios
  userAction(action: string, context?: LogContext): void {
    this.info(`User action: ${action}`, { ...context, action }, 'user-action');
  }

  apiError(endpoint: string, error: Error, context?: LogContext): void {
    this.error(`API Error: ${endpoint}`, error, { ...context, endpoint }, 'api');
  }

  componentError(component: string, error: Error, context?: LogContext): void {
    this.error(`Component Error: ${component}`, error, { ...context, component }, 'component');
  }

  authEvent(event: string, context?: LogContext): void {
    this.info(`Auth Event: ${event}`, { ...context, event }, 'auth');
  }

  businessLogic(message: string, context?: LogContext): void {
    this.info(`Business Logic: ${message}`, context, 'business');
  }
}

export const logger = new Logger();