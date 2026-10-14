import type { Request } from './request.type.js';
import type { Ack } from './ack.type.js';
import type { StatusAck } from './status-ack.type.js';
/**
 * Command or acknowledgement sent from host to camera worker.
 */
export type HostMessage = Request | Ack | StatusAck;
