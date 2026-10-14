import { AinNvrError } from '../../shared/index.js';
import {
  parseSdp,
  resolveRtspControlUrl,
  selectG711AudioMedia,
  selectH264VideoMedia,
} from '../../rtsp-parser/index.js';
import { RTSP_PLAY_RANGE } from '../constants/rtsp-play-range.constant.js';
import { RTSP_TRANSPORT } from '../constants/rtsp-transport.constant.js';
import type { RtspAudioTrack } from '../types/rtsp-audio-track.interface.js';
import type { RtspNegotiationResult } from '../types/rtsp-negotiation-result.type.js';
import { interleavedChannels } from '../utils/interleaved-channels.util.js';
import { parseSession } from '../utils/parse-session.util.js';
import type { RtspRequestService } from './rtsp-request-service.class.js';

/** Negotiate one H.264 RTSP session and optional G.711 audio over TCP. */
export class RtspNegotiationService {
  /** Session ID becomes available after video SETUP for TEARDOWN during later steps. */
  public sessionId: string | undefined;

  /** Use the camera request URL and the owner's authenticated request service. */
  public constructor(
    private readonly requestUrl: string,
    private readonly requests: RtspRequestService,
  ) {}

  /** Send OPTIONS, DESCRIBE, SETUP, and PLAY in order; return the negotiated tracks. */
  public async negotiate(): Promise<RtspNegotiationResult> {
    const optionsResponse = await this.requests.request('OPTIONS', this.requestUrl);

    // Video is required; resolve its control URI using the camera's SDP and Content-Base.
    const describe = await this.requests.request('DESCRIBE', this.requestUrl, {
      headers: { Accept: 'application/sdp' },
    });
    const sdp = describe.body.toString('utf8');
    const description = parseSdp(sdp);
    const selected = selectH264VideoMedia(description);
    if (selected === undefined || !selected.media.control) {
      throw new AinNvrError(
        'unsupported_codec',
        'DESCRIBE response has no controlled H.264 video track.',
      );
    }
    const contentBase =
      describe.headers.get('content-base') ?? describe.headers.get('content-location');
    const controlUrl = resolveRtspControlUrl(
      this.requestUrl,
      selected.media.control,
      description.sessionControl,
      contentBase,
    );

    // Negotiate video first because its Session header identifies the session.
    const setup = await this.requests.request('SETUP', controlUrl, {
      headers: { Transport: RTSP_TRANSPORT.videoHeader },
    });
    const session = parseSession(setup.headers.get('session'));
    this.sessionId = session.sessionId;
    const videoChannels = interleavedChannels(
      setup.headers.get('transport'),
      RTSP_TRANSPORT.videoRtpChannel,
      RTSP_TRANSPORT.videoRtcpChannel,
    );
    const { rtpChannel, rtcpChannel } = videoChannels;

    // A rejected optional audio SETUP leaves the video session usable.
    let audio: RtspAudioTrack | undefined;
    const selectedAudio = selectG711AudioMedia(description);
    if (selectedAudio?.media.control) {
      const audioControlUrl = resolveRtspControlUrl(
        this.requestUrl,
        selectedAudio.media.control,
        description.sessionControl,
        contentBase,
      );
      try {
        const audioSetup = await this.requests.request('SETUP', audioControlUrl, {
          headers: {
            Session: this.sessionId,
            Transport: RTSP_TRANSPORT.audioHeader,
          },
        });
        const audioChannels = interleavedChannels(
          audioSetup.headers.get('transport'),
          RTSP_TRANSPORT.audioRtpChannel,
          RTSP_TRANSPORT.audioRtcpChannel,
        );
        audio = {
          codec: selectedAudio.codec,
          media: selectedAudio.media,
          rtpMap: selectedAudio.rtpMap,
          controlUrl: audioControlUrl,
          ...audioChannels,
        };
      } catch {
        // Optional audio failure must not interrupt video recording.
      }
    }

    // Start media only after all accepted tracks have been SETUP.
    await this.requests.request('PLAY', this.requestUrl, {
      headers: { Session: this.sessionId, Range: RTSP_PLAY_RANGE },
    });
    return {
      optionsResponse,
      session: {
        sdp,
        description,
        video: {
          media: selected.media,
          rtpMap: selected.rtpMap,
          controlUrl,
          rtpChannel,
          rtcpChannel,
        },
        ...(audio === undefined ? {} : { audio }),
        sessionId: this.sessionId,
        ...(session.timeoutSeconds === undefined
          ? {}
          : { sessionTimeoutSeconds: session.timeoutSeconds }),
      },
    };
  }
}
