import type { LogLevel } from './log-level.type.js';

export type LoggerOptions = {
  readonly write?: (level: LogLevel, line: string) => void;
  readonly now?: () => Date;
};
