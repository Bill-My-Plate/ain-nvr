# stream-session

**Owns:** Shared reconnecting camera sessions and reference-counted leases.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Session manager, stream session, lifecycle types, and compatibility re-exports.

**Folders:** [types/](types/) (types and interfaces), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes).

**Invariant:** Publish each negotiated generation snapshot before packets from that generation; close after the final lease.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
