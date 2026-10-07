# ain-nvr repository rules

These rules apply to changes in this repository. Extend this file as the refactoring work establishes more conventions.

## 1. Support ESM and CommonJS

Every public entrypoint must work through both `import` and `require`. Preserve both branches of the `package.json` export map, their JavaScript output, and their TypeScript declarations when adding or moving code. Keep worker and decoder entrypoints usable from the packed package. Check the result with `npm run check`, `npm test`, and `npm pack --dry-run`; the export and packed-runtime tests are part of this contract.

## 2. Do not add dynamic runtime imports

Do not introduce runtime `import()` in `src/` or shipped scripts. A `pkg` executable can run CommonJS in a VM without a dynamic-import callback. Use static ESM imports for fixed dependencies. When loading must be deferred, use a literal `require` for dependencies that `pkg` must discover; use `createRequire` where ESM needs CommonJS loading. Keep the native addon path visible to `pkg` as a literal require.

`import type` and `typeof import('module')` are TypeScript type syntax, not runtime dynamic imports. Test code may use `import()` to verify ESM consumers because tests are not packaged in the executable.

Leave the existing working `import()` calls in `src/frame-extractor/scrypted-libav-runtime.ts` and `scripts/install-libav.mjs` alone. The runtime call is outside the `pkg` branch, and the install script runs outside the packaged executable. Do not copy those patterns into new packaged code.
