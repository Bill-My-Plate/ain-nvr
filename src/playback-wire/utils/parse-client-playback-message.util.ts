import { PLAYBACK_PROTOCOL_VERSION } from '../constants/playback-protocol-version.constant.js';
import { PlaybackProtocolError } from '../errors/playback-protocol-error.class.js';
import type { OpenMessage } from '../types/open-message.type.js';
import type { ClientPlaybackMessage } from '../types/client-playback-message.type.js';
import { isRecord } from './is-record.util.js';
import { safeTime } from './safe-time.util.js';

export function parseClientPlaybackMessage(text: string): ClientPlaybackMessage {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new PlaybackProtocolError('Control message is not valid JSON.');
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new PlaybackProtocolError('Control message must be an object with a type.');
  }
  switch (value.type) {
    case 'open':
      if (value.protocolVersion !== PLAYBACK_PROTOCOL_VERSION
        || typeof value.cameraId !== 'string' || value.cameraId.length === 0
        || value.cameraId.length > 128 || !safeTime(value.startTimeMs)
        || typeof value.includeAudio !== 'boolean') {
        throw new PlaybackProtocolError('Open message fields are invalid.');
      }
      return value as unknown as OpenMessage;
    case 'seek':
      if (!safeTime(value.timeMs)) {
        throw new PlaybackProtocolError('Seek time is invalid.');
      }
      return { type: 'seek', timeMs: value.timeMs };
    case 'pause':
    case 'resume':
    case 'close':
      return { type: value.type };
    case 'ack':
      if (!safeTime(value.generation) || value.generation > 0xffff_ffff
        || !safeTime(value.renderedThroughUs) || !safeTime(value.decodeQueueSize)
        || value.decodeQueueSize > 10_000) {
        throw new PlaybackProtocolError('Acknowledgement fields are invalid.');
      }
      return {
        type: 'ack',
        generation: value.generation,
        renderedThroughUs: value.renderedThroughUs,
        decodeQueueSize: value.decodeQueueSize,
      };
    case 'metric':
      if (!safeTime(value.generation) || value.generation > 0xffff_ffff
        || (value.name !== 'decoder_reconfiguration' && value.name !== 'decoder_recovery')) {
        throw new PlaybackProtocolError('Playback metric fields are invalid.');
      }
      return {
        type: 'metric',
        generation: value.generation,
        name: value.name,
      };
    case 'client_error':
      if (!safeTime(value.generation) || value.generation > 0xffff_ffff
        || value.code !== 'unsupported_browser_codec') {
        throw new PlaybackProtocolError('Client playback error fields are invalid.');
      }
      return {
        type: 'client_error',
        generation: value.generation,
        code: value.code,
      };
    default:
      throw new PlaybackProtocolError(`Unknown control message type ${value.type}.`);
  }
}
