# h264

**Owns:** H.264 NAL inspection, configuration discovery, SPS parsing, and access-unit assembly.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Codec classes, payload helpers, NAL types, and access-unit shapes.

**Invariant:** Damaged units are dropped without corrupting the next access unit.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
