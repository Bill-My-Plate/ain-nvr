import type { LogLevel } from '../types/log-level.type.js';
import type { LogContext } from '../types/log-context.type.js';
import type { Logger } from '../types/logger.interface.js';
import type { LoggerOptions } from '../types/logger-options.type.js';
import { redactSensitiveText } from './redact-sensitive-text.util.js';
import { sanitizeLogContext } from './sanitize-log-context.util.js';
import { defaultWrite } from './default-write.util.js';

export function createLogger(options: LoggerOptions = {}): Logger {
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date());

  const log = (
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): void => {
    const entry: Record<string, unknown> = {
      timestamp: now().toISOString(),
      level,
      message: redactSensitiveText(message),
    };

    if (context !== undefined) {
      entry.context = sanitizeLogContext(context);
    }

    write(level, JSON.stringify(entry));
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
}
