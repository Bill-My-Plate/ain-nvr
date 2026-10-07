


import type { Request } from './request.type.js';
import type { Ack } from './ack.type.js';
import type { StatusAck } from './status-ack.type.js';

export type HostMessage = Request | Ack | StatusAck;
