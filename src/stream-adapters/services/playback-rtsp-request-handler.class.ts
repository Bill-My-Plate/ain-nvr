import type { RtspMessage } from '../../rtsp-parser/index.js';

import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import type { ClientState } from '../types/client-state.type.js';
import type { PlaybackRtspServerOptions } from '../types/playback-rtsp-server-options.type.js';
import { createPlaybackRtpInfo } from '../utils/create-playback-rtp-info.util.js';
import { createPlaybackSdp } from '../utils/create-playback-sdp.util.js';
import { parseChannels } from '../utils/parse-channels.util.js';
import { sendPlaybackRtspResponse } from '../utils/send-playback-rtsp-response.util.js';
import { trackFromPlaybackRtspUri } from '../utils/track-from-playback-rtsp-uri.util.js';
import { validPlaybackRtspUri } from '../utils/valid-playback-rtsp-uri.util.js';

/** Handles the local RTSP control handshake for one playback server. */
export class PlaybackRtspRequestHandler {
  /** Keeps protocol handling separate from the server's socket lifecycle. */
  public constructor(
    private readonly options: PlaybackRtspServerOptions,
    private readonly token: string,
    private readonly getUrl: () => string | undefined,
    private readonly onPlay: () => void,
  ) {}

  /**
   * Responds to one parsed RTSP message. SETUP stores channels on the client,
   * and PLAY releases the server's waiting playback sender after responding.
   */
  public handle(client: ClientState, request: RtspMessage): void {
    if (request.startLine.type !== 'request') {
      sendPlaybackRtspResponse(
        client,
        request,
        STREAM_ADAPTER_CONSTANTS.rtspBadRequest,
        'Bad Request',
      );
      return;
    }
    const method = request.startLine.method.toUpperCase();
    if (!validPlaybackRtspUri(request.startLine.uri, method, this.token)) {
      sendPlaybackRtspResponse(
        client,
        request,
        STREAM_ADAPTER_CONSTANTS.rtspNotFound,
        'Not Found',
      );
      return;
    }

    switch (method) {
      case 'OPTIONS':
        sendPlaybackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Public: 'OPTIONS, DESCRIBE, SETUP, PLAY, GET_PARAMETER, TEARDOWN',
        });
        return;
      case 'DESCRIBE': {
        const body = Buffer.from(
          createPlaybackSdp(this.options.configuration, this.options.audioSampleRate),
          'utf8',
        );
        sendPlaybackRtspResponse(
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
        const track = trackFromPlaybackRtspUri(request.startLine.uri);
        const channels = parseChannels(request.headers.get('transport'));
        if (
          track === undefined ||
          channels === undefined ||
          (track === 1 && this.options.audioSampleRate === undefined)
        ) {
          sendPlaybackRtspResponse(
            client,
            request,
            STREAM_ADAPTER_CONSTANTS.rtspUnsupportedTransport,
            'Unsupported Transport',
          );
          return;
        }
        client.channels.set(track, channels);
        sendPlaybackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: `${client.sessionId};timeout=${STREAM_ADAPTER_CONSTANTS.playbackSessionTimeoutSeconds}`,
          Transport: `RTP/AVP/TCP;unicast;interleaved=${channels.rtp}-${channels.rtcp}`,
        });
        return;
      }
      case 'PLAY':
        sendPlaybackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
          Range: 'npt=0.000-',
          'RTP-Info': createPlaybackRtpInfo(
            client,
            this.options,
            this.getUrl() as string,
          ),
        });
        client.playing = true;
        this.onPlay();
        return;
      case 'GET_PARAMETER':
        sendPlaybackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
        });
        return;
      case 'TEARDOWN':
        sendPlaybackRtspResponse(client, request, STREAM_ADAPTER_CONSTANTS.rtspOk, 'OK', {
          Session: client.sessionId,
        });
        client.socket.end();
        return;
      default:
        sendPlaybackRtspResponse(
          client,
          request,
          STREAM_ADAPTER_CONSTANTS.rtspMethodNotAllowed,
          'Method Not Allowed',
        );
    }
  }
}
