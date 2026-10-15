import type { RtspMessage } from '../../rtsp-parser/index.js';

import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import type { BridgeClient } from '../types/bridge-client.type.js';
import { parseInterleavedChannels } from '../utils/parse-interleaved-channels.util.js';
import { sendLoopbackRtspResponse } from '../utils/send-loopback-rtsp-response.util.js';
import { validLoopbackRtspUri } from '../utils/valid-loopback-rtsp-uri.util.js';

/** Negotiates RTSP control requests for clients of one loopback listener. */
export class RtspLoopbackRequestHandler {
  /** Receives the server URL, current SDP, and preroll sender from the bridge. */
  public constructor(
    private readonly token: string,
    private readonly getUrl: () => string | undefined,
    private readonly getSdp: () => string,
    private readonly onPlay: (client: BridgeClient) => void,
  ) {}

  /** Handles one parsed request while preserving channel and PLAY state on the client. */
  public handle(client: BridgeClient, request: RtspMessage): void {
    if (request.startLine.type !== 'request') {
      sendLoopbackRtspResponse(
        client,
        request,
        STREAM_ADAPTER_CONSTANTS.rtspBadRequest,
        'Bad Request',
      );
      return;
    }
    const method = request.startLine.method.toUpperCase();
    if (!validLoopbackRtspUri(request.startLine.uri, method, this.token)) {
      sendLoopbackRtspResponse(
        client,
        request,
        STREAM_ADAPTER_CONSTANTS.rtspNotFound,
        'Not Found',
      );
      return;
    }
    switch (method) {
      case 'OPTIONS':
        sendLoopbackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Public: 'OPTIONS, DESCRIBE, SETUP, PLAY, PAUSE, GET_PARAMETER, SET_PARAMETER, TEARDOWN',
        });
        return;
      case 'DESCRIBE': {
        const body = Buffer.from(this.getSdp(), 'utf8');
        sendLoopbackRtspResponse(
          client,
          request,
          STREAM_ADAPTER_CONSTANTS.rtspOk,
          'OK',
          {
            'Content-Type': 'application/sdp',
            'Content-Base': `${this.getUrl() as string}/`,
          },
          body,
        );
        return;
      }
      case 'SETUP': {
        const channels = parseInterleavedChannels(request.headers.get('transport'));
        if (channels === undefined) {
          sendLoopbackRtspResponse(
            client,
            request,
            STREAM_ADAPTER_CONSTANTS.rtspUnsupportedTransport,
            'Unsupported Transport',
          );
          return;
        }
        client.rtpChannel = channels.rtpChannel;
        client.rtcpChannel = channels.rtcpChannel;
        sendLoopbackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: `${client.sessionId};timeout=${STREAM_ADAPTER_CONSTANTS.loopbackSessionTimeoutSeconds}`,
          Transport: `RTP/AVP/TCP;unicast;interleaved=${client.rtpChannel}-${client.rtcpChannel}`,
        });
        return;
      }
      case 'PLAY':
        sendLoopbackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
          Range: 'npt=0.000-',
          'RTP-Info': `url=${this.getUrl() as string}/trackID=0`,
        });
        client.playing = true;
        this.onPlay(client);
        return;
      case 'PAUSE':
        client.playing = false;
        sendLoopbackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
        });
        return;
      case 'GET_PARAMETER':
      case 'SET_PARAMETER':
        sendLoopbackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
        });
        return;
      case 'TEARDOWN':
        client.playing = false;
        sendLoopbackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
        });
        client.socket.end();
        return;
      default:
        sendLoopbackRtspResponse(
          client,
          request,
          STREAM_ADAPTER_CONSTANTS.rtspMethodNotAllowed,
          'Method Not Allowed',
        );
    }
  }
}
