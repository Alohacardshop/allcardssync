import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { logger, LogContext } from '@/lib/logger';

export function useLogger(defaultSource?: string) {
  const location = useLocation();

  const createContext = useCallback((extraContext?: LogContext): LogContext => {
    return {
      route: location.pathname,
      ...extraContext,
    };
  }, [location.pathname]);

  const logError = useCallback((message: string, error?: Error, context?: LogContext) => {
    logger.error(message, error, createContext(context), defaultSource);
  }, [createContext, defaultSource]);

  const logWarn = useCallback((message: string, context?: LogContext) => {
    logger.warn(message, createContext(context), defaultSource);
  }, [createContext, defaultSource]);

  const logInfo = useCallback((message: string, context?: LogContext) => {
    logger.info(message, createContext(context), defaultSource);
  }, [createContext, defaultSource]);

  const logDebug = useCallback((message: string, context?: LogContext) => {
    logger.debug(message, createContext(context), defaultSource);
  }, [createContext, defaultSource]);

  const logUserAction = useCallback((action: string, context?: LogContext) => {
    logger.userAction(action, createContext(context));
  }, [createContext]);

  const logApiError = useCallback((endpoint: string, error: Error, context?: LogContext) => {
    logger.apiError(endpoint, error, createContext(context));
  }, [createContext]);

  const logComponentError = useCallback((component: string, error: Error, context?: LogContext) => {
    logger.componentError(component, error, createContext(context));
  }, [createContext]);

  const logAuthEvent = useCallback((event: string, context?: LogContext) => {
    logger.authEvent(event, createContext(context));
  }, [createContext]);

  const logBusinessLogic = useCallback((message: string, context?: LogContext) => {
    logger.businessLogic(message, createContext(context));
  }, [createContext]);

  return {
    logError,
    logWarn,
    logInfo,
    logDebug,
    logUserAction,
    logApiError,
    logComponentError,
    logAuthEvent,
    logBusinessLogic,
  };
}