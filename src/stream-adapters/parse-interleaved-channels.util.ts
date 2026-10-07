








export function parseInterleavedChannels(transport: string | undefined): {
  readonly rtpChannel: number;
  readonly rtcpChannel: number;
} | undefined {
  if (transport === undefined || !/RTP\/AVP\/TCP/iu.test(transport)) return undefined;
  const match = /(?:^|;)\s*interleaved=(\d+)-(\d+)\s*(?:;|$)/iu.exec(transport);
  if (match === null) return undefined;
  const rtpChannel = Number(match[1]);
  const rtcpChannel = Number(match[2]);
  if (!Number.isInteger(rtpChannel) || !Number.isInteger(rtcpChannel)
    || rtpChannel < 0 || rtcpChannel < 0
    || rtpChannel > 255 || rtcpChannel > 255
    || rtpChannel === rtcpChannel) return undefined;
  return { rtpChannel, rtcpChannel };
}
