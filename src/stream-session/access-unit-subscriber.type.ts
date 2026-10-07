



import { type H264AccessUnit } from '../h264/index.js';







export type AccessUnitSubscriber = (accessUnit: H264AccessUnit) => void;
