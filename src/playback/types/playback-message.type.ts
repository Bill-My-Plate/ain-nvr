import { type PcmAudioAccessUnit } from './pcm-audio-access-unit.interface.js';

import type { PlaybackControl } from './playback-control.type.js';
import type { PlaybackVideoAccessUnit } from './playback-video-access-unit.type.js';
/**
 * Video, audio, readiness, or control item yielded by playback.
 */
export type PlaybackMessage = PlaybackControl | PlaybackVideoAccessUnit | PcmAudioAccessUnit;
