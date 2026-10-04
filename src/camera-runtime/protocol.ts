import type { ExtractedJpegFrame } from '../frame-extractor/rtsp-url-frame-extractor.js';
import type { CameraRuntimeOptions, CameraStatus, RecordingOptions, CommittedSegment } from './types.js';

export const PROTOCOL_VERSION = 1;
export type RuntimeSettings = Required<CameraRuntimeOptions>;
export type RecordingConfiguration = Pick<RecordingOptions,
  'cacheRoot' | 'finalRoot' | 'segmentDurationMs' | 'playpointIntervalMs' | 'minimumFreeBytes'>;
export interface FrameProfile { framesPerSecond: number; jpegQuality: number }
export interface WireError { message: string; code?: string }
export type Command =
  | { type: 'record'; consumerId: string; options: RecordingConfiguration }
  | { type: 'frames'; consumerId: string; profile: FrameProfile }
  | { type: 'stop'; consumerId: string }
  | { type: 'boundary'; consumerId: string }
  | { type: 'close' };
export interface Request { kind: 'request'; epoch: number; id: number; command: Command }
export interface Ack { kind: 'event-ack'; epoch: number; sequence: number; failed: boolean }
export interface StatusAck { kind: 'status-ack'; epoch: number }
export type HostMessage = Request | Ack | StatusAck;
export type RecordingEvent =
  | { type: 'committed'; segment: CommittedSegment }
  | { type: 'session-closed'; cameraId: string; sessionStartMs: number };
export type WorkerMessage =
  | { kind: 'ready'; epoch: number; version: number; generation: number }
  | { kind: 'response'; epoch: number; id: number; error?: WireError }
  | { kind: 'fatal'; epoch: number; error: WireError; terminal: boolean }
  | { kind: 'consumer-error'; epoch: number; consumerId: string; error: WireError }
  | { kind: 'event'; epoch: number; sequence: number; consumerId: string; event: RecordingEvent }
  | { kind: 'progress'; epoch: number; consumerId: string }
  | { kind: 'status'; epoch: number; status: Omit<CameraStatus, 'lastError'> };
export interface FrameMessage {
  kind: 'frame'; epoch: number; generation: number; consumerId: string; sequence: number;
  frame: ExtractedJpegFrame;
}
export interface FrameAck { epoch: number; consumerId: string; sequence: number }

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
export function serializeError(error: unknown): WireError {
  const e = asError(error);
  let cause: unknown = e;
  let code: string | undefined;
  for (let depth = 0; depth < 8 && cause instanceof Error; depth++) {
    const value = (cause as NodeJS.ErrnoException).code;
    if (typeof value === 'string') code = value;
    // RtspClientError carries HTTP-like statusCode, not an AinNvrError code.
    const status = (cause as Error & { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) code = 'rtsp_authentication_failed';
    else if (status === 461) code = 'rtsp_unsupported_transport';
    else if (status === 404) code = 'EINVAL';
    cause = cause.cause;
  }
  return { message: e.message.slice(0, 2_048), ...(code === undefined ? {} : { code }) };
}
export function deserializeError(error: WireError): Error {
  return Object.assign(new Error(error.message), error.code === undefined ? {} : { code: error.code });
}
export function failure(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
export function terminalCameraError(error: unknown): boolean {
  return ['rtsp_authentication_failed', 'unsupported_codec', 'rtsp_unsupported_transport', 'EINVAL']
    .includes(serializeError(error).code ?? '');
}
export function deferred<T>(): {
  promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  // Handles remain observable without creating unhandled rejections before callers attach.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
export async function deadline<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(failure('ETIMEDOUT', message)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
