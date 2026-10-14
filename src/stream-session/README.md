# stream-session

This module keeps one live, reconnecting RTSP/TCP connection per exact camera URL and shares it through reference-counted leases. It turns negotiated RTSP channels into media packets and assembled H.264 video access units. It owns connection lifecycle, retry timing, track snapshots, early-media buffering, and live video reordering. The RTSP client, RTP parser, H.264 parser, and media types remain in their own modules.

## How it works

`RtspSessionManager.acquire({ url, signal })` reuses a session for the exact URL or creates one, then waits until it streams. Every successful acquisition returns a lease. Releasing the final lease closes that session. `stop()` closes all managed sessions and makes the manager unusable. An abort signal cancels one caller's wait without stopping a session held by another caller.

`RtspStreamSession` runs the reconnect loop and owns public state and events. Each loop iteration uses an internal `RtspConnectionAttempt` to attach client listeners, bound frames received during negotiation, and clean up that client. On each successful connection the session reads the camera SDP and negotiated channels, creates a new generation snapshot, then asks the attempt to drain its queued frames. Snapshot subscribers run before packet subscribers see media from that generation. Connection failures trigger exponential retry until `stop()` is called; the first unsupported-codec, authentication, or unsupported-transport error can reject a caller waiting for the initial stream.

For each complete four-byte-header `$` frame, the internal `RtspMediaProcessor` matches its channel to a track. It parses RTP or RTCP payloads, publishes a `MediaPacket`, then reorders video RTP packets before H.264 access-unit assembly. A new connection, SSRC change, or sufficiently large backward video timestamp jump marks a video discontinuity. Packet subscriber exceptions are reported as `subscriber-error`; parse failures are reported as `packet-error`. `RtspStreamSession` keeps the public subscription methods and forwards them to the processor.

## Module API

The internal entry point is [index.ts](index.ts). The published package path `ain-nvr/stream-session` goes through [src/exports/stream-session.ts](../exports/stream-session.ts).

- `RtspSessionManager`: shares sessions by exact URL. `acquire()` returns a `RtspSessionLease`, `activeSessionCount` reports managed URLs, and `stop()` closes all sessions.
- `RtspStreamSession`: owns one connection and its reconnect loop. `start()` waits for streaming; `stop()` ends it. `state`, `tracks`, `snapshot`, and `sessionInfo` expose current state and negotiation details. `sessionInfo` throws before streaming.
- `subscribeSessionChanges()`: receives future `RtspSessionSnapshot` values before their media. It does not replay the current snapshot; read `snapshot` for that.
- `subscribeMediaPackets()`: receives each `MediaPacket`, including its original interleaved bytes, channel, optional track/RTP/RTCP data, arrival time, and discontinuity flag.
- `subscribeVideoAccessUnits()`: receives assembled H.264 access units after live RTP reordering.
- `pauseMedia()` and `resumeMedia()`: reference-count pause requests so multiple consumers can coordinate pausing.
- EventEmitter events: `state`, `ready`, `reconnecting`, `initial-error`, `packet-error`, and `subscriber-error` report lifecycle or processing events. `ready` carries the negotiated client session; error events carry an `Error`.
- `RtspSessionManagerOptions` and `RtspStreamSessionOptions`: connection factory and retry settings; stream options also allow an arrival-time clock.
- `RtspSessionLease`, `SessionState`, `RtspSessionInfo`, `RtspSessionTrackInfo`, and `RtspSessionSnapshot`: public lifecycle and negotiation shapes.
- `MediaPacket` and `TrackDescription`: compatibility re-exports from the media module.

`RtspConnectionAttempt`, `RtspMediaProcessor`, utilities, and constants are implementation details; they are not exported from this module's entry point. Public interface declarations remain interfaces to preserve the published TypeScript API.

For a flow diagram and review order, see [how-it-works.md](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/stream-session/how-it-works.md) and [review-map.md](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/stream-session/review-map.md).
