# recorded-stream-parser

Reads recorded RTSP interleaved bytes and reconstructs per-track RTP packets using stored segment metadata. It provides packet timing and sequence gap information to playback.

## How it works

A segment descriptor supplies track/channel information and clock anchors. The parser scans stored bytes, selects RTP channels, reorders packets per track, and reports gaps. It does not open a live camera connection or write recordings.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`RecordedStreamError`** (value): Error raised for invalid recorded media.
- **`RecordedRtspParser`** (value): Parses recorded interleaved bytes into ordered packets.
- **`RecordedByteSource`** (type): Contract for reading bytes from a stored segment.
- **`ClockAnchor`** (type): RTP-to-wall-clock timing reference.
- **`RecordedSegmentDescriptor`** (type): Stored segment and track information required for parsing.
- **`SequenceGap`** (type): Lost or skipped RTP sequence range.
- **`RecordedPacket`** (type): Parsed packet with recording time and gap metadata.
- **`RecordedRtspParserOptions`** (type): Parser limits and reorder settings.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/recorded-stream-parser/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/recorded-stream-parser/review-map.md).
