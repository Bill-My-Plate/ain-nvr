import { inspectH264Payload } from '../utils/inspect-h264-payload.util.js';
import { createH264CodecConfiguration } from '../utils/create-h264-codec-configuration.util.js';
import { H264ConfigurationTracker } from './h264-configuration-tracker.class.js';
import { splitH264NalUnits } from '../utils/split-h264-nal-units.util.js';
import { type H264CodecConfiguration } from '../types/h264-codec-configuration.interface.js';

import { RtpTimestampUnwrapper, rtpTicksToMicroseconds } from '../../rtp-parser/index.js';

import type { H264PacketInput } from '../types/h264-packet-input.type.js';
import type { H264AccessUnit } from '../types/h264-access-unit.interface.js';
import type { H264AccessUnitAssemblerOptions } from '../types/h264-access-unit-assembler-options.interface.js';
import type { PendingAccessUnit } from '../types/pending-access-unit.type.js';
import { annexB } from '../utils/annex-b.util.js';
import { H264_NAL_LAYOUT } from '../constants/h264-nal-layout.constant.js';
import { H264_ASSEMBLY_LIMITS } from '../constants/h264-assembly-limits.constant.js';
import { H264NalType } from '../types/h264-nal-type.enum.js';
/**
 * Group ordered H.264 RTP payloads by timestamp into decoder-ready Annex-B
 * access units. Reassemble FU-A fragments, track SPS/PPS, and wait for an IDR
 * after loss or a stream break before emitting dependent pictures.
 */
export class H264AccessUnitAssembler {
  private readonly unwrapper = new RtpTimestampUnwrapper();
  private readonly configurationTracker = new H264ConfigurationTracker();
  private sps: Buffer | undefined;
  private pps: Buffer | undefined;
  private pendingConfiguration: H264CodecConfiguration | undefined;
  private pending: PendingAccessUnit | undefined;
  private timestampOrigin: bigint | undefined;
  private decoderStarted = false;
  private recoveryDiscontinuity = false;

  droppedAccessUnits = 0;
  sawCompleteIdr = false;
  /** Validate stream timing and optionally seed SPS/PPS from SDP parameter sets. */
  public constructor(private readonly options: H264AccessUnitAssemblerOptions) {
    if (
      !Number.isInteger(options.payloadType) ||
      options.payloadType < 0 ||
      options.payloadType > H264_ASSEMBLY_LIMITS.maximumRtpPayloadType
    ) {
      throw new RangeError(
        `payloadType must be between 0 and ${H264_ASSEMBLY_LIMITS.maximumRtpPayloadType}.`,
      );
    }
    if (!Number.isInteger(options.clockRate) || options.clockRate <= 0) {
      throw new RangeError('clockRate must be a positive integer.');
    }
    if (options.parameterSets !== undefined) {
      try {
        const configuration = this.configurationTracker.seed(
          options.parameterSets.sps,
          options.parameterSets.pps,
        );
        this.sps = configuration.sps;
        this.pps = configuration.pps;
      } catch {
        // A valid in-band configuration may still arrive later.
      }
    }
  }

