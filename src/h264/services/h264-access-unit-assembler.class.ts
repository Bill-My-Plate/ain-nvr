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

  constructor(private readonly options: H264AccessUnitAssemblerOptions) {
    if (!Number.isInteger(options.payloadType) || options.payloadType < 0 || options.payloadType > 127) {
      throw new RangeError('payloadType must be between 0 and 127.');
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

  push(input: H264PacketInput): H264AccessUnit[] {
    const { rtp } = input;
    if (rtp.payloadType !== this.options.payloadType) return [];
    const output: H264AccessUnit[] = [];
    if (input.discontinuity === true) this.resetForDiscontinuity();

    if ((input.lostBefore ?? 0) > 0 && this.pending !== undefined) {
      this.pending.damaged = true;
      this.configurationTracker.resetFragments();
    }

    if (this.pending !== undefined && this.pending.rtpTimestamp !== rtp.timestamp) {
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
    pending.bytes += rtp.payload.length;
    if (pending.bytes > 8 * 1024 * 1024 || ++pending.packets > 4_096) {
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
        const nalType = inspection.nalTypes[0] ?? 0;
        if (inspection.fuStart) {
          if (pending.fu !== undefined || inspection.reconstructedFuHeader === undefined
            || inspection.fuPayload === undefined) {
            pending.damaged = true;
          } else {
            pending.fu = {
              nalType,
              chunks: [Buffer.from([inspection.reconstructedFuHeader]), inspection.fuPayload],
            };
          }
        } else if (pending.fu === undefined || pending.fu.nalType !== nalType
          || inspection.fuPayload === undefined) {
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
      pending.damaged = true;
    }
    return output;
  }

  flush(): H264AccessUnit[] {
    const completed = this.completePending();
    return completed === undefined ? [] : [completed];
  }

  reset(): void {
    this.pending = undefined;
    this.timestampOrigin = undefined;
    this.decoderStarted = false;
    this.unwrapper.reset();
    this.recoveryDiscontinuity = false;
    this.sawCompleteIdr = false;
    this.configurationTracker.resetFragments();
  }

  get configuration(): H264CodecConfiguration | undefined {
    if (this.sps === undefined || this.pps === undefined) return undefined;
    try {
      return createH264CodecConfiguration(this.sps, this.pps);
    } catch {
      return undefined;
    }
  }

  private captureParameterSet(nal: Buffer): void {
    const type = (nal[0] ?? 0) & 0x1f;
    if (type === 7) this.sps = Buffer.from(nal);
    else if (type === 8) this.pps = Buffer.from(nal);
  }

  private resetForDiscontinuity(): void {
    this.pending = undefined;
    this.decoderStarted = false;
    this.recoveryDiscontinuity = true;
    this.unwrapper.reset();
    this.timestampOrigin = undefined;
    this.configurationTracker.resetFragments();
  }

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
      const type = (nal[0] ?? 0) & 0x1f;
      return type >= 1 && type <= 5;
    });
    if (!hasPicture) return undefined;

    const key = pending.nalUnits.some((nal) => ((nal[0] ?? 0) & 0x1f) === 5);
    if (key) this.sawCompleteIdr = true;
    if ((!this.decoderStarted && !key) || (key && (this.sps === undefined || this.pps === undefined))) {
      this.droppedAccessUnits += 1;
      return undefined;
    }

    let nalUnits = pending.nalUnits;
    if (key) {
      const pictures = nalUnits.filter((nal) => {
        const type = (nal[0] ?? 0) & 0x1f;
        return type !== 7 && type !== 8;
      });
      nalUnits = [this.sps as Buffer, this.pps as Buffer, ...pictures];
      this.decoderStarted = true;
    }
    this.timestampOrigin ??= pending.unwrappedTimestamp;
    const timestampUs = this.options.playbackStartTimeMs === undefined
      ? Number(rtpTicksToMicroseconds(
        pending.unwrappedTimestamp - this.timestampOrigin,
        this.options.clockRate,
      ))
      : Math.max(0, Math.round(
        (pending.wallClockTimeMs - this.options.playbackStartTimeMs) * 1000,
      ));
    if (!Number.isSafeInteger(timestampUs) || timestampUs < 0) {
      this.droppedAccessUnits += 1;
      return undefined;
    }
    const configuration = key ? this.pendingConfiguration : undefined;
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
