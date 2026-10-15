# camera

Owns the caller-facing camera contracts, recording pipeline adapter, packet source, and validation of camera identity, recording options, and frame options. It does not start workers or manage the process-wide camera registry.

## How it works

`CameraRecorder` follows a live `RtspStreamSession` and creates a `GenerationSource` for each stream generation. The source feeds `RecordingPipeline`, and `RecordingSegmentWriter` commits segments. The runtime uses the camera module's option validators before sending work to its worker.

**Internal entry point:** [`index.ts`](index.ts). Runtime code imports it through this entry point. There is no `ain-nvr/camera` package subpath; the existing `ain-nvr/camera-runtime` facade continues to expose the published camera types.

## Module API

- **`CommittedSegment`** (type): Completed segment metadata from `recording-storage`.
- **`CameraLease`** (type): Per-caller camera operations and release.
- **`CameraStatus`** (type): Camera, decoder, and recording health snapshot.
- **`FrameHandle`** (type): Frame subscription stop and readiness handle.
- **`FrameOptions`** (type): JPEG sampling and callback options.
- **`FrameProfile`** (type): Validated frame sampling profile.
- **`RecordingConfiguration`** (type): Validated recording settings passed to the worker.
- **`RecordingHandle`** (type): Recording boundary, stop, and completion handle.
- **`RecordingOptions`** (type): Recording request and callback options.
- **`CameraRecorder`** (value): Records one live camera session into segments.
- **`cameraIdentity`** (value): Validates a camera ID and RTSP URL.
- **`failure`** (value): Creates a coded camera error.
- **`frameProfile`** (value): Validates and defaults frame options.
- **`recordingConfiguration`** (value): Validates and normalizes recording options.

## Files and review

The root holds only `index.ts` and this README. Source files are grouped by role in `types/`, `services/`, `utils/`, and `constants/`. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/camera/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/camera/review-map.md).
