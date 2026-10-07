# rtsp-parser

**Owns:** Bounded RTSP message, interleaved-frame, and SDP parsing.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Parser classes, limits, errors, SDP selectors, and parsed shapes.

**Invariant:** Parsing is incremental; incomplete input remains buffered until finish/reset.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
