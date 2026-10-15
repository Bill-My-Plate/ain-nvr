# playback

Builds asynchronous playback from stored segments and paces media against recording timestamps. It also converts G.711 audio and coordinates independent audio and video tracks.

## How it works

`createPlaybackStream` resolves the start position and traverses recording segments. Its private `PlaybackStreamProcessor` converts parsed packets into media messages, retains decoder and pending-audio state across continuous segments, and flushes the final access unit at a terminating boundary. PlaybackPacer controls timing, pauses, resumes, and waits for downstream acknowledgement. Independent track scheduling prevents one track from serially blocking the other.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`createG711AccessUnit`** (value): Converts a G.711 payload to a PCM audio access unit.
- **`PcmAudioAccessUnit`** (type): Decoded PCM samples and their timing metadata.
- **`PlaybackMediaError`** (value): Failure while interpreting playback media.
- **`createPlaybackStream`** (value): Creates the asynchronous playback message stream.
- **`PlaybackSegment`** (type): Descriptor of one segment to play.
- **`PlaybackStart`** (type): Resolved playback starting position.
- **`PlaybackSource`** (type): Source of stored recording segments and packet bytes.
- **`PlaybackControl`** (type): Playback control messages.
- **`PlaybackMessage`** (type): Media or control message yielded during playback.
- **`PlaybackOptions`** (type): Playback range, pacing, and cancellation settings.
- **`PlaybackPacer`** (value): Schedules media according to timestamps and acknowledgements.
- **`runIndependentPlaybackTracks`** (value): Runs audio and video playback tracks with independent pacing.
- **`PlaybackPacerOptions`** (type): Timing and acknowledgement limits for the pacer.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/playback/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/playback/review-map.md).
