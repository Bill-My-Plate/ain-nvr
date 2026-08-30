import { inspectH264Payload } from './h264.js';
import { parseH264Sps } from './sps.js';

export interface H264DecoderConfiguration {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly bitstreamFormat: 'annexb';
}

export interface H264ParameterSets {
  readonly sps: Buffer;
  readonly pps: Buffer;
}

export interface H264CodecConfiguration extends H264ParameterSets {
  readonly decoder: H264DecoderConfiguration;
  readonly signature: string;
}

interface StartCode {
  readonly offset: number;
  readonly length: 3 | 4;
}

interface FuAssembly {
  readonly timestamp: number;
  readonly nalType: number;
  readonly chunks: Buffer[];
}

function findStartCodes(data: Buffer): StartCode[] {
  const result: StartCode[] = [];
  for (let offset = 0; offset + 3 <= data.length;) {
    if (data[offset] === 0 && data[offset + 1] === 0
      && data[offset + 2] === 0 && data[offset + 3] === 1) {
      result.push({ offset, length: 4 });
      offset += 4;
    } else if (data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 1) {
      result.push({ offset, length: 3 });
      offset += 3;
    } else {
      offset += 1;
    }
  }
  return result;
}

/**
 * Return raw H.264 NAL units. Besides regular Annex-B, this deliberately accepts
 * the camera form `raw NAL | start code | NAL` seen inside non-standard FU-A data.
 */
export function splitH264NalUnits(data: Buffer): Buffer[] {
  if (data.length === 0) return [];
  const startCodes = findStartCodes(data);
  if (startCodes.length === 0) return [Buffer.from(data)];

  const result: Buffer[] = [];
  const first = startCodes[0];
  if (first !== undefined && first.offset > 0) {
    result.push(Buffer.from(data.subarray(0, first.offset)));
  }
  for (let index = 0; index < startCodes.length; index += 1) {
    const start = startCodes[index];
    if (start === undefined) continue;
    const next = startCodes[index + 1];
    const nalStart = start.offset + start.length;
    const nalEnd = next?.offset ?? data.length;
    if (nalEnd > nalStart) result.push(Buffer.from(data.subarray(nalStart, nalEnd)));
  }
  return result.filter((nal) => nal.length > 0);
}

function validNal(nal: Buffer, expectedType: number): boolean {
  const header = nal[0];
  return header !== undefined && (header & 0x80) === 0 && (header & 0x1f) === expectedType;
}

export function normalizeH264ParameterSet(data: Buffer, expectedType: 7 | 8): Buffer {
  const match = splitH264NalUnits(data).find((nal) => validNal(nal, expectedType));
  if (match === undefined) {
    throw new Error(`H.264 configuration does not contain NAL type ${expectedType}.`);
  }
  return match;
}

export function createH264CodecConfiguration(
  spsData: Buffer,
  ppsData: Buffer,
): H264CodecConfiguration {
  const combined = [...splitH264NalUnits(spsData), ...splitH264NalUnits(ppsData)];
  const sps = combined.find((nal) => validNal(nal, 7));
  const pps = combined.find((nal) => validNal(nal, 8));
  if (sps === undefined || pps === undefined) {
    throw new Error('H.264 configuration requires valid SPS and PPS NAL units.');
  }
  const info = parseH264Sps(sps);
  const normalizedSps = Buffer.from(sps);
  const normalizedPps = Buffer.from(pps);
  return {
    sps: normalizedSps,
    pps: normalizedPps,
    decoder: {
      codec: info.codec,
      codedWidth: info.codedWidth,
      codedHeight: info.codedHeight,
      bitstreamFormat: 'annexb',
    },
    signature: `${normalizedSps.toString('base64')}:${normalizedPps.toString('base64')}`,
  };
}

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
        };
      } else if (this.fu === undefined || this.fu.timestamp !== timestamp
        || this.fu.nalType !== nalType || inspection.fuPayload === undefined) {
        this.fu = undefined;
      } else {
        this.fu.chunks.push(inspection.fuPayload);
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
