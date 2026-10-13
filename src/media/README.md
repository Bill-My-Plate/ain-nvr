# media

This module owns the shared TypeScript contracts for negotiated media tracks and live RTSP/TCP packets. It contains no runtime service or parser. Its [internal entrypoint](index.ts) exports two types:

## API

### `TrackDescription`

[TrackDescription](types/track-description.interface.ts) describes one negotiated video or audio track. It carries a logical `trackId`, media type, codec, RTP payload type and clock rate, and the interleaved TCP channels used for RTP and RTCP. Optional `parameterSets` supplies H.264 SPS/PPS data when available. The stream session creates track descriptions after RTSP negotiation; recording, recorded stream parsing, and stream adapters use them to identify tracks and interpret packet timing.

### `MediaPacket`

[MediaPacket](types/media-packet.interface.ts) represents one RTSP interleaved frame delivered by a live session or a compatible custom source. It contains arrival time, channel, the parsed `frame`, and `rawInterleavedFrame` bytes. The raw bytes begin with a four-byte header: `$` marker, channel, and a two-byte big-endian payload length, followed by that many RTP or RTCP bytes.

The optional `track` identifies the negotiated channel. `rtp` is present for parsed RTP packets, and `rtcpSenderReport` is present when a sender report is found. `discontinuity` flags a break in media continuity. A live stream also supplies `sessionGeneration` so consumers can distinguish packets across reconnects; custom sources may omit it. Recording and stream adapters consume this contract. Stored playback uses a separate `RecordedPacket` type.

## Entry points and boundaries

Other source modules import these types through [`index.ts`](index.ts). Package consumers import them from `ain-nvr/stream-session`, which re-exports both types; there is no `ain-nvr/media` package subpath.

The module contains only [types/](types/). RTSP framing, RTP parsing, live packet creation, and recording policy belong to their respective modules.
