import type { RtspMessage } from '../../rtsp-parser/index.js';

import type { BridgeClient } from '../types/bridge-client.type.js';

/**
 * Writes a complete RTSP response tied to the request CSeq, or closes a client
 * whose request cannot be matched because CSeq is missing.
 * @param body Complete response body bytes, usually UTF-8 SDP. Content-Length
 * counts these bytes rather than characters or TCP chunks.
 */
export function sendLoopbackRtspResponse(
  client: BridgeClient,
  request: RtspMessage,
  status: number,
  statusText: string,
  headers: Readonly<Record<string, string>> = {},
  body = Buffer.alloc(0),
): void {
  const cseq = request.headers.get('cseq');
  if (cseq === undefined) {
    client.socket.destroy(new Error('Local RTSP client omitted CSeq.'));
    return;
  }
  const allHeaders: Record<string, string> = {
    CSeq: cseq,
    Server: 'ain-nvr/0.1',
    ...headers,
    'Content-Length': String(body.length),
  };
  const head = Buffer.from(
    `RTSP/1.0 ${status} ${statusText}\r\n${Object.entries(allHeaders)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('')}\r\n`,
    'ascii',
  );
  client.socket.write(body.length === 0 ? head : Buffer.concat([head, body]));
}
