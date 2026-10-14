import { RECORDING_PARSER_CONSTANTS } from '../constants/recording-parser-numeric-values.constant.js';
import type { MediaPacket } from '../../media/index.js';

import { RtpReorderBuffer } from '../../rtp-parser/index.js';

import type { RecordingPacketWriter } from '../types/recording-packet-writer.interface.js';
import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';
import type { RecordingParserOptions } from '../types/recording-parser-options.interface.js';
import type { RecordingParserStatus } from '../types/recording-parser-status.interface.js';
import type { OrderedInput } from '../types/ordered-input.type.js';
import type { DiscontinuityReason } from '../types/discontinuity-reason.type.js';
import { RecordingIndexWriter } from './recording-index-writer.class.js';
import { RecordingSafeBoundary } from './recording-safe-boundary.class.js';
/**
 * Reorders live packets and produces recording writes and index events.
 */
export class RecordingParser<TLocation> {
  private readonly indexWriter: RecordingIndexWriter<TLocation>;
  private readonly reorder = new Map<string, RtpReorderBuffer<MediaPacket>>();
  private readonly safeBoundary: RecordingSafeBoundary<TLocation> | undefined;
  private mutableStatus: RecordingParserStatus = {
    reorderedPackets: 0,
    duplicatePackets: 0,
    lostPackets: 0,
    discontinuities: 0,
  };
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(options: RecordingParserOptions) {
    const window =
      options.reorderWindowPackets ?? RECORDING_PARSER_CONSTANTS.defaultReorderWindowPackets;
    if (!Number.isSafeInteger(window) || window <= 0) {
      throw new RangeError('reorderWindowPackets must be a positive safe integer.');
    }
    const playpointIntervalMs =
      options.playpointIntervalMs ?? RECORDING_PARSER_CONSTANTS.defaultPlaypointIntervalMs;
    if (!Number.isSafeInteger(playpointIntervalMs) || playpointIntervalMs <= 0) {
      throw new RangeError('playpointIntervalMs must be a positive safe integer.');
    }
    const decoderSafeBoundaries = options.decoderSafeBoundaries ?? false;
    const safeVideoTrack = options.tracks.find(
      (track) => track.mediaType === 'video' && track.codec === 'h264',
    );
    if (decoderSafeBoundaries && safeVideoTrack === undefined) {
      throw new Error('decoderSafeBoundaries requires an H.264 video track.');
    }
    this.indexWriter = new RecordingIndexWriter<TLocation>(options.tracks, playpointIntervalMs);
    this.safeBoundary =
      decoderSafeBoundaries && safeVideoTrack !== undefined
        ? new RecordingSafeBoundary<TLocation>(
            safeVideoTrack,
            (input, writer) => this.indexWriter.writeOrdered(input, writer),
            (input, writer) => this.indexWriter.writeBeforePendingBoundary(input, writer),
          )
        : undefined;
    if (decoderSafeBoundaries) this.indexWriter.requestBoundary();
    for (const track of options.tracks) {
      this.reorder.set(track.trackId, new RtpReorderBuffer<MediaPacket>(window));
    }
  }

  /**
   * Returns a snapshot of the current status.
   */
  public get status(): RecordingParserStatus {
    return { ...this.mutableStatus };
  }

  /**
   * Request Boundary.
   */
  public requestBoundary(): void {
    this.indexWriter.requestBoundary();
  }

  /**
   * Reorders one live packet and writes packets that are ready in sequence.
   * A source or timestamp discontinuity first flushes the old window, then
   * requests a new recording boundary before accepting the new packet.
   */
  public async process(
    packet: MediaPacket,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<readonly RecordingIndexEvent<TLocation>[]> {
    const track = packet.track;
    if (track === undefined || packet.rtp === undefined) {
      return this.indexWriter.writeOrdered({ packet, lostBefore: 0 }, writer);
    }
    const reorder = this.reorder.get(track.trackId);
    if (reorder === undefined) {
      return this.indexWriter.writeOrdered({ packet, lostBefore: 0 }, writer);
    }

    const reason: DiscontinuityReason | undefined = packet.discontinuity
      ? 'source-reconnect'
      : this.indexWriter.discontinuityReason(track.trackId, packet.rtp, packet.arrivalTimeMs);
    const events: RecordingIndexEvent<TLocation>[] = [];
    if (reason !== undefined) {
      const flushed = reorder.flush();
      this.mutableStatus = {
        ...this.mutableStatus,
        lostPackets: this.mutableStatus.lostPackets + flushed.lost,
      };
      for (const ordered of flushed.packets) {
        events.push(
          ...(await this.writeWithBoundaryPolicy(
            {
              packet: ordered.value,
              lostBefore: ordered.lostBefore,
            },
            writer,
          )),
        );
      }
      reorder.reset();
      this.indexWriter.markDiscontinuity(reason);
      this.mutableStatus = {
        ...this.mutableStatus,
        discontinuities: this.mutableStatus.discontinuities + 1,
      };
    }

    const result = reorder.push(packet.rtp.sequenceNumber, packet);
    this.mutableStatus = {
      ...this.mutableStatus,
      reorderedPackets: this.mutableStatus.reorderedPackets + (result.reordered ? 1 : 0),
      duplicatePackets: this.mutableStatus.duplicatePackets + (result.duplicate ? 1 : 0),
      lostPackets: this.mutableStatus.lostPackets + result.lost,
    };
    for (const ordered of result.packets) {
      const orderedEvents = await this.writeWithBoundaryPolicy(
        {
          packet: ordered.value,
          lostBefore: ordered.lostBefore,
        },
        writer,
      );
      events.push(...orderedEvents);
    }
    return events;
  }

  /**
   * Emits buffered work and clears pending state.
   */
  public async flush(
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<readonly RecordingIndexEvent<TLocation>[]> {
    const events: RecordingIndexEvent<TLocation>[] = [];
    for (const reorder of this.reorder.values()) {
      const result = reorder.flush();
      this.mutableStatus = {
        ...this.mutableStatus,
        lostPackets: this.mutableStatus.lostPackets + result.lost,
      };
      for (const ordered of result.packets) {
        events.push(
          ...(await this.writeWithBoundaryPolicy(
            {
              packet: ordered.value,
              lostBefore: ordered.lostBefore,
            },
            writer,
          )),
        );
      }
    }
    if (this.safeBoundary !== undefined) events.push(...(await this.safeBoundary.flush(writer)));
    events.push(...this.indexWriter.finishPending());
    return events;
  }

  /**
   * Writes with Boundary Policy.
   */
  private async writeWithBoundaryPolicy(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    if (this.safeBoundary === undefined || !this.indexWriter.boundaryPending) {
      return await this.indexWriter.writeOrdered(input, writer);
    }
    return await this.safeBoundary.write(input, writer, () => this.indexWriter.boundaryPending);
  }
}
