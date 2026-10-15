import type { RtspMessage } from '../../rtsp-parser/index.js';

import type { ClientState } from '../types/client-state.type.js';

/**
 * Writes one complete RTSP response with the request CSeq. Missing CSeq closes
 * the client because a response could not be matched to its request.
 * @param body Complete response body bytes, usually the UTF-8 SDP document;
 * the Content-Length header counts these bytes, not string characters.
 */
export function sendPlaybackRtspResponse(
  client: ClientState,
  request: RtspMessage,
  status: number,
  statusText: string,
  headers: Readonly<Record<string, string>> = {},
  body = Buffer.alloc(0),
): void {
  if (client.socket.destroyed || client.socket.writableEnded) return;
  const cseq = request.headers.get('cseq');
  if (cseq === undefined) {
    client.socket.destroy(new Error('Local RTSP client omitted CSeq.'));
    return;
  }
  const responseHeaders = {
    CSeq: cseq,
    Server: 'ain-nvr/playback',
    ...headers,
    'Content-Length': String(body.length),
  };
  const header = Buffer.from(
    `RTSP/1.0 ${status} ${statusText}\r\n${Object.entries(responseHeaders)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('')}\r\n`,
    'ascii',
  );
  client.socket.write(body.length === 0 ? header : Buffer.concat([header, body]));
}
