# rtp-parser

Parses complete RTP and RTCP packets and provides ordering and clock helpers for live recording and playback.

## How it works

RTP parsing validates the fixed 12-byte header and optional CSRC, extension and padding regions. RTCP scanning finds sender reports in a compound packet. Reorder state is keyed by caller-owned stream identity; callers reset it on a new stream. Timestamp helpers handle 16-bit sequence and 32-bit clock rollover.

The internal entry point is [`index.ts`](index.ts); the published path is `ain-nvr/rtp-parser`. Packet parsers accept complete RTP/RTCP payloads after the RTSP interleaved header has been removed. Parsed `Buffer.subarray` fields share the input bytes.

## Module API

- **`parseRtpPacket`** (value): Parses one complete RTP packet.
- **`RtpPacket`** (type): Parsed RTP header fields and payload view.
- **`RtpTimestampUnwrapper`** (value): Unwraps 32-bit RTP timestamps into a bigint timeline.
- **`rtpTicksToMicroseconds`** (value): Converts RTP clock ticks to microseconds.
- **`RtpClockMapper`** (value): Maps unwrapped RTP timestamps to wall-clock time.
- **`RtpReorderBuffer`** (value): Buffers a small RTP sequence window and reports loss.
- **`ReorderedPacket`** (type): Ordered value with the preceding loss count.
- **`ReorderResult`** (type): Packets and loss/duplicate status from one reorder operation.
- **`RtcpPacketError`** (value): Error for malformed RTCP data.
- **`parseRtcpSenderReport`** (value): Parses an individual RTCP sender report.
- **`findRtcpSenderReport`** (value): Finds the first sender report in compound RTCP bytes.
- **`RtcpSenderReport`** (type): Parsed sender-report time and count fields.

For packet layout, call flow and review order, see the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/rtp-parser/how-it-works.md) and [review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/rtp-parser/review-map.md).
