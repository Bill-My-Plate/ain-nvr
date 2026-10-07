# playback-wire

**Owns:** Versioned playback control and binary access-unit messages.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Wire constants, message shapes, encoder, decoder, and protocol error.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [constants/](constants/) (named constants), [errors/](errors/) (error classes).

**Invariant:** Keep message bytes, limits, and protocol version stable.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
