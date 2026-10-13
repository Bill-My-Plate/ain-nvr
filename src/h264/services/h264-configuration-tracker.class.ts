import { inspectH264Payload } from '../utils/inspect-h264-payload.util.js';


import type { H264CodecConfiguration } from '../types/h264-codec-configuration.interface.js';
import type { FuAssembly } from '../types/h264-configuration-fu-assembly.type.js';
import { splitH264NalUnits } from '../utils/split-h264-nal-units.util.js';
import { createH264CodecConfiguration } from '../utils/create-h264-codec-configuration.util.js';
import { H264_NAL_LAYOUT } from '../constants/h264-nal-layout.constant.js';
import { H264_ASSEMBLY_LIMITS } from '../constants/h264-assembly-limits.constant.js';
import { H264NalType } from '../types/h264-nal-type.enum.js';

/**
 * Learn SPS/PPS NALs from H.264 RTP payloads and report a valid configuration
 * only when its SPS/PPS pair differs from the last reported pair.
 */
export class H264ConfigurationTracker {
  private sps: Buffer | undefined;
  private pps: Buffer | undefined;
  private fu: FuAssembly | undefined;
  private lastSignature: string | undefined;

  /** Start from raw or Annex-B SPS/PPS buffers, typically supplied by SDP. */
  public seed(spsData: Buffer, ppsData: Buffer): H264CodecConfiguration {
    const configuration = createH264CodecConfiguration(spsData, ppsData);
    this.sps = configuration.sps;
    this.pps = configuration.pps;
    this.lastSignature = configuration.signature;
    return configuration;
  }

  /**
   * Inspect one H.264 RTP payload after the RTP header. Single NAL and STAP-A
   * payloads contain whole NALs; FU-A payloads are gathered across packets
   * with the same timestamp before SPS/PPS are inspected.
   */
  public push(payload: Buffer, timestamp: number): H264CodecConfiguration | undefined {
    let inspection;
    try {
      inspection = inspectH264Payload(payload);
    } catch {
      this.fu = undefined;
      return undefined;
    }

    if (inspection.packetization === 'single' || inspection.packetization === 'stap-a') {
      this.fu = undefined;
      for (const nal of inspection.nalUnits) this.captureBundle(nal);
    } else {
      // A new FU start replaces prior fragments. Later pieces must match the
      // timestamp and NAL type, and must stay within the reassembly limits.
      const nalType = inspection.nalTypes[0] ?? 0;
      if (inspection.fuStart && inspection.reconstructedFuHeader !== undefined
        && inspection.fuPayload !== undefined) {
        this.fu = {
          timestamp,
          nalType,
          chunks: [Buffer.from([inspection.reconstructedFuHeader]), inspection.fuPayload],
          bytes: H264_NAL_LAYOUT.headerBytes + inspection.fuPayload.length,
        };
      } else if (this.fu === undefined || this.fu.timestamp !== timestamp
        || this.fu.nalType !== nalType || inspection.fuPayload === undefined) {
        this.fu = undefined;
      } else {
        this.fu.bytes += inspection.fuPayload.length;
        if (this.fu.bytes > H264_ASSEMBLY_LIMITS.maximumFuNalBytes
          || this.fu.chunks.length >= H264_ASSEMBLY_LIMITS.maximumFuChunks) this.fu = undefined;
        else this.fu.chunks.push(inspection.fuPayload);
      }
      if (inspection.fuEnd && this.fu !== undefined) {
        this.captureBundle(Buffer.concat(this.fu.chunks));
        this.fu = undefined;
      }
    }

    // Rebuild settings only after both sets exist; signatures suppress repeats.
    if (this.sps === undefined || this.pps === undefined) return undefined;
    try {
      const configuration = createH264CodecConfiguration(this.sps, this.pps);
      if (configuration.signature === this.lastSignature) return undefined;
      this.lastSignature = configuration.signature;
      return configuration;
    } catch {
      return undefined;
    }
  }

  /** Discard an incomplete FU after packet loss without forgetting SPS/PPS. */
  public resetFragments(): void {
    this.fu = undefined;
  }

  /** Find SPS/PPS in one raw NAL or a bundle of Annex-B-delimited NALs. */
  private captureBundle(data: Buffer): void {
    for (const nal of splitH264NalUnits(data)) {
      const type = (nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask;
      if (type === H264NalType.Sps) this.sps = Buffer.from(nal);
      else if (type === H264NalType.Pps) this.pps = Buffer.from(nal);
    }
  }
}
