# frame-extractor

**Owns:** Decoder selection, libav loading, JPEG sampling, and URL/shared-session extractors.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Extractor classes, runtime loader, decoder helpers, and frame contracts.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes), [constants/](constants/) (named constants).

**Invariant:** Load native libav lazily and keep pkg addon loading visible to static require.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
