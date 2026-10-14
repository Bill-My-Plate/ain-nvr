import type { MediaPacket } from '../../media/index.js';
import { RECORDING_PARSER_CONSTANTS } from '../constants/recording-parser-numeric-values.constant.js';
import type { RecordingPacketSource } from '../types/recording-packet-source.interface.js';
import { positiveInteger } from '../utils/positive-integer.util.js';

/** Owns the bounded packet queue, source backpressure, and consumer wakeup. */
export class RecordingPacketQueue {
  private readonly pauseAtBytes: number;
  private readonly resumeAtBytes: number;
  private readonly maximumQueuedBytes: number;
  private readonly maximumQueuedPackets: number;
  private readonly packets: MediaPacket[] = [];
  private bytes = 0;
  private paused = false;
  private wakeConsumer: (() => void) | undefined;

  /** Validates queue limits and keeps the source's pause and resume controls. */
  public constructor(
    private readonly source: RecordingPacketSource,
    options: {
      /** Queue byte threshold that pauses the source. */
      readonly pauseAtBytes?: number;
      /** Queue byte threshold that resumes the source. */
      readonly resumeAtBytes?: number;
      /** Hard queue byte limit. */
      readonly maximumQueuedBytes?: number;
      /** Hard queue packet limit. */
      readonly maximumQueuedPackets?: number;
    },
  ) {
    this.pauseAtBytes = positiveInteger(
      options.pauseAtBytes,
      RECORDING_PARSER_CONSTANTS.defaultPauseAtBytes,
      'pauseAtBytes',
    );
    this.resumeAtBytes = positiveInteger(
      options.resumeAtBytes,
      RECORDING_PARSER_CONSTANTS.defaultResumeAtBytes,
      'resumeAtBytes',
    );
    this.maximumQueuedBytes = positiveInteger(
      options.maximumQueuedBytes,
      RECORDING_PARSER_CONSTANTS.defaultMaximumQueuedBytes,
      'maximumQueuedBytes',
    );
    this.maximumQueuedPackets = positiveInteger(
      options.maximumQueuedPackets,
      RECORDING_PARSER_CONSTANTS.defaultMaximumQueuedPackets,
      'maximumQueuedPackets',
    );
    if (this.resumeAtBytes >= this.pauseAtBytes) {
      throw new RangeError('resumeAtBytes must be smaller than pauseAtBytes.');
    }
    if (this.pauseAtBytes >= this.maximumQueuedBytes) {
      throw new RangeError('pauseAtBytes must be smaller than maximumQueuedBytes.');
    }
  }

  /** Returns the current queued byte count. */
  public get queuedBytes(): number {
    return this.bytes;
  }

  /** Returns the number of packets waiting to be written. */
  public get queuedPackets(): number {
    return this.packets.length;
  }

  /** Adds a packet and reports overflow before applying normal backpressure. */
  public push(packet: MediaPacket): Error | undefined {
    this.packets.push(packet);
    this.bytes += packet.rawInterleavedFrame.length;
    if (
      this.bytes >= this.maximumQueuedBytes ||
      this.packets.length >= this.maximumQueuedPackets
    ) {
      return new Error(
        `Recording queue exceeded ${this.maximumQueuedBytes} bytes or ` +
          `${this.maximumQueuedPackets} packets.`,
      );
    }
    if (!this.paused && this.bytes >= this.pauseAtBytes) {
      this.paused = true;
      this.source.pauseMedia();
    }
    this.wake();
    return undefined;
  }

  /** Removes one packet and resumes the source after the low watermark. */
  public shift(): MediaPacket | undefined {
    const packet = this.packets.shift();
    if (packet === undefined) return undefined;
    this.bytes -= packet.rawInterleavedFrame.length;
    if (this.paused && this.bytes <= this.resumeAtBytes) this.resumeSource();
    return packet;
  }

  /** Sleeps until a producer enqueues a packet or the pipeline stops. */
  public async wait(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.wakeConsumer = resolve;
    });
  }

  /** Releases a sleeping consumer during stop or failure. */
  public wake(): void {
    this.wakeConsumer?.();
    this.wakeConsumer = undefined;
  }

  /** Drops queued packets and restores the source after a pipeline failure. */
  public clear(): void {
    this.packets.length = 0;
    this.bytes = 0;
    this.resumeSource();
    this.wake();
  }

  /** Releases source backpressure when recording has stopped. */
  public resumeSource(): void {
    if (!this.paused) return;
    this.paused = false;
    this.source.resumeMedia();
  }
}
