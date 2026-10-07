# camera-runtime

**Owns:** Managed camera registry, workers, recording, frame callbacks, and process protocol.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Camera runtime API, worker/decoder contracts, and lifecycle support.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes), [constants/](constants/) (named constants), [entries/](entries/) (worker and decoder process scripts).

**Invariant:** Worker entry filenames remain stable; isolate failures and settle leases/callbacks on shutdown.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