  /**
   * Consume one ordered RTP packet whose payload is a single NAL, STAP-A bundle,
   * or FU-A fragment. `input.rtp.payload` excludes the RTP header. A timestamp
   * change can complete the previous access unit, so the result may contain it.
   */
  public push(input: H264PacketInput): H264AccessUnit[] {
    const { rtp } = input;
    if (rtp.payloadType !== this.options.payloadType) return [];
    const output: H264AccessUnit[] = [];
    if (input.discontinuity === true) this.resetForDiscontinuity();

    if ((input.lostBefore ?? 0) > 0 && this.pending !== undefined) {
      // Missing packets can leave both a picture and a parameter-set FU incomplete.
      this.pending.damaged = true;
      this.configurationTracker.resetFragments();
    }

    if (this.pending !== undefined && this.pending.rtpTimestamp !== rtp.timestamp) {
      // An RTP timestamp groups all NAL packets for one picture access unit.
      const completed = this.completePending();
      if (completed !== undefined) output.push(completed);
    }
    this.pending ??= {
      rtpTimestamp: rtp.timestamp,
      unwrappedTimestamp: this.unwrapper.unwrap(rtp.timestamp),
      wallClockTimeMs: input.wallClockTimeMs,
      nalUnits: [],
      damaged: false,
      bytes: 0,
      packets: 0,
      overflowed: false,
    };
    const pending = this.pending;
    if (pending.overflowed) return output;
    // Keep an oversized unit marked until its timestamp changes, then drop it.
    pending.bytes += rtp.payload.length;
    if (
      pending.bytes > H264_ASSEMBLY_LIMITS.maximumAccessUnitPayloadBytes ||
      ++pending.packets > H264_ASSEMBLY_LIMITS.maximumAccessUnitPackets
    ) {
      pending.overflowed = true;
      pending.damaged = true;
      pending.nalUnits.length = 0;
      pending.fu = undefined;
      this.configurationTracker.resetFragments();
      return output;
    }
    if ((input.lostBefore ?? 0) > 0 && (pending.nalUnits.length > 0 || pending.fu !== undefined)) {
      pending.damaged = true;
      this.configurationTracker.resetFragments();
    }

    try {
      const inspection = inspectH264Payload(rtp.payload);
      const configuration = this.configurationTracker.push(rtp.payload, rtp.timestamp);
      if (configuration !== undefined) {
        this.sps = configuration.sps;
        this.pps = configuration.pps;
        this.pendingConfiguration = configuration;
      }
      if (inspection.packetization === 'single' || inspection.packetization === 'stap-a') {
        if (pending.fu !== undefined) {
          pending.damaged = true;
          pending.fu = undefined;
        }
        for (const bundle of inspection.nalUnits) {
          for (const nal of splitH264NalUnits(bundle)) {
            this.captureParameterSet(nal);
            pending.nalUnits.push(nal);
          }
        }
      } else {
        // FU-A packets carry pieces of one NAL. Start with the reconstructed
        // header, append fragment bodies, and expose NALs only at the end flag.
        const nalType = inspection.nalTypes[0] ?? 0;
        if (inspection.fuStart) {
          if (
            pending.fu !== undefined ||
            inspection.reconstructedFuHeader === undefined ||
            inspection.fuPayload === undefined
          ) {
            pending.damaged = true;
          } else {
            pending.fu = {
              nalType,
              chunks: [Buffer.from([inspection.reconstructedFuHeader]), inspection.fuPayload],
            };
          }
        } else if (
          pending.fu === undefined ||
          pending.fu.nalType !== nalType ||
          inspection.fuPayload === undefined
        ) {
          pending.damaged = true;
        } else {
          pending.fu.chunks.push(inspection.fuPayload);
        }
        if (inspection.fuEnd) {
          if (pending.fu === undefined) {
            pending.damaged = true;
          } else {
            const bundle = Buffer.concat(pending.fu.chunks);
            for (const nal of splitH264NalUnits(bundle)) {
              this.captureParameterSet(nal);
              pending.nalUnits.push(nal);
            }
            pending.fu = undefined;
          }
        }
      }
    } catch {
      // Any malformed payload invalidates the whole timestamp group.
      pending.damaged = true;
    }
    return output;
  }

  /** Finish the last buffered timestamp group when no next packet will arrive. */
  public flush(): H264AccessUnit[] {
    const completed = this.completePending();
    return completed === undefined ? [] : [completed];
  }

  /** Clear in-flight decoding state while retaining the latest SPS/PPS. */
  public reset(): void {
    this.pending = undefined;
    this.timestampOrigin = undefined;
    this.decoderStarted = false;
    this.unwrapper.reset();
    this.recoveryDiscontinuity = false;
    this.sawCompleteIdr = false;
    this.configurationTracker.resetFragments();
  }

  /** Return decoder settings for the latest valid SPS/PPS pair, if available. */
  public get configuration(): H264CodecConfiguration | undefined {
    if (this.sps === undefined || this.pps === undefined) return undefined;
    try {
      return createH264CodecConfiguration(this.sps, this.pps);
    } catch {
      return undefined;
    }
  }

