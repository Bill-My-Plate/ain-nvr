# rtsp-parser

**Owns:** Bounded RTSP message, interleaved-frame, and SDP parsing.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Parser classes, limits, errors, SDP selectors, and parsed shapes.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes), [constants/](constants/) (named constants), [errors/](errors/) (error classes).

**Invariant:** Parsing is incremental; incomplete input remains buffered until finish/reset. `RtspHeaders` stores names in lowercase and accepts any case for lookup and mutation. `RtspMessage.headers` is typed as `RtspHeaders`, which is exported from the module and package facade.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
