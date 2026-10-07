# rtp-parser

**Owns:** RTP/RTCP parsing, packet reordering, and timestamp mapping.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Packet/RTCP shapes, parsers, reorder buffer, and clock helpers.

**Invariant:** Preserve sequence rollover and sender-report clock anchors.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
