import { inspectH264Payload } from '../utils/inspect-h264-payload.util.js';


import type { H264CodecConfiguration } from '../types/h264-codec-configuration.interface.js';
import type { FuAssembly } from '../types/h264-configuration-fu-assembly.type.js';
import { splitH264NalUnits } from '../utils/split-h264-nal-units.util.js';
import { createH264CodecConfiguration } from '../utils/create-h264-codec-configuration.util.js';

/** Learns parameter sets from all packetization forms accepted by the recorder. */
export class H264ConfigurationTracker {
  private sps: Buffer | undefined;
  private pps: Buffer | undefined;
  private fu: FuAssembly | undefined;
  private lastSignature: string | undefined;

  seed(spsData: Buffer, ppsData: Buffer): H264CodecConfiguration {
    const configuration = createH264CodecConfiguration(spsData, ppsData);
    this.sps = configuration.sps;
    this.pps = configuration.pps;
    this.lastSignature = configuration.signature;
    return configuration;
  }

  push(payload: Buffer, timestamp: number): H264CodecConfiguration | undefined {
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
      const nalType = inspection.nalTypes[0] ?? 0;
      if (inspection.fuStart && inspection.reconstructedFuHeader !== undefined
        && inspection.fuPayload !== undefined) {
        this.fu = {
          timestamp,
          nalType,
          chunks: [Buffer.from([inspection.reconstructedFuHeader]), inspection.fuPayload],
          bytes: 1 + inspection.fuPayload.length,
        };
      } else if (this.fu === undefined || this.fu.timestamp !== timestamp
        || this.fu.nalType !== nalType || inspection.fuPayload === undefined) {
        this.fu = undefined;
      } else {
        this.fu.bytes += inspection.fuPayload.length;
        if (this.fu.bytes > 8 * 1024 * 1024 || this.fu.chunks.length >= 4_096) this.fu = undefined;
        else this.fu.chunks.push(inspection.fuPayload);
      }
      if (inspection.fuEnd && this.fu !== undefined) {
        this.captureBundle(Buffer.concat(this.fu.chunks));
        this.fu = undefined;
      }
    }

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

  resetFragments(): void {
    this.fu = undefined;
  }

  private captureBundle(data: Buffer): void {
    for (const nal of splitH264NalUnits(data)) {
      const type = (nal[0] ?? 0) & 0x1f;
      if (type === 7) this.sps = Buffer.from(nal);
      else if (type === 8) this.pps = Buffer.from(nal);
    }
  }
}
