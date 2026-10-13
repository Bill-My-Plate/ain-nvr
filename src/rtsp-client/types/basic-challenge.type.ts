/** Basic authentication challenge offered by the camera. */
export type BasicChallenge = {
  /** Authentication scheme named by the challenge. */
  readonly scheme: 'Basic';
  /** Authentication realm supplied by the camera. */
  readonly realm?: string;
};
