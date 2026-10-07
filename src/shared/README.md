# shared

**Owns:** The domain-independent error and its code.

**Internal entrypoint:** [`index.ts`](index.ts) exposes AinNvrError and AinNvrErrorCode.

**Folders:** [types/](types/) (error code), [errors/](errors/) (error class).

**Invariant:** Keep camera, media, and storage policy in their owning modules.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
