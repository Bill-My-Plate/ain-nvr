# recording-parser

Converts live media packets into recording write requests and index events. It tracks RTP continuity and time anchors, requests segment boundaries, and manages a bounded asynchronous writer pipeline.

## How it works

RecordingParser keeps per-track reorder and index state and serializes packets with RTSP interleaved headers. RecordingPipeline owns the source subscription, queue, writer lifecycle, and stop/flush behavior. TrackIndexer maps RTP time to recording time, using credible RTCP sender reports when available.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`serializeInterleavedFrame`** (value): Prefixes an RTP or RTCP packet with an RTSP interleaved header.
- **`RecordingParser`** (value): Orders packets and emits write/index work.
- **`RecordingWriteRequest`** (type): One byte write request with track and timing metadata.
- **`RecordingPacketWriter`** (type): Writer contract consumed by the parser or pipeline.
- **`RecordingIndexEvent`** (type): Index update emitted while recording.
- **`RecordingParserOptions`** (type): Parser tracks, timing and reorder settings.
- **`RecordingParserStatus`** (type): Parser counters and state snapshot.
- **`RecordingPipeline`** (value): Consumes a source and drives the parser and writer lifecycle.
- **`RecordingPacketSource`** (type): Subscription contract for live packets.
- **`RecordingPipelineState`** (type): Pipeline lifecycle state.
- **`RecordingPipelineOptions`** (type): Source, writer, queue and lifecycle settings.
- **`RecordingPipelineStatus`** (type): Pipeline state and queue counters.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/recording-parser/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/recording-parser/review-map.md).
