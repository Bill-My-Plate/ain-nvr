# rtsp-client

This module owns a single camera connection over RTSP or RTSPS. It opens a TCP or TLS socket, handles Basic and MD5 Digest authentication, negotiates an H.264 video track and optional PCMU/PCMA audio, starts playback, and emits interleaved RTP/RTCP frames. Session sharing, reconnect policy, media decoding, and recording belong to other modules.

## Connection flow

1. `RtspClient.connect()` opens the socket; `RtspNegotiationService` sends OPTIONS to learn available methods.
2. DESCRIBE returns SDP. The RTSP parser reads the response; SDP helpers select a controlled H.264 track and optional G.711 track.
3. SETUP requests RTP/RTCP over interleaved TCP channels. Video uses requested channels 0–1 and optional audio uses 2–3; the camera may select other channel identifiers.
4. PLAY starts media. The client returns the original SDP, parsed description, negotiated tracks, and session ID.
5. `RtspKeepaliveService` uses GET_PARAMETER when advertised, otherwise OPTIONS. `RtspMediaWatchdogService` disconnects after the configured period without RTP on a negotiated channel.
6. `close()` stops timers, attempts TEARDOWN, and closes the socket. `RtspStreamSession` owns reconnect attempts after a disconnect.

Internally, `RtspClient` owns the socket, parser dispatch, frame events, and shutdown. `RtspNegotiationService` owns the ordered OPTIONS/DESCRIBE/SETUP/PLAY exchange and the Session ID needed for TEARDOWN. `RtspRequestService` owns CSeq, authentication, pending responses, and request timeouts. `RtspKeepaliveService` and `RtspMediaWatchdogService` own their timers. These services are private to this module and are not exported by `index.ts`.

The socket can deliver arbitrary byte chunks. `RtspParser` reassembles RTSP messages and dollar-prefixed interleaved frames. A TCP chunk is not necessarily one complete RTSP message or one RTP packet. This client passes each complete interleaved frame to listeners; it does not parse RTP packet fields.

## Entry points and public API

The published path `ain-nvr/rtsp-client` maps through `src/exports/rtsp-client.ts` to this module's `index.ts`. Both ESM and CommonJS expose the same names.

- `RtspClient` — stateful connection. `connect()` returns a negotiated session; `close()` ends it; `pauseMedia()` and `resumeMedia()` control socket reads. It emits `interleaved` frames and `disconnect` errors.
- `RtspClientError` — connection or RTSP response failure. `statusCode` is set when an RTSP response status is available.
- `parseRtspAuthChallenge` — read a Basic or Digest `WWW-Authenticate` challenge. Unsupported or malformed values throw.
- `createRtspAuthorization` — create a Basic or MD5 Digest `Authorization` header and optional Digest state.
- `RtspClientOptions` — camera URL, connection/request/media timers, keepalive interval, and optional socket factory.
- `RtspClientSession` — original and parsed SDP, video track, optional audio track, session ID, and optional timeout.
- `RtspVideoTrack` / `RtspAudioTrack` — selected SDP media, payload map, control URL, and negotiated RTP/RTCP channel IDs; audio also identifies PCMU or PCMA.
- `RtspCredentials`, `RtspAuthChallenge`, and `DigestAuthorizationState` — inputs and state for authentication helpers.

Other files under `types/`, `utils/`, and `constants/` support those API entries. Only names re-exported by `index.ts` are available to other modules.

## Technical boundaries

- RTSP requests use protocol version 1.0 and ask for `RTP/AVP/TCP;unicast`. UDP and H.265 are outside this client's negotiated media path.
- Each outgoing request gets a CSeq. Pending responses are matched by that number and expire after `requestTimeoutMs`.
- A 401 response may trigger a Basic or Digest retry. Digest supports MD5 and MD5-sess with `qop=auth`. Existing quoted algorithm values accommodate cameras that reject the token form.
- A video SETUP failure ends connection setup. Optional audio SETUP failure leaves video usable. The media watchdog observes RTP channels, not RTCP-only traffic.
- Numeric ports, timers, retry counts, RTSP statuses, channel identifiers, and Digest widths live in `constants/`. They retain the previous values.
