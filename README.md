# ain-nvr

`ain-nvr` is a dual ESM and CommonJS Node.js package for native RTSP recording
and playback.
It parses RTSP, RTP, RTCP, H.264, and G.711 without starting an `ffmpeg`
process.

The package deliberately does **not** decide how recordings are arranged on
disk. The application supplies byte readers, packet writers, and opaque
segment references. This keeps private cache paths, final paths, metadata JSON,
catalogs, retention, and access control inside the application.

## Supported scope

- Node.js 22 or newer.
- RTSP or RTSPS over TCP interleaving.
- H.264 video using single NAL, STAP-A, and FU-A RTP payloads.
- Optional PCMU or PCMA audio.
- Four-packet RTP reordering with sequence rollover and loss reporting.
- SPS/PPS discovery from SDP and in-band packets.
- Storage-neutral recording indexes and recorded `$` packet parsing.
- Decoder-safe playback as Annex-B H.264 and signed 16-bit PCM.
- JPEG extraction through the required `@scrypted/libav` dependency.

Not supported: RTSP/UDP, H.265, AAC, transcoding, container export, retention,
camera discovery, or a browser UI.

## Install

```bash
npm install ain-nvr
```

### Yarn Classic

`@scrypted/libav@1.0.212` calls `prebuild-install` from its install script but
declares that command only as a development dependency. Yarn Classic therefore
cannot find the command during a clean dependency build. Install with:

```bash
SKIP_SCRYPTED_LIBAV_PREBUILD=true yarn install
```

This skips only the broken upstream libav hook. The `ain-nvr` postinstall step
then downloads and verifies the required native binary through libav's runtime
installer. `createScryptedLibavRuntime().initialize()` performs the same check
again before use, so installations made with scripts disabled fail clearly at
runtime instead of silently disabling frame extraction.

### Bun

Bun blocks dependency lifecycle scripts unless the application trusts the
package. Trust `ain-nvr`, but do not trust `@scrypted/libav`:

```json
{
  "trustedDependencies": [
    "ain-nvr"
  ]
}
```

Then run:

```bash
bun install
```

Bun intentionally reports the upstream `@scrypted/libav` install script as
blocked. That is expected. The trusted `ain-nvr` postinstall uses libav's
runtime installer instead and verifies the native binary. Do not run
`bun pm trust @scrypted/libav` or `bun pm trust --all` for this dependency tree.

ESM applications can import public entrypoints:

```ts
import { RtspSessionManager } from 'ain-nvr/stream-session';
import { RecordingPipeline } from 'ain-nvr/recording-parser';
```

CommonJS applications can require the same entrypoints:

```js
const { RtspSessionManager } = require('ain-nvr/stream-session');
const { RecordingPipeline } = require('ain-nvr/recording-parser');
```

`@scrypted/libav` is a required package dependency, so every `ain-nvr`
installation includes native frame-extraction support. Normal RTSP parsing,
recording, and playback do not load its native binary. Importing
`ain-nvr/frame-extractor` also does not load it until `runtime.initialize()` or
an extractor is started.

### Packaging with `pkg`

`createScryptedLibavRuntime().initialize()` detects a `pkg` executable and
automatically preloads the native addon through a literal `require`. This lets
`pkg` discover the otherwise dynamically resolved addon and load it from the
executable cache. Applications normally do not need to call the public
`preloadScryptedLibavNativeAddon()` function themselves.

The consuming application must still include the platform addon in its own
`pkg.assets` configuration because a dependency cannot reliably control the
root application's asset list:

```json
{
  "pkg": {
    "assets": [
      "node_modules/@scrypted/libav/build/Release/addon.node"
    ]
  }
}
```

Build the package on the same operating system and architecture as the target.
Do not use a `linuxstatic` target because native addons require dynamic loading.

## Public entrypoints

| Import | Purpose |
| --- | --- |
| `ain-nvr` | Version, errors, logger, and metrics |
| `ain-nvr/rtsp-parser` | Streaming RTSP and `$` interleaved parsers |
| `ain-nvr/rtsp-client` | RTSP handshake, authentication, keepalive, and media timeout |
| `ain-nvr/rtp-parser` | RTP, RTCP, ordering, and clock helpers |
| `ain-nvr/h264` | H.264 payload, SPS/PPS, SPS, and access-unit logic |
| `ain-nvr/stream-session` | Reconnecting shared camera sessions and leases |
| `ain-nvr/recording-parser` | Sequential recording pipeline and semantic index events |
| `ain-nvr/recorded-stream-parser` | Parse stored RTSP-interleaved bytes through an abstract reader |
| `ain-nvr/playback` | Resolve abstract segments and emit video/audio playback units |
| `ain-nvr/playback-wire` | Optional browser control and binary message helpers |
| `ain-nvr/frame-extractor` | URL or shared-session libav-to-JPEG extraction |
| `ain-nvr/rtp-forwarder` | Bounded UDP forwarding building block |
| `ain-nvr/rtsp-bridge` | Tokenized loopback RTSP bridges for live sessions and recorded playback |

