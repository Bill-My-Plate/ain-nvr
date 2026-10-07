# recording-storage

**Owns:** Managed runtime schema-1 file writing and durable metadata publication.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Writer, metadata contracts, path helpers, and file operations.

**Invariant:** Media bytes are durable before published JSON; failed segments stay partial.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
