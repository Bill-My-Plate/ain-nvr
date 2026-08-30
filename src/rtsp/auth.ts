import { createHash, randomBytes } from 'node:crypto';

export interface RtspCredentials {
  readonly username: string;
  readonly password: string;
}

interface BasicChallenge {
  readonly scheme: 'Basic';
  readonly realm?: string;
}

interface DigestChallenge {
  readonly scheme: 'Digest';
  readonly realm: string;
  readonly nonce: string;
  readonly opaque?: string;
  readonly algorithm: 'MD5' | 'MD5-sess';
  readonly qop?: 'auth';
  readonly stale: boolean;
}

export type RtspAuthChallenge = BasicChallenge | DigestChallenge;

export interface DigestAuthorizationState {
  readonly nonceCount: number;
  readonly cnonce: string;
}

function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

function parseParameters(value: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"((?:\\.|[^"])*)"|([^,\s]+))/gu;
  for (const match of value.matchAll(pattern)) {
    const name = (match[1] ?? '').toLowerCase();
    const raw = match[2] ?? match[3] ?? '';
    result.set(name, raw.replace(/\\([\\"])/gu, '$1'));
  }
  return result;
}

export function parseRtspAuthChallenge(value: string): RtspAuthChallenge {
  const digestIndex = value.search(/(?:^|,)\s*Digest\s+/iu);
  const basicIndex = value.search(/(?:^|,)\s*Basic\s+/iu);
  if (digestIndex >= 0) {
    const digest = value.slice(digestIndex).replace(/^[,\s]*/u, '').replace(/^Digest\s+/iu, '');
    const parameters = parseParameters(digest);
    const realm = parameters.get('realm');
    const nonce = parameters.get('nonce');
    if (!realm || !nonce) {
      throw new Error('Digest authentication challenge lacks realm or nonce.');
    }
    const rawAlgorithm = parameters.get('algorithm') ?? 'MD5';
    if (!/^MD5(?:-sess)?$/iu.test(rawAlgorithm)) {
      throw new Error(`Unsupported Digest algorithm ${rawAlgorithm}.`);
    }
    const rawQop = parameters.get('qop');
    const qops = rawQop?.split(',').map((item) => item.trim().toLowerCase());
    if (qops !== undefined && !qops.includes('auth')) {
      throw new Error('Digest challenge does not offer qop=auth.');
    }
    return {
      scheme: 'Digest',
      realm,
      nonce,
      ...(parameters.get('opaque') === undefined ? {} : { opaque: parameters.get('opaque') }),
      algorithm: /^MD5-sess$/iu.test(rawAlgorithm) ? 'MD5-sess' : 'MD5',
      ...(qops === undefined ? {} : { qop: 'auth' }),
      stale: parameters.get('stale')?.toLowerCase() === 'true',
    } as DigestChallenge;
  }

  if (basicIndex >= 0) {
    const basic = value.slice(basicIndex).replace(/^[,\s]*/u, '').replace(/^Basic\s+/iu, '');
    const realm = parseParameters(basic).get('realm');
    return { scheme: 'Basic', ...(realm === undefined ? {} : { realm }) };
  }
  throw new Error('Unsupported RTSP authentication challenge.');
}

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
