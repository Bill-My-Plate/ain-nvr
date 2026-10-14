# stream-adapters

Adapts media streams to network transport. It serves a local RTSP stream, bridges a live source to loopback RTSP, packetizes playback media, and forwards RTP over UDP.

## How it works

RtspLoopbackBridge exposes a live packet source through a local RTSP server. PlaybackRtspBridge drives a playback server with packetized media. RtpUdpForwarder forwards negotiated tracks to configured UDP destinations. These services own sockets and client lifecycle.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`RtspLoopbackBridge`** (value): Serves a live packet source to a local RTSP client.
- **`RtspBridgePacketSource`** (type): Live packet subscription contract for a bridge.
- **`RtspLoopbackBridgeOptions`** (type): Bridge source and listener settings.
- **`RtspLoopbackBridgeStatus`** (type): Bridge listener/client and stream status.
- **`RtpUdpForwarder`** (value): Forwards RTP packets from a session to UDP destinations.
- **`RtpUdpForwarderOptions`** (type): Destinations and track settings for forwarding.
- **`RtpUdpForwarderStatus`** (type): Forwarding counters and lifecycle status.
- **`PlaybackRtspBridge`** (value): Feeds playback media through a local RTSP server.
- **`PlaybackRtspBridgeOptions`** (type): Playback source and server settings.
- **`PlaybackRtspBridgeStart`** (type): URL and state returned when playback serving begins.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/stream-adapters/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/stream-adapters/review-map.md).
