# playback

**Owns:** Recorded-segment lookup, access-unit emission, G.711 decoding, and pacing.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Playback stream creation, pacer, message contracts, and audio helper.

**Invariant:** Complete pending units precede a gap or terminal end; incomplete units are excluded.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
