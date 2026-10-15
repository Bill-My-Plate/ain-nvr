# frame-extractor

Turns live RTSP video into sampled JPEG frames. It selects a usable decoder, loads Scrypted libav, and can either connect to a URL directly or consume a shared RTSP loopback bridge.

## How it works

The URL extractor owns its stop signal, status counters, and reconnect policy. Each `RtspFrameSession` owns one libav context and decoder. Its `FrameInactivityWatchdog` closes a stalled context; its `FrameJpegQueue` encodes one frame and retains at most one waiting frame. Native frames are destroyed after JPEG encoding, before the consumer callback. Session cleanup destroys the waiting frame, waits for the active callback, destroys the decoder, and closes the context. Completed reconnect delays remove their abort listeners. The shared extractor owns a loopback bridge and closes it on startup or shutdown failure. Decoder candidates depend on host hardware and available libav codecs. The native addon preload path must stay compatible with pkg.

`RtspFrameSession`, `FrameJpegQueue`, `FrameInactivityWatchdog`, and their option types are private implementation files. They are not exported from `index.ts`.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`LibavStreamLike`** (type): Minimal libav stream metadata contract.
- **`LibavPacketLike`** (type): Minimal encoded packet contract.
- **`LibavFrameLike`** (type): Minimal decoded frame contract.
- **`LibavDecoderLike`** (type): Decoder functions needed by the extractor.
- **`LibavReceivedPacket`** (type): Packet and stream metadata returned by libav.
- **`LibavReceivedFrame`** (type): Decoded frame and timing metadata returned by libav.
- **`LibavFormatContextLike`** (type): Demuxing context operations used by the extractor.
- **`LibavRuntime`** (type): Combined libav functions and objects used by the extractor.
- **`detectDecoderHostCapabilities`** (value): Detects host decoder capabilities.
- **`decoderCandidates`** (value): Orders decoder candidates for a codec and host.
- **`selectDecoder`** (value): Selects an available decoder from the candidates.
- **`isSaneFrame`** (value): Checks decoded frame dimensions and data before encoding.
- **`DecoderCandidate`** (type): One decoder choice.
- **`DecoderHostCapabilities`** (type): Host capabilities used for decoder selection.
- **`DecoderSelection`** (type): Chosen decoder and fallback information.
- **`FrameSampler`** (value): Decides whether a decoded frame is due at the configured rate.
- **`RtspUrlFrameExtractor`** (value): Connects to an RTSP URL and emits sampled JPEG frames.
- **`FrameExtractorState`** (type): Extractor lifecycle state.
- **`ExtractedJpegFrame`** (type): JPEG bytes and timing metadata delivered to consumers.
- **`RtspUrlFrameExtractorOptions`** (type): URL extractor connection and frame settings.
- **`preloadScryptedLibavNativeAddon`** (value): Loads the native addon through the pkg-compatible path.
- **`isScryptedLibavAvailable`** (value): Reports whether the native dependency can be loaded.
- **`createScryptedLibavRuntime`** (value): Creates the libav runtime used by an extractor.
- **`SharedRtspFrameExtractor`** (value): Extracts frames from an existing shared session through a local bridge.
- **`SharedRtspFrameExtractorOptions`** (type): Shared-session extractor settings.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/frame-extractor/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/frame-extractor/review-map.md).
