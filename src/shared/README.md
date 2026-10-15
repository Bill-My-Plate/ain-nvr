# shared

Contains the common error contract and `asError`, which normalizes unknown thrown values for camera and runtime code. It has no domain-specific service.

## How it works

AinNvrError carries a typed error code and optional cause. Domain errors may extend it when they need the same cross-module error contract; this module is not a catch-all for unrelated helpers.

**Internal entry point:** [`index.ts`](index.ts). Cross-module imports use this entry point. Published package subpaths are defined by `src/exports/` and `package.json`.

## Module API

- **`AinNvrError`** (value): Base error with an ain-nvr code and optional cause.
- **`AinNvrErrorCode`** (type): Allowed base error codes.
- **`asError`** (value): Converts an unknown thrown value to an `Error`.

## Files and review

The module groups declarations in `types/`, utilities in `utils/`, stateful classes in `services/`, and other roles in their matching folders when present. See the [how-it-works guide](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/shared/how-it-works.md) and [file-by-file review map](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/shared/review-map.md).
