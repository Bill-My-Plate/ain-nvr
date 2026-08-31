import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = join(packageDirectory, 'src');
const distributionDirectory = join(packageDirectory, 'dist');
const esmDirectory = join(distributionDirectory, 'esm');
const cjsDirectory = join(distributionDirectory, 'cjs');

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }

  return files;
}

async function copyDeclarations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await copyDeclarations(sourcePath);
      continue;
    }

    if (!entry.name.endsWith('.d.ts') && !entry.name.endsWith('.d.ts.map')) {
      continue;
    }

    const destinationPath = join(cjsDirectory, relative(esmDirectory, sourcePath));
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

await rm(distributionDirectory, { recursive: true, force: true });

const typeScriptCompiler = fileURLToPath(
  new URL('../node_modules/typescript/bin/tsc', import.meta.url),
);
execFileSync(
  process.execPath,
  [typeScriptCompiler, '-p', 'tsconfig.build.json'],
  { cwd: packageDirectory, stdio: 'inherit' },
);

const entryPoints = await collectTypeScriptFiles(sourceDirectory);
entryPoints.sort();

await build({
  entryPoints,
  outbase: sourceDirectory,
  outdir: cjsDirectory,
  bundle: false,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  define: {
    'import.meta.url': '__filename',
  },
});

await copyDeclarations(esmDirectory);
await Promise.all([
  writeFile(
    join(esmDirectory, 'package.json'),
    `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
  ),
  writeFile(
    join(cjsDirectory, 'package.json'),
    `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  ),
]);
