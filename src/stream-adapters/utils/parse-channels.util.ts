






export function parseChannels(
  value: string | undefined,
): { readonly rtp: number; readonly rtcp: number } | undefined {
  if (value === undefined || !/RTP\/AVP\/TCP/iu.test(value)) return undefined;
  const match = /(?:^|;)\s*interleaved=(\d+)-(\d+)\s*(?:;|$)/iu.exec(value);
  if (match === null) return undefined;
  const rtp = Number(match[1]);
  const rtcp = Number(match[2]);
  if (!Number.isInteger(rtp) || !Number.isInteger(rtcp)
    || rtp < 0 || rtcp < 0 || rtp > 255 || rtcp > 255 || rtp === rtcp) {
    return undefined;
  }
  return { rtp, rtcp };
}
