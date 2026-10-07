

import type { Logger } from '../../shared/index.js';
import type { LibavDecoderLike } from '../types/libav-decoder-like.type.js';
import type { LibavFormatContextLike } from '../types/libav-format-context-like.type.js';
import type { LibavPacketLike } from '../types/libav-packet-like.type.js';
import type { LibavStreamLike } from '../types/libav-stream-like.type.js';

import type { DecoderCandidate } from '../types/decoder-candidate.interface.js';
import type { DecoderSelection } from '../types/decoder-selection.interface.js';
import { isSaneFrame } from './is-sane-frame.util.js';
import { createCandidateDecoder } from './create-candidate-decoder.util.js';

export async function selectDecoder(
  context: LibavFormatContextLike,
  stream: LibavStreamLike,
  keyPacketFlag: number,
  candidates: readonly DecoderCandidate[],
  signal: AbortSignal,
  logger: Logger,
): Promise<DecoderSelection> {
  const packets: LibavPacketLike[] = [];
  let packetBytes = 0;
  const started = Date.now();
  const bufferPacket = (packet: LibavPacketLike): void => {
    // Native AVPacket reports size; retain a conservative charge for custom runtimes.
    packetBytes += packet.size ?? 65_536;
    if (packets.length >= 256 || packetBytes > 8 * 1024 * 1024 || Date.now() - started > 10_000) {
      packet.destroy();
      throw new Error('Decoder selection exceeded its packet buffer or time limit.');
    }
    packets.push(packet);
  };
  let lastError: unknown;

  try {
    logger.info('Waiting for a video keyframe.', { streamIndex: stream.index });
    while (true) {
      signal.throwIfAborted();
      const packet = await context.readFrame();
      if (signal.aborted) { packet?.destroy(); signal.throwIfAborted(); }
      if (packet === null || packet === undefined) {
        continue;
      }
      if (
        packet.streamIndex !== stream.index
        || (packet.flags & keyPacketFlag) === 0
      ) {
        packet.destroy();
        continue;
      }
      bufferPacket(packet);
      break;
    }

    for (const candidate of candidates) {
      signal.throwIfAborted();
      let decoder: LibavDecoderLike | undefined;
      try {
        logger.info('Trying video decoder.', { decoder: candidate.label });
        decoder = createCandidateDecoder(context, stream.index, candidate);

        for (const packet of packets) {
          await decoder.sendPacket(packet);
        }

        while (true) {
          signal.throwIfAborted();
          const frame = await decoder.receiveFrame();
          if (signal.aborted) { frame?.destroy(); signal.throwIfAborted(); }
          if (frame !== null && frame !== undefined) {
            if (!isSaneFrame(frame)) {
              frame.destroy();
              throw new Error('Decoder produced a frame with invalid dimensions.');
            }
            if (
              candidate.hardwareDevice === 'vaapi'
              && String(decoder.vendorInfo?.driver ?? '').includes('AMD')
            ) {
              frame.destroy();
              throw new Error('Skipping VAAPI on AMD because crop handling is unreliable.');
            }
            return { decoder, firstFrame: frame, candidate };
          }

          const packet = await context.readFrame();
          if (packet === null || packet === undefined) {
            continue;
          }
          if (packet.streamIndex !== stream.index) {
            packet.destroy();
            continue;
          }
          bufferPacket(packet);
          await decoder.sendPacket(packet);
        }
      } catch (error) {
        decoder?.destroy();
        decoder = undefined;
        signal.throwIfAborted();
        lastError = error;
        logger.warn('Video decoder candidate failed.', {
          decoder: candidate.label,
          error,
        });
      }
    }
  } finally {
    for (const packet of packets) {
      packet.destroy();
    }
  }

  throw new Error('No usable H.264 decoder is available.', { cause: lastError });
}
