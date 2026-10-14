import { type H264AccessUnit } from '../../h264/index.js';
/** Receives each assembled H.264 video access unit from a live session. */
export type AccessUnitSubscriber = (accessUnit: H264AccessUnit) => void;
