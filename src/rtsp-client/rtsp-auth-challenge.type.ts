

import type { BasicChallenge } from './basic-challenge.type.js';
import type { DigestChallenge } from './digest-challenge.type.js';

export type RtspAuthChallenge = BasicChallenge | DigestChallenge;
