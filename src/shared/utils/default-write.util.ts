import type { LogLevel } from '../types/log-level.type.js';

export function defaultWrite(level: LogLevel, line: string): void {
  const output = level === 'warn' || level === 'error'
    ? process.stderr
    : process.stdout;
  output.write(`${line}\n`);
}
