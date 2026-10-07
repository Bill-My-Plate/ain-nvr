# rtsp-client

**Owns:** RTSP authentication, negotiation, keepalive, and socket lifecycle.

**Internal entrypoint:** [`index.ts`](index.ts) exposes RtspClient, auth helpers, options, and errors.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes), [errors/](errors/) (error classes).

**Invariant:** Authentication and terminal connection errors retain their public codes.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
