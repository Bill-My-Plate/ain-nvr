/** Byte count and numeral widths used in an MD5 Digest response. */
export const DIGEST_AUTH_FORMAT = {
  clientNonceBytes: 12,
  nonceCountRadix: 16,
  nonceCountWidth: 8,
} as const;
