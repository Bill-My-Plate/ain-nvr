/**
 * Cause requiring a new recording time/index boundary.
 */
export type DiscontinuityReason = 'source-reconnect' | 'ssrc-change' | 'timestamp-reset';
