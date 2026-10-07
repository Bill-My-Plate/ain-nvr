# media

**Owns:** Storage-neutral media contracts shared by live and recorded paths.

**Internal entrypoint:** [`index.ts`](index.ts) exposes TrackDescription and MediaPacket.

**Folders:** [types/](types/) (types, interfaces, and enums).

**Invariant:** Live packet generations are optional so custom and recorded packet sources remain compatible.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
