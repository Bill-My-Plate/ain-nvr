# recorded-stream-parser

**Owns:** Bounded parsing of stored RTSP-interleaved bytes through an abstract reader.

**Internal entrypoint:** [`index.ts`](index.ts) exposes RecordedRtspParser, source/segment shapes, and errors.

**Invariant:** Never read beyond safeLength; tolerate short reads while preserving packet gaps.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
