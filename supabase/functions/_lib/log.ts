// Structured logging with correlation IDs

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

/**
 * Structured log entry
 */
export function slog(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  console.log(JSON.stringify(entry));
  return entry;
}

/**
 * Log helpers for common patterns
 */
export const log = {
  info: (message: string, ctx?: Record<string, unknown>) => slog("INFO", message, ctx),
  warn: (message: string, ctx?: Record<string, unknown>) => slog("WARN", message, ctx),
  error: (message: string, ctx?: Record<string, unknown>) => slog("ERROR", message, ctx),
  debug: (message: string, ctx?: Record<string, unknown>) => slog("DEBUG", message, ctx),
};

/**
 * Generate a correlation ID for request tracking
 */
export function genRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Async log to database (fire and forget)
 */
export async function logToDb(
  supabase: any,
  entry: {
    requestId: string;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase
      .from("catalog_v2.logs")
      .insert({
        request_id: entry.requestId,
        level: entry.level.toLowerCase(),
        message: entry.message,
        context: entry.context || {},
      });
  } catch (error) {
    // Silently fail - don't let logging errors break the main flow
    console.error("Failed to log to DB:", error);
  }
}
