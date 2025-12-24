/**
 * Shared logging utilities for API routes.
 * Provides consistent structured logging across all API endpoints.
 */

/**
 * Generate a unique request ID for tracing.
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Log levels supported by the logger.
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Context data to include in log entries.
 */
export type LogContext = Record<string, unknown>;

/**
 * Logger function type returned by createLogger.
 */
export type Logger = (level: LogLevel, message: string, context?: LogContext) => void;

/**
 * Create a logger function for a specific service/API endpoint.
 * 
 * @param service - The service identifier (e.g., 'api.parties', 'api.join')
 * @returns A logger function that outputs structured JSON logs
 * 
 * @example
 * const log = createLogger('api.parties');
 * log('info', 'Party created', { partyId: '123', name: 'My Party' });
 */
export function createLogger(service: string): Logger {
  return (level: LogLevel, message: string, context: LogContext = {}) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: level.toUpperCase(),
      service,
      message,
      ...context,
    };
    console.log(JSON.stringify(logData));
  };
}

/**
 * Create a logger with request context pre-populated.
 * Useful for tracking a single request through multiple log calls.
 * 
 * @param service - The service identifier
 * @param requestId - The request ID to include in all logs
 * @returns A logger function with requestId pre-populated
 * 
 * @example
 * const requestId = generateRequestId();
 * const log = createRequestLogger('api.parties', requestId);
 * log('info', 'Request started');
 * log('info', 'Processing complete', { duration: 150 });
 */
export function createRequestLogger(service: string, requestId: string): Logger {
  const baseLogger = createLogger(service);
  return (level: LogLevel, message: string, context: LogContext = {}) => {
    baseLogger(level, message, { requestId, ...context });
  };
}

/**
 * Client-side logger that can be disabled in production.
 * Use this for development logging in React components.
 */
export const clientLogger = {
  log: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors, even in production
    console.error(...args);
  },
};
