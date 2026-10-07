# shared

**Owns:** Domain-independent errors, logging, redaction, and robustness counters.

**Internal entrypoint:** [`index.ts`](index.ts) exposes AinNvrError, logger helpers/contracts, and robustness metrics.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes), [constants/](constants/) (named constants), [errors/](errors/) (error classes).

**Invariant:** Keep camera, media, and storage policy in their owning modules.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
