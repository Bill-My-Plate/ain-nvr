


import type { Command } from './command.type.js';

export type Request = { kind: 'request'; epoch: number; id: number; command: Command };
