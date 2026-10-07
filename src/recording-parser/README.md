# recording-parser

**Owns:** Storage-neutral packet indexing and ordered writer calls.

**Internal entrypoint:** [`index.ts`](index.ts) exposes RecordingParser, RecordingPipeline, events, writer contracts, and serialization helper.

**Invariant:** Flush/index callbacks complete before the host publishes a segment.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
