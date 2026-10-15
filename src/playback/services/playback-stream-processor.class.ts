import { H264AccessUnitAssembler, type H264AccessUnit, type H264CodecConfiguration } from '../../h264/index.js';
import type { RecordedPacket } from '../../recorded-stream-parser/index.js';
import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
import { PlaybackMediaError } from '../errors/playback-media-error.class.js';
import type { PcmAudioAccessUnit } from '../types/pcm-audio-access-unit.interface.js';
import type { PlaybackMessage } from '../types/playback-message.type.js';
import { createG711AccessUnit } from '../utils/create-g711-access-unit.util.js';
import { sameConfiguration } from '../utils/same-configuration.util.js';

/**
 * Converts recorded packets into playback messages while keeping decoder
 * bootstrap, pending audio, and codec configuration state across segments.
 */
export class PlaybackStreamProcessor {
  private ready = false;
  private activeConfiguration: H264CodecConfiguration | undefined;
  private bootstrapBytes = 0;
  private lastBootstrapTimeMs: number;
  private sawVideoPacket = false;
  private readonly pendingAudio: PcmAudioAccessUnit[] = [];

  /** Initializes the processor for one requested playback position. */
  public constructor(
    private readonly assembler: H264AccessUnitAssembler,
    private readonly requestedTimeMs: number,
    private readonly actualStartTimeMs: number,
    private readonly maximumBootstrapBytes: number,
    private readonly maximumBootstrapDurationMs: number,
  ) {
    this.lastBootstrapTimeMs = actualStartTimeMs;
  }

  /** Reports whether a complete IDR and decoder configuration were found. */
  public get isReady(): boolean {
    return this.ready;
  }

  /** Processes one parsed packet without changing its order relative to other packets. */
  public processPacket(packet: RecordedPacket): PlaybackMessage[] {
    this.bootstrapBytes += this.ready ? 0 : packet.frame.rawHeader.length + packet.frame.payload.length;
    this.lastBootstrapTimeMs = Math.max(this.lastBootstrapTimeMs, packet.wallClockTimeMs);
    this.assertBootstrapWithinLimits();

    if (packet.track?.mediaType === 'video' && packet.rtp !== undefined) {
      this.sawVideoPacket = true;
      return this.consumeVideoUnits(this.assembler.push({
        rtp: packet.rtp,
        wallClockTimeMs: packet.wallClockTimeMs,
        discontinuity: packet.discontinuity,
        ...(packet.sequenceGap === undefined ? {} : { lostBefore: packet.sequenceGap.lost }),
      }));
    }

    if (packet.track?.mediaType === 'audio') {
      const audio = createG711AccessUnit(packet, this.actualStartTimeMs);
      if (audio !== undefined) {
        if (this.ready) return [audio];
        this.pendingAudio.push(audio);
        if (this.pendingAudio.length > PLAYBACK_CONSTANTS.maximumPendingAudioUnits) {
          this.pendingAudio.shift();
        }
      }
    }
    return [];
  }

  /** Releases the final complete access unit at a terminating segment boundary. */
  public flush(): PlaybackMessage[] {
    return this.consumeVideoUnits(this.assembler.flush());
  }

  /** Preserves the specific error reported when a recording ends before readiness. */
  public assertReadyAtEnd(): void {
    if (this.ready) return;
    throw this.assembler.configuration === undefined
      ? new PlaybackMediaError(
          'no_decoder_configuration',
          'Recording ended before a valid H.264 decoder configuration was found.',
        )
      : new PlaybackMediaError(
          'no_sync_frame',
          this.sawVideoPacket
            ? 'Recording ended before a complete H.264 IDR was found.'
            : 'Recording contains no H.264 packets.',
        );
  }

  /** Stops bootstrap before consuming a packet that exceeds its byte or time limit. */
  private assertBootstrapWithinLimits(): void {
    if (
      this.ready ||
      (this.bootstrapBytes <= this.maximumBootstrapBytes &&
        this.lastBootstrapTimeMs - this.actualStartTimeMs <= this.maximumBootstrapDurationMs)
    ) {
      return;
    }
    throw this.assembler.configuration === undefined
      ? new PlaybackMediaError(
          'no_decoder_configuration',
          'No valid H.264 SPS/PPS was found within the playback bootstrap limit.',
        )
      : new PlaybackMediaError(
          'no_sync_frame',
          'No complete H.264 IDR was found within the playback bootstrap limit.',
        );
  }

  /** Emits the first ready event, each video unit, and audio buffered before readiness. */
  private consumeVideoUnits(units: readonly H264AccessUnit[]): PlaybackMessage[] {
    const messages: PlaybackMessage[] = [];
    for (const unit of units) {
      const wasReady = this.ready;
      messages.push(...this.consumeVideoUnit(unit));
      if (!wasReady && this.ready) messages.push(...this.pendingAudio.splice(0));
    }
    return messages;
  }

  /** Accepts only a keyframe with decoder configuration as the first video unit. */
  private consumeVideoUnit(unit: H264AccessUnit): PlaybackMessage[] {
    const messages: PlaybackMessage[] = [];
    if (!this.ready) {
      if (unit.type !== 'key') return messages;
      const configuration = unit.configuration ?? this.assembler.configuration;
      if (configuration === undefined) return messages;
      this.activeConfiguration = configuration;
      this.ready = true;
      messages.push({
        kind: 'ready',
        requestedTimeMs: this.requestedTimeMs,
        actualStartTimeMs: this.actualStartTimeMs,
        configuration,
      });
    } else if (
      unit.type === 'key' &&
      unit.configuration !== undefined &&
      !sameConfiguration(this.activeConfiguration, unit.configuration)
    ) {
      this.activeConfiguration = unit.configuration;
      messages.push({
        kind: 'configuration',
        configuration: unit.configuration,
        timestampUs: unit.timestampUs,
      });
    }
    if (this.ready) messages.push({ ...unit, kind: 'video' });
    return messages;
  }
}