Only these entrypoints are public. Importing paths under `dist` is not
supported.

## Shared live stream

`RtspSessionManager` keeps one `RtspStreamSession` for each exact URL. Every
consumer receives a lease. The session is closed after the last lease is
released.

```ts
const manager = new RtspSessionManager();
const lease = await manager.acquire({ url: camera.streamUrl });

// Present after acquire() resolves. It contains the original SDP plus the
// negotiated channels and normalized SDP parameter sets for every track.
const { sdp, tracks } = lease.session.sessionInfo;

const stopPackets = lease.session.subscribeMediaPackets((packet) => {
  // packet.rawInterleavedFrame is the original "$" frame.
});

const stopPictures = lease.session.subscribeVideoAccessUnits((unit) => {
  // unit.data is encoded Annex-B H.264, not decoded pixels.
});

stopPictures();
stopPackets();
await lease.release();
```

The session reconnects with bounded exponential backoff. It parses every TCP
chunk incrementally and never assumes that one socket event equals one RTSP or
RTP packet. `sessionInfo` also preserves the original media `control` and
`fmtp` values. Invalid SDP parameter sets stay absent so an application can
replace them with authoritative in-band SPS/PPS later.

## Recording without exposing storage design

The application creates a writer. `ain-nvr` passes it an ordered packet and
boundary flags. The writer returns any location type the application chooses.
The package copies that same opaque value into its semantic index events.

```ts
type PrivateLocation = {
  cacheFileId: string;
  byteOffset: number;
};

const pipeline = new RecordingPipeline<PrivateLocation>({
  source: lease.session,
  tracks: lease.session.tracks,
  decoderSafeBoundaries: true,
  writer: {
    async write({ packet, boundaryBefore, discontinuityBefore }) {
      // Private application logic:
      // 1. rotate/open a cache file when boundaryBefore is true;
      // 2. append packet.rawInterleavedFrame;
      // 3. return the private logical location.
      return appendToPrivateCache(packet.rawInterleavedFrame, {
        boundaryBefore,
        discontinuityBefore,
      });
    },
  },
  async onIndexEvents(events) {
    // Translate semantic keyframe/playpoint/anchor events into private JSON.
    await privateMetadataStore.apply(events);
  },
  onError(error) {
    reportRecordingFailure(error);
  },
});

pipeline.requestBoundary();
pipeline.start();

// Later: stops intake, drains queued writes, and flushes RTP ordering.
await pipeline.stop();
```

Writes are serialized. The default queue pauses socket reads at 8 MiB, resumes
at 4 MiB, and fails at 16 MiB or 4,096 queued packets. These values can be
changed. A writer failure stops only this pipeline; it does not delete files.

`decoderSafeBoundaries` is optional and defaults to `false` for compatibility.
When enabled, the parser discards the unsafe initial prefix, waits for valid
H.264 configuration and a complete undamaged IDR, and applies requested or
reconnect boundaries only at another complete IDR. Packets before a requested
rotation continue in the old segment. Damaged candidate IDRs are skipped.

The writer owns all of these details:

- cache filename and directory;
- segment duration and rotation policy;
- metadata schema and update transaction;
- safe/published byte count;
- moving cache files to their final place;
- startup recovery and incomplete-file rules;
- catalog, permissions, retention, and deletion.

## Parsing private recordings

Playback receives bytes through `RecordedByteSource`. It can represent a normal
file, an active cache file, an object store range reader, or encrypted storage.

```ts
const source: RecordedByteSource = {
  id: 'safe identifier without a secret path',
  safeLength: metadata.publishedBytes,
  async read(offset, length, signal) {
    return privateStorage.readRange(segmentRef, offset, length, signal);
  },
};
```

`safeLength` is important. The parser will never read past it, even if the
physical file is longer. This prevents playback from reading a packet that has
been appended but not fully committed in metadata.

The host supplies `RecordedSegmentDescriptor` values with tracks and semantic
clock anchors. `RecordedRtspParser` validates `$` framing, uses short random
reads safely, reorders RTP per track, reports gaps, and maps RTP time to wall
clock time.

## Playback

The application implements `PlaybackSource` using its private catalog:

```ts
const playbackSource: PlaybackSource<PrivateSegmentRef> = {
  async resolveStart(cameraId, requestedTimeMs, signal) {
    // Private keyframe/playpoint lookup.
    return privateCatalog.resolveStart(cameraId, requestedTimeMs, signal);
  },
  async nextSegment(currentRef, signal) {
    return privateCatalog.nextCompatibleSegment(currentRef, signal);
  },
};

for await (const message of createPlaybackStream({
  source: playbackSource,
  cameraId,
  startTimeMs,
  signal,
})) {
  sendToPrivatePlaybackTransport(message);
}
```

