import { RECORDING_PARSER_CONSTANTS } from '../constants/recording-parser-numeric-values.constant.js';
import type { TrackDescription } from '../../media/index.js';
import { H264ConfigurationTracker, inspectH264Payload } from '../../h264/index.js';
import type { RtpPacket } from '../../rtp-parser/index.js';
import { AinNvrError } from '../../shared/index.js';
import type { OrderedInput } from '../types/ordered-input.type.js';
import type { PendingSafeAccessUnit } from '../types/pending-safe-access-unit.type.js';
import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';
import type { RecordingPacketWriter } from '../types/recording-packet-writer.interface.js';

/** Holds packets until a complete, undamaged H.264 IDR can open a segment. */
export class RecordingSafeBoundary<TLocation> {
  private readonly configurationTracker = new H264ConfigurationTracker();
  private hasConfiguration = false;
  private boundaryWritten = false;
  private pendingAccessUnit: PendingSafeAccessUnit | undefined;

  /** Seeds known parameter sets and receives the parser's two write policies. */
  public constructor(
    private readonly videoTrack: TrackDescription,
    private readonly writeOrdered: (
      input: OrderedInput,
      writer: RecordingPacketWriter<TLocation>,
    ) => Promise<RecordingIndexEvent<TLocation>[]>,
    private readonly writeBeforePendingBoundary: (
      input: OrderedInput,
      writer: RecordingPacketWriter<TLocation>,
    ) => Promise<RecordingIndexEvent<TLocation>[]>,
  ) {
    if (videoTrack.parameterSets !== undefined) {
      try {
        this.configurationTracker.seed(videoTrack.parameterSets.sps, videoTrack.parameterSets.pps);
        this.hasConfiguration = true;
      } catch {
        // Valid in-band configuration may be discovered before the first IDR.
      }
    }
  }

  /** Buffers an ordered packet or writes it under the parser's boundary policy. */
  public async write(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
    boundaryPending: () => boolean,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const packet = input.packet;
    const isVideoRtp =
      packet.track?.trackId === this.videoTrack.trackId && packet.rtp !== undefined;
    const events: RecordingIndexEvent<TLocation>[] = [];

    // A safe segment cannot start on audio or a partial video unit. Hold
    // non-video packets while the candidate IDR is being assembled.
    if (!isVideoRtp) {
      if (this.pendingAccessUnit !== undefined) {
        this.bufferPacket(this.pendingAccessUnit, input);
        return events;
      }
      if (this.boundaryWritten) {
        return await this.writeBeforePendingBoundary(input, writer);
      }
      return events;
    }

    const rtp = packet.rtp as RtpPacket;
    if (this.pendingAccessUnit !== undefined && this.pendingAccessUnit.timestamp !== rtp.timestamp) {
      events.push(...(await this.resolveAccessUnit(writer)));
      if (!boundaryPending()) {
        events.push(...(await this.writeOrdered(input, writer)));
        return events;
      }
    }

    // Gather all RTP fragments with the same timestamp and inspect them as one
    // access unit before deciding whether this boundary can be written.
    this.pendingAccessUnit ??= {
      timestamp: rtp.timestamp,
      packets: [],
      bytes: 0,
      damaged: false,
      hasIdr: false,
      fuNalType: undefined,
    };
    const pending = this.pendingAccessUnit;
    this.bufferPacket(pending, input);
    if (input.lostBefore > 0) {
      pending.damaged = true;
      this.configurationTracker.resetFragments();
    }

    try {
      const configuration = this.configurationTracker.push(rtp.payload, rtp.timestamp);
      if (configuration !== undefined) {
        this.hasConfiguration = true;
        events.push({
          type: 'configuration',
          trackId: packet.track?.trackId ?? this.videoTrack.trackId,
          configuration,
        });
      }
      const inspection = inspectH264Payload(rtp.payload);
      if (inspection.packetization === 'fu-a') {
        const nalType = inspection.nalTypes[0] ?? 0;
        if (inspection.fuStart) {
          if (pending.fuNalType !== undefined) pending.damaged = true;
          pending.fuNalType = nalType;
        } else if (pending.fuNalType !== nalType) {
          pending.damaged = true;
        }
        if (inspection.fuEnd) pending.fuNalType = undefined;
      } else if (pending.fuNalType !== undefined) {
        pending.damaged = true;
        pending.fuNalType = undefined;
      }
      if (inspection.hasIdr) pending.hasIdr = true;
    } catch {
      pending.damaged = true;
    }

    if (rtp.marker) events.push(...(await this.resolveAccessUnit(writer)));
    return events;
  }

  /** Writes or discards the final buffered access unit during parser flush. */
  public async flush(
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    return this.pendingAccessUnit === undefined ? [] : await this.resolveAccessUnit(writer);
  }

  /** Enforces the byte and packet limits while holding a candidate access unit. */
  private bufferPacket(pending: PendingSafeAccessUnit, input: OrderedInput): void {
    pending.bytes += input.packet.rawInterleavedFrame.length;
    if (
      pending.bytes > RECORDING_PARSER_CONSTANTS.maximumPendingBytes ||
      pending.packets.length >= RECORDING_PARSER_CONSTANTS.maximumPendingPackets
    ) {
      this.pendingAccessUnit = undefined;
      this.configurationTracker.resetFragments();
      throw new AinNvrError(
        'corrupt_media',
        'Incomplete recording access unit exceeded its buffer limit.',
      );
    }
    pending.packets.push(input);
  }

  /** Writes a safe IDR at the boundary, or keeps pre-boundary data in the old segment. */
  private async resolveAccessUnit(
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const pending = this.pendingAccessUnit;
    this.pendingAccessUnit = undefined;
    if (pending === undefined) return [];

    const decoderSafe =
      this.hasConfiguration &&
      pending.hasIdr &&
      !pending.damaged &&
      pending.fuNalType === undefined;
    const events: RecordingIndexEvent<TLocation>[] = [];
    if (decoderSafe) {
      for (const input of pending.packets) {
        events.push(...(await this.writeOrdered(input, writer)));
      }
      this.boundaryWritten = true;
      return events;
    }

    if (!this.boundaryWritten) return events;
    for (const input of pending.packets) {
      events.push(...(await this.writeBeforePendingBoundary(input, writer)));
    }
    return events;
  }
}
