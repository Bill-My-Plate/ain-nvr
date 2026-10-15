import type { PlaybackMessage } from '../../playback/index.js';

import type { PlaybackRtspServer } from '../services/playback-rtsp-server.class.js';
import type { RtpPacketizer } from '../services/rtp-packetizer.class.js';

/** Inputs needed to packetize and send an already-started playback stream. */
export type PlaybackRtspReplayOptions = {
  /** Playback messages, including the first video message consumed during bridge startup. */
  readonly playback: AsyncGenerator<PlaybackMessage>;
  /** RTSP server whose client has completed PLAY. */
  readonly server: PlaybackRtspServer;
  /** Video RTP packetizer shared with the server's RTP-Info response. */
  readonly videoPacketizer: RtpPacketizer;
  /** Optional audio RTP packetizer shared with the server's RTP-Info response. */
  readonly audioPacketizer?: RtpPacketizer;
  /** Wall-clock origin in milliseconds for both RTP tracks. */
  readonly actualStartTimeMs: number;
  /** Exclusive end of the requested video interval, in milliseconds. */
  readonly endTimeMs?: number;
  /** Required sample rate for an enabled mono PCM audio track. */
  readonly audioSampleRate?: number;
  /** Cancels replay between messages. */
  readonly signal?: AbortSignal;
};
