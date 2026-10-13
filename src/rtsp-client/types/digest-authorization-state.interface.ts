/** State retained between requests using the same Digest challenge. */
export interface DigestAuthorizationState {
  /** Number of uses of the current Digest nonce. */
  readonly nonceCount: number;
  /** Client nonce reused with the current Digest challenge. */
  readonly cnonce: string;
}
