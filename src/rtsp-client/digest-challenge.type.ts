

export type DigestChallenge = {
  readonly scheme: 'Digest';
  readonly realm: string;
  readonly nonce: string;
  readonly opaque?: string;
  readonly algorithm: 'MD5' | 'MD5-sess';
  readonly qop?: 'auth';
  readonly stale: boolean;
};
