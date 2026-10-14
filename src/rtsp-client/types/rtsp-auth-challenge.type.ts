import type { BasicChallenge } from './basic-challenge.type.js';
import type { DigestChallenge } from './digest-challenge.type.js';
/** A Basic or Digest challenge accepted by the client. */
export type RtspAuthChallenge = BasicChallenge | DigestChallenge;
