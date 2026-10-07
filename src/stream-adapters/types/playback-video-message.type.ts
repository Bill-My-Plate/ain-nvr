
import type { PlaybackMessage } from '../../playback/index.js';



export type PlaybackVideoMessage = Extract<PlaybackMessage, { readonly kind: 'video' }>;
