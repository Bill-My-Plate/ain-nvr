export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface LoggerOptions {
  readonly write?: (level: LogLevel, line: string) => void;
  readonly now?: () => Date;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'password',
  'proxyauthorization',
  'streamurl',
  'username',
]);

const RTSP_URL_PATTERN = /\brtsps?:\/\/[^\s"'`<>]+/giu;
const AUTHORIZATION_PATTERN = /(authorization\s*:\s*)[^\r\n]+/giu;

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll('-', '').replaceAll('_', '');
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(RTSP_URL_PATTERN, (match) => {
      const scheme = match.toLowerCase().startsWith('rtsps:') ? 'rtsps' : 'rtsp';
      return `${scheme}://[redacted]`;
    })
    .replace(AUTHORIZATION_PATTERN, '$1[redacted]');
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
      stack: value.stack ? redactSensitiveText(value.stack) : undefined,
    };
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEYS.has(normalizeKey(key))
      ? '[redacted]'
      : sanitizeValue(child, seen);
  }
  return sanitized;
}

export function sanitizeLogContext(context: LogContext): LogContext {
  return sanitizeValue(context, new WeakSet()) as LogContext;
}

function defaultWrite(level: LogLevel, line: string): void {
  const output = level === 'warn' || level === 'error'
    ? process.stderr
    : process.stdout;
  output.write(`${line}\n`);
}

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
