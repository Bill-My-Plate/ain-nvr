# stream-adapters

**Owns:** Loopback RTSP bridges, playback RTSP serving, RTP packetization, and UDP forwarding.

**Internal entrypoint:** [`index.ts`](index.ts) exposes Bridge/server classes, packetizer, and forwarder.

**Invariant:** Loopback URLs are token scoped; slow clients cannot stall a shared upstream.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.
