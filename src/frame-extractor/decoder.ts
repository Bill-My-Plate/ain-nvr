import { cpus } from 'node:os';
import { readdirSync } from 'node:fs';

import type { Logger } from '../logging/logger.js';
import type {
  LibavDecoderLike,
  LibavFormatContextLike,
  LibavFrameLike,
  LibavPacketLike,
  LibavStreamLike,
} from './libav-types.js';

export interface DecoderCandidate {
  readonly label: string;
  readonly hardwareDevice?: string;
  readonly decoder?: string;
  readonly deviceName?: string;
}

export interface DecoderHostCapabilities {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly renderDevices: readonly string[];
  readonly cudaAvailable: boolean;
  readonly intelCpu: boolean;
}

export interface DecoderSelection {
  readonly decoder: LibavDecoderLike;
  readonly firstFrame: LibavFrameLike;
  readonly candidate: DecoderCandidate;
}

export function detectDecoderHostCapabilities(
  environment: NodeJS.ProcessEnv = process.env,
): DecoderHostCapabilities {
  let renderDevices: string[] = [];
  if (process.platform === 'linux') {
    try {
      renderDevices = readdirSync('/dev/dri')
        .filter((entry) => entry.startsWith('renderD'))
        .map((entry) => `/dev/dri/${entry}`);
    } catch {
      renderDevices = [];
    }
  }

  return {
    platform: process.platform,
    arch: process.arch,
    renderDevices,
    cudaAvailable: (
      process.platform === 'linux'
      && Boolean(environment.NVIDIA_VISIBLE_DEVICES)
      && Boolean(environment.NVIDIA_DRIVER_CAPABILITIES)
    ) || (
      process.platform === 'win32'
      && Boolean(environment.CUDA_PATH)
    ),
    intelCpu: process.platform === 'win32'
      && cpus().some((cpu) => cpu.model.includes('Intel')),
  };
}

export function decoderCandidates(
  capabilities: DecoderHostCapabilities,
): readonly DecoderCandidate[] {
  const candidates: DecoderCandidate[] = [];

  if (capabilities.platform === 'darwin' && capabilities.arch === 'arm64') {
    candidates.push({ label: 'videotoolbox', hardwareDevice: 'videotoolbox' });
  } else if (capabilities.platform === 'linux') {
    if (capabilities.renderDevices.length === 0) {
      candidates.push({ label: 'vaapi', hardwareDevice: 'vaapi' });
    } else {
      for (const deviceName of capabilities.renderDevices) {
        candidates.push({
          label: `vaapi:${deviceName}`,
          hardwareDevice: 'vaapi',
          deviceName,
        });
      }
    }
    if (capabilities.cudaAvailable) {
      candidates.push({ label: 'cuda', hardwareDevice: 'cuda' });
    }
    candidates.push({ label: 'vulkan', hardwareDevice: 'vulkan' });
  } else if (capabilities.platform === 'win32') {
    if (capabilities.intelCpu) {
      candidates.push({
        label: 'qsv',
        hardwareDevice: 'qsv',
        decoder: 'h264_qsv',
      });
    }
    candidates.push({ label: 'cuda', hardwareDevice: 'cuda' });
    candidates.push({ label: 'vulkan', hardwareDevice: 'vulkan' });
  }

  candidates.push({ label: 'software' });
  return candidates;
}

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

export function isSaneFrame(frame: LibavFrameLike): boolean {
  return Number.isInteger(frame.width)
    && Number.isInteger(frame.height)
    && frame.width > 0
    && frame.height > 0
    && frame.width <= 8_192
    && frame.height <= 8_192;
}

function createCandidateDecoder(
  context: LibavFormatContextLike,
  streamIndex: number,
  candidate: DecoderCandidate,
): LibavDecoderLike {
  if (candidate.hardwareDevice === undefined) {
    return context.createDecoder(streamIndex);
  }
  if (candidate.deviceName !== undefined) {
    return context.createDecoder(
      streamIndex,
      candidate.hardwareDevice,
      candidate.decoder,
      candidate.deviceName,
    );
  }
  if (candidate.decoder !== undefined) {
    return context.createDecoder(
      streamIndex,
      candidate.hardwareDevice,
      candidate.decoder,
    );
  }
  return context.createDecoder(streamIndex, candidate.hardwareDevice);
}
