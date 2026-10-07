


import { type H264AccessUnit } from '../h264/index.js';


export type PlaybackVideoAccessUnit = H264AccessUnit & { readonly kind: 'video' };
