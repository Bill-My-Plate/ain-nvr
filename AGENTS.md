# ain-nvr repository rules

These rules apply to new source and to source changed during refactoring. Existing files can be migrated in small steps without unrelated renames. Extend this file as the refactoring work establishes more conventions.

## 1. Support ESM and CommonJS

Every public entrypoint must work through both `import` and `require`. Preserve both branches of the `package.json` export map, their JavaScript output, and their TypeScript declarations when adding or moving code. Keep worker and decoder entrypoints usable from the packed package. Check the result with `npm run check`, `npm test`, and `npm pack --dry-run`; the export and packed-runtime tests are part of this contract.

## 2. Do not add dynamic runtime imports

Do not introduce runtime `import()` in `src/` or shipped scripts. A `pkg` executable can run CommonJS in a VM without a dynamic-import callback. Use static ESM imports for fixed dependencies. When loading must be deferred, use a literal `require` for dependencies that `pkg` must discover; use `createRequire` where ESM needs CommonJS loading. Keep the native addon path visible to `pkg` as a literal require.

`import type` and `typeof import('module')` are TypeScript type syntax, not runtime dynamic imports. Test code may use `import()` to verify ESM consumers because tests are not packaged in the executable.

Leave the existing working `import()` calls in `src/frame-extractor/create-scrypted-libav-runtime.util.ts` and `scripts/install-libav.mjs` alone. The runtime call is outside the `pkg` branch, and the install script runs outside the packaged executable. Do not copy those patterns into new packaged code.

## 3. One entity per file

Keep one top-level entity in each production source file: one type alias, interface, class, function, constant, or enum. Put supporting declarations in their own files, or make behavior private to the owning class. An `index.ts` entrypoint may re-export several entities but should define none. Tests and build scripts are outside this layout rule.

## 4. Use type aliases by default

Declare shapes with `type`. Use `interface` only for a contract that a class implements. Keep each declaration in its own file.

## 5. Name files by role

Use kebab-case for the name and a role suffix when the role is clear: `camera.service.ts`, `camera.type.ts`, `rtsp-parsing.util.ts`, `format-url.util.ts`. Other roles may use matching suffixes, such as `.parser.ts` or `.interface.ts`. Reserve `index.ts` for a module entrypoint. Do not rename unrelated existing files only to satisfy this rule.

## 6. Give each module one internal entrypoint

Keep modules inside this repository. Each top-level module under `src/` should expose its intended cross-module API through one `index.ts`. Explicitly re-export the types, services, and utilities other modules need; keep private implementation out of that entrypoint. Code inside a module may import its own files directly. Code in another module should import through the target module's entrypoint. The existing `src/exports/*` and `src/index.ts` remain public package facades and must preserve current consumer subpaths and names during migration.

## 7. Share only genuinely common code

Move a utility or service to `src/shared/` when more than one module needs the same domain-independent behavior. Keep domain-specific code with its owning module, even when another module uses it; expose that behavior through the owner's entrypoint. Do not create a shared dumping ground or move code solely because it might be reused later.

## 8. Do not create dependency cycles

New source imports must not create a cycle between files or modules. If a cycle appears, move the shared contract to its owning lower-level module or to `src/shared/` when it is truly common. `npm run check` runs `scripts/check-architecture.mjs`; its direct module dependency list is the enforced boundary. Document the ownership reason before adding a new allowed edge.

## 9. Protect behavior during refactoring

For each refactor, add or update focused tests for the behavior being moved before changing its structure. Check observable errors, callbacks, cleanup, and generated recording files where relevant. Keep the public ESM, CommonJS, and packed-runtime tests green.

## 10. Document module responsibility

Give each new or refactored module a short responsibility note describing what it owns, what its `index.ts` exposes, and any non-obvious lifecycle or data invariants. Update that note when the boundary changes. Keep routine implementation details in code rather than duplicating them in documentation.
