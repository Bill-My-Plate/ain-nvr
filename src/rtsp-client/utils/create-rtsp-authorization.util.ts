import { randomBytes } from 'node:crypto';

import type { RtspCredentials } from '../types/rtsp-credentials.interface.js';
import type { RtspAuthChallenge } from '../types/rtsp-auth-challenge.type.js';
import type { DigestAuthorizationState } from '../types/digest-authorization-state.interface.js';
import { quote } from './quote.util.js';
import { md5 } from './md5.util.js';

export function createRtspAuthorization(
  challenge: RtspAuthChallenge,
  credentials: RtspCredentials,
  method: string,
  uri: string,
  previous?: DigestAuthorizationState,
): { header: string; state?: DigestAuthorizationState } {
  if (challenge.scheme === 'Basic') {
    const encoded = Buffer.from(`${credentials.username}:${credentials.password}`, 'utf8')
      .toString('base64');
    return { header: `Basic ${encoded}` };
  }

  const nonceCount = (previous?.nonceCount ?? 0) + 1;
  const cnonce = previous?.cnonce ?? randomBytes(12).toString('hex');
  const nc = nonceCount.toString(16).padStart(8, '0');
  let ha1 = md5(`${credentials.username}:${challenge.realm}:${credentials.password}`);
  if (challenge.algorithm === 'MD5-sess') {
    ha1 = md5(`${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = md5(`${method}:${uri}`);
  const response = challenge.qop === 'auth'
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const fields = [
    `username=${quote(credentials.username)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(uri)}`,
    `response=${quote(response)}`,
    // Hikvision cameras may reject the RFC token form (algorithm=MD5) even
    // though it is valid. Scrypted quotes every Digest value, and the quoted
    // form is accepted by both the strict and Hikvision implementations.
    `algorithm=${quote(challenge.algorithm)}`,
  ];
  if (challenge.opaque !== undefined) {
    fields.push(`opaque=${quote(challenge.opaque)}`);
  }
  if (challenge.qop === 'auth') {
    fields.push('qop=auth', `nc=${nc}`, `cnonce=${quote(cnonce)}`);
  }
  return {
    header: `Digest ${fields.join(', ')}`,
    state: { nonceCount, cnonce },
  };
}
