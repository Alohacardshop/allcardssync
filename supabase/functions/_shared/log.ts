// Structured logging utility

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export function logStructured(
  level: LogLevel, 
  message: string, 
  context: Record<string, any> = {}
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  
  console.log(JSON.stringify(logEntry));
}