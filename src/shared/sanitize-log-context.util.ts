import type { LogContext } from './log-context.type.js';
import { sanitizeValue } from './sanitize-value.util.js';

export function sanitizeLogContext(context: LogContext): LogContext {
  return sanitizeValue(context, new WeakSet()) as LogContext;
}
