import type { DigestChallenge } from '../types/digest-challenge.type.js';
import type { RtspAuthChallenge } from '../types/rtsp-auth-challenge.type.js';
import { parseParameters } from './parse-parameters.util.js';

/** Select a supported Digest or Basic challenge and validate its required parameters. */
export function parseRtspAuthChallenge(value: string): RtspAuthChallenge {
  const digestIndex = value.search(/(?:^|,)\s*Digest\s+/iu);
  const basicIndex = value.search(/(?:^|,)\s*Basic\s+/iu);
  // Prefer Digest when a combined header also offers Basic.
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
