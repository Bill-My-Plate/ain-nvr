# recording-storage

Persists recording packets and metadata to disk. It writes temporary segment files and publishes completed segments with an index only after the data is ready.

## How it works

The segment writer coordinates packet offsets, metadata, rotation, and finalization. File publication uses atomic rename helpers so readers do not see partially committed segments. PacketLocation points to an offset in the stored byte stream.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`PacketLocation`** (type): Location of one packet within a segment file.
- **`CommittedSegment`** (type): Metadata and file paths for a published segment.
- **`RecordingSegmentWriter`** (value): Writes packet bytes and commits completed segments.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/recording-storage/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/recording-storage/review-map.md).
