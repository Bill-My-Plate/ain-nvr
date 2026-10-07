# shared

**Owns:** Domain-independent errors, logging, and redaction.

**Internal entrypoint:** [`index.ts`](index.ts) exposes AinNvrError and logger helpers/contracts.

**Folders:** [types/](types/) (types and interfaces), [utils/](utils/) (single-purpose functions), [constants/](constants/) (named constants), [errors/](errors/) (error classes).

**Invariant:** Keep camera, media, and storage policy in their owning modules.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
