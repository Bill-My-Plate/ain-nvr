# camera-runtime

Owns the process-wide managed camera registry. A caller acquires a lease for a camera, then starts recordings or JPEG frame delivery through that lease. The registry shares one camera owner across leases and supervises its worker and decoder processes.

## How it works

The owner counts leases and consumers, starts a worker for the camera, forwards status and frames, and tears resources down when the final lease or runtime closes. The worker runs the stream session and sends bounded events through process messages. Worker restart budgets are separate from normal RTSP reconnects.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`CommittedSegment`** (type): Metadata for a completed recording segment, re-exported from recording-storage.
- **`CameraRuntimeOptions`** (type): Registry limits, operation deadlines, frame size and restart settings.
- **`RecordingOptions`** (type): Recording request settings.
- **`FrameOptions`** (type): JPEG sampling and callback settings.
- **`RecordingHandle`** (type): Recording stop and completion handle.
- **`FrameHandle`** (type): Frame subscription stop handle.
- **`CameraStatus`** (type): Current camera, decoder, and recording health snapshot.
- **`CameraLease`** (type): Per-camera handle for status, recording, frames, and release.
- **`CameraRuntime`** (type): Acquire and close contract for the managed registry.
- **`getCameraRuntime`** (value): Returns the shared managed runtime for a context.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/camera-runtime/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/camera-runtime/review-map.md).
