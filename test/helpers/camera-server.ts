import { RtspLoopbackBridge } from '../../src/stream-adapters/services/rtsp-loopback-bridge.class.js';
import type { MediaPacket } from '../../src/media/index.js';
import { splitH264NalUnits } from '../../src/h264/utils/split-h264-nal-units.util.js';
import { RtpPacketizer } from '../../src/stream-adapters/services/rtp-packetizer.class.js';
import { parseRtpPacket } from '../../src/rtp-parser/utils/parse-rtp-packet.util.js';
import { cameraH264 } from './camera-h264.js';
import { interleaved, videoTrack } from './media.js';
import type { Server, Socket } from 'node:net';

/** Real RTSP/TCP fixture. Its client count measures upstreams, excluding worker-local bridges. */
export class CameraServer {
  private readonly subscribers = new Set<(packet: MediaPacket) => void>();
  private readonly units: Buffer[] = [];
  private readonly packetizer = new RtpPacketizer({ payloadType: 96, clockRate: 90_000, initialTimestamp: 90_000 });
  private frameNumber = 0;
  private timer: NodeJS.Timeout | undefined;
  readonly tracks;
  readonly bridge: RtspLoopbackBridge;
  readonly sent: Buffer[] = [];
  maximumClients = 0;

  constructor() {
    const nals = splitH264NalUnits(cameraH264);
    this.tracks = [{ ...videoTrack, parameterSets: {
      sps: nals.find(nal => (nal[0]! & 31) === 7)!,
      pps: nals.find(nal => (nal[0]! & 31) === 8)!,
    } }];
    let unit: Buffer[] = [];
    const flush = (): void => { if (unit.length) this.units.push(Buffer.concat(unit.flatMap(n => [Buffer.from([0, 0, 0, 1]), n]))); unit = []; };
    for (const nal of nals) {
      if ((nal[0]! & 31) === 9) flush();
      unit.push(nal);
    }
    flush();
    this.bridge = new RtspLoopbackBridge({ source: this, maximumClients: 8 });
    (Reflect.get(this.bridge, 'server') as Server).on('connection', () => {
      this.maximumClients = Math.max(this.maximumClients, this.bridge.status.clientCount);
    });
  }
  subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void {
    this.subscribers.add(subscriber);
    return () => { this.subscribers.delete(subscriber); };
  }
  async start(): Promise<string> {
    const url = await this.bridge.start();
    this.timer = setInterval(() => this.tick(), 100);
    return url;
  }
  tick(): void {
    this.maximumClients = Math.max(this.maximumClients, this.bridge.status.clientCount);
    const unit = this.units[this.frameNumber % this.units.length]!;
    const packets = this.packetizer.packetizeH264(unit, this.frameNumber++ * 100_000);
    for (const payload of packets) {
      const raw = interleaved(0, payload);
      this.sent.push(raw);
      if (this.sent.length > 10_000) this.sent.shift();
      const packet: MediaPacket = {
        arrivalTimeMs: Date.now(), channel: 0, track: this.tracks[0]!, rawInterleavedFrame: raw,
        frame: { type: 'interleaved-frame', channel: 0, rawHeader: raw.subarray(0, 4), payload },
        rtp: parseRtpPacket(payload), discontinuity: false,
      };
      for (const subscriber of this.subscribers) subscriber(packet);
    }
  }
  async close(): Promise<void> { clearInterval(this.timer); await this.bridge.stop(); }
  disconnectClients(): void {
    for (const client of Reflect.get(this.bridge, 'clients') as Set<{ socket: Socket }>) client.socket.destroy();
  }
}

export async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() >= end) throw new Error('Condition did not become true.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
