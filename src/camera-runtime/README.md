# camera-runtime

Owns the process-wide managed camera registry, leases, worker and decoder lifecycles, IPC, status delivery, and recovery. It imports camera behavior through `camera/index.ts`; the camera module never imports runtime.

## How it works

`getCameraRuntime` returns one registry for a context. A caller acquires a lease, and `CameraOwner` shares one worker across leases for the same camera. `CameraWorkerHost` starts the worker. Inside it, `CameraEngine` coordinates the RTSP session, commands, status, and shutdown. `CameraRecordingController` owns the camera module's recorder and its event acknowledgements. `CameraFrameController` owns frame subscribers, the loopback bridge, and the decoder lifecycle; `DecoderProcess` starts the separate JPEG process. The owner restarts a failed worker within its configured budget and closes resources after the last lease or runtime closes.

Each frame subscriber gets a private JPEG byte buffer. The worker transfers that buffer to the main thread through the frame port; the main thread wraps the received bytes as a `Buffer` without copying them again. Frame acknowledgements bound outstanding work. The decoder remains a separate process and still sends JPEGs through process IPC.

On Linux, a decoder child that fails during hardware decoding gets one CPU-only retry. The retry keeps the same RTSP bridge, worker, and frame subscriptions. The replacement must produce a JPEG before the configured first-frame deadline.

**Internal entry point:** [`index.ts`](index.ts). The published `ain-nvr/camera-runtime` facade and root re-export retain the same names in ESM and CommonJS.

## Module API

- **`CommittedSegment`** (type): Completed segment metadata, re-exported through camera.
- **`CameraLease`** (type): Per-caller camera handle, re-exported through camera.
- **`CameraStatus`** (type): Camera health snapshot, re-exported through camera.
- **`FrameHandle`** (type): Frame subscription handle, re-exported through camera.
- **`FrameOptions`** (type): JPEG request options, re-exported through camera.
- **`RecordingHandle`** (type): Recording handle, re-exported through camera.
- **`RecordingOptions`** (type): Recording request options, re-exported through camera.
- **`CameraRuntimeOptions`** (type): Registry limits and timeouts.
- **`CameraRuntime`** (type): Acquire and close contract.
- **`getCameraRuntime`** (value): Returns the shared managed runtime for a context.

## Files and review

The root holds only `index.ts` and this README. Source files are grouped by role in `types/`, `services/`, `utils/`, `constants/`, and `entries/`. The two entry scripts stay beside the runtime so the packed worker and decoder paths remain stable. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/camera-runtime/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/camera-runtime/review-map.md).
