// Structured logging utility for edge functions

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export function logStructured(level: LogLevel, message: string, fields: Record<string, any> = {}) {
  const logEntry = {
    level,
    message,
    ...fields,
    ts: new Date().toISOString()
  };
  console.log(JSON.stringify(logEntry));
}

export const log = {
  info: (message: string, fields?: Record<string, any>) => logStructured('INFO', message, fields),
  warn: (message: string, fields?: Record<string, any>) => logStructured('WARN', message, fields),
  error: (message: string, fields?: Record<string, any>) => logStructured('ERROR', message, fields),
  debug: (message: string, fields?: Record<string, any>) => logStructured('DEBUG', message, fields)
};