  /**
   * Remember an SPS or PPS from one raw NAL without its Annex-B start code.
   * @param nal One complete SPS or PPS NAL: the first byte contains forbidden, priority, and NAL-type bits; the remaining variable-length bytes contain the parameter set.
   */
  private captureParameterSet(nal: Buffer): void {
    const type = (nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask;
    if (type === H264NalType.Sps) this.sps = Buffer.from(nal);
    else if (type === H264NalType.Pps) this.pps = Buffer.from(nal);
  }

  /** Discard the old picture and require a recovery IDR after a stream break. */
  private resetForDiscontinuity(): void {
    this.pending = undefined;
    this.decoderStarted = false;
    this.recoveryDiscontinuity = true;
    this.unwrapper.reset();
    this.timestampOrigin = undefined;
    this.configurationTracker.resetFragments();
  }

  /** Validate and emit the buffered picture, or drop it until decoding can resume. */
  private completePending(): H264AccessUnit | undefined {
    const pending = this.pending;
    this.pending = undefined;
    if (pending === undefined || pending.damaged || pending.fu !== undefined) {
      if (pending !== undefined) this.droppedAccessUnits += 1;
      this.decoderStarted = false;
      this.recoveryDiscontinuity = true;
      return undefined;
    }
    const hasPicture = pending.nalUnits.some((nal) => {
      const type = (nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask;
      return type >= H264NalType.NonIdrSlice && type <= H264NalType.IdrSlice;
    });
    if (!hasPicture) return undefined;

    // Delta pictures depend on an earlier IDR; an IDR needs SPS/PPS to start
    // a decoder, so neither can be emitted before those prerequisites exist.
    const key = pending.nalUnits.some(
      (nal) =>
        ((nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask) ===
        H264NalType.IdrSlice,
    );
    if (key) this.sawCompleteIdr = true;
    if (
      (!this.decoderStarted && !key) ||
      (key && (this.sps === undefined || this.pps === undefined))
    ) {
      this.droppedAccessUnits += 1;
      return undefined;
    }

    let nalUnits = pending.nalUnits;
    if (key) {
      // Put the current parameter sets before the IDR for a self-contained key unit.
      const pictures = nalUnits.filter((nal) => {
        const type = (nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask;
        return type !== H264NalType.Sps && type !== H264NalType.Pps;
      });
      nalUnits = [this.sps as Buffer, this.pps as Buffer, ...pictures];
      this.decoderStarted = true;
    }
    this.timestampOrigin ??= pending.unwrappedTimestamp;
    // Live playback uses relative RTP ticks; recorded playback can instead
    // use the caller's wall-clock origin. Both outputs are microseconds.
    const timestampUs =
      this.options.playbackStartTimeMs === undefined
        ? Number(
            rtpTicksToMicroseconds(
              pending.unwrappedTimestamp - this.timestampOrigin,
              this.options.clockRate,
            ),
          )
        : Math.max(
            0,
            Math.round(
              (pending.wallClockTimeMs - this.options.playbackStartTimeMs) *
                H264_ASSEMBLY_LIMITS.microsecondsPerMillisecond,
            ),
          );
    if (!Number.isSafeInteger(timestampUs) || timestampUs < 0) {
      this.droppedAccessUnits += 1;
      return undefined;
    }
    const configuration = key ? this.pendingConfiguration : undefined;
    // Report a changed configuration and recovery only with a decodable IDR.
    if (key) this.pendingConfiguration = undefined;
    const discontinuity = key && this.recoveryDiscontinuity;
    if (key) this.recoveryDiscontinuity = false;
    return {
      type: key ? 'key' : 'delta',
      data: annexB(nalUnits),
      rtpTimestamp: pending.rtpTimestamp,
      timestampUs,
      wallClockTimeMs: pending.wallClockTimeMs,
      discontinuity,
      ...(configuration === undefined ? {} : { configuration }),
    };
  }
}