Playback scans until it has valid SPS, PPS, and a complete IDR. The scan is
bounded to 30 seconds or 64 MiB by default. It skips damaged access units,
stops at explicit recording gaps, reports configuration changes, and emits:

- `ready` with the decoder configuration;
- Annex-B encoded H.264 `video` access units;
- optional signed 16-bit PCM `audio` units;
- `configuration` before a changed keyframe;
- `end` with a clear reason.

The package does not create WebSockets or browser decoders. The application may
use `ain-nvr/playback-wire` or translate messages to its existing protocol.

`PlaybackRtspBridge` adapts the same playback stream to a temporary RTSP/TCP
URL for a local media process. It copies Annex-B H.264 into RTP and exposes
decoded G.711 audio as L16. The server binds only to `127.0.0.1`, uses an
unguessable path, enforces bounded socket queues, and stops at `endTimeMs`.
The host still owns FFmpeg, output containers, files, retries, and cleanup:

```ts
const bridge = new PlaybackRtspBridge({
  playback: createPlaybackStream({
    source: playbackSource,
    cameraId,
    startTimeMs,
    signal,
  }),
  endTimeMs,
  audioSampleRate: 8_000,
  signal,
});

try {
  const { url, requestedStartTimeMs, actualStartTimeMs } = await bridge.start();
  const mediaProcess = startLocalMediaProcess(url);
  await bridge.run();
  await mediaProcess;
} finally {
  await bridge.stop();
}
```

## JPEG frame extraction

When a native session already exists, `SharedRtspFrameExtractor` reuses its RTP
packets. Libav connects to a tokenized RTSP bridge bound only to `127.0.0.1`, so
there is still only one camera connection:

```ts
const extractor = new SharedRtspFrameExtractor({
  id: camera.id,
  source: lease.session,
  runtime: createScryptedLibavRuntime(),
  framesPerSecond: 4,
  jpegQuality: 0.9,
  async onFrame(frame) {
    await detectionQueue.accept(frame);
  },
});

await extractor.start();
await extractor.stop();
```

The bridge forwards original video RTP/RTCP payloads and supplies SDP to libav.
It disconnects a slow local decoder instead of pausing the camera socket shared
with recording and live view.

The independent URL mode remains available:

`RtspUrlFrameExtractor` opens an RTSP/TCP URL through `@scrypted/libav`, selects
H.264, waits for a keyframe, probes platform decoders, converts selected frames
to JPEG, and calls `onFrame`. It does not write JPEGs to disk.

```ts
const extractor = new RtspUrlFrameExtractor({
  id: camera.id,
  url: camera.streamUrl,
  runtime: createScryptedLibavRuntime(),
  framesPerSecond: 4,
  jpegQuality: 0.9,
  async onFrame(frame) {
    await detectionQueue.accept(frame);
  },
});

extractor.start();
await extractor.stop();
```

The URL-based form creates its own camera connection. Prefer the shared form
when recording or live view already owns an `RtspStreamSession`.

## Documentation

- [Architecture and ownership](docs/architecture.md)
- [RTSP, RTP, and H.264 parsing](docs/protocol-parsing.md)
- [Recording and playback contracts](docs/recording-playback.md)
- [BMP backend integration plan](docs/bmp-integration.md)
- [Frame extraction](docs/frame-extraction.md)

## Development

```bash
npm install
npm run check
npm test
npm run build
npm pack --dry-run
```

The TypeScript bindings in this repository are MIT licensed. The required
native libav/FFmpeg dependency has its own LGPL and component license terms.
This statement describes the dependency boundary; it is not legal advice.
# Recording lifecycle contracts (0.1.6)

Session-manager acquisition is cancellable per consumer. Aborting a pending lease
does not cancel another consumer's wait. Release each successful lease once it is
no longer needed; the last reference closes the camera connection. A stopped
manager rejects new acquisitions.

`RtspStreamSession.snapshot` contains the current `generation` and `sessionInfo`.
`subscribeSessionChanges(listener)` announces each new negotiated snapshot before
any packets from that generation, including setup-buffered packets. The callback
is synchronous and is not replayed; subscribe first, then read `snapshot`.
Live `MediaPacket` values include `sessionGeneration`. Custom and recorded packet
sources may omit it for compatibility. Consumers must reject mismatched
generations or recreate their parser before accepting changed tracks.

`RecordingPipeline` accepts an optional awaited `onBatchComplete` callback. It
runs after the parser's index callbacks for each successful processing or flush
batch, even when no index events were produced. A host writer can rotate a file
inside `write`, retain the old file as pending, and publish it only after this
callback. Do not publish failed/incompletely drained segments as complete.
Disk layout, metadata publication, retention and recovery policy remain host-owned.
