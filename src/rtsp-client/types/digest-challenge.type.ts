/** Supported parameters of a Digest authentication challenge. */
export type DigestChallenge = {
  /** Authentication scheme named by the challenge. */
  readonly scheme: 'Digest';
  /** Authentication realm supplied by the camera. */
  readonly realm: string;
  /** Camera nonce used in the Digest response. */
  readonly nonce: string;
  /** Optional camera value returned unchanged to the camera. */
  readonly opaque?: string;
  /** Supported Digest hashing variant. */
  readonly algorithm: 'MD5' | 'MD5-sess';
  /** Digest quality of protection, when provided. */
  readonly qop?: 'auth';
  /** Whether the camera reports that a nonce has expired. */
  readonly stale: boolean;
};
