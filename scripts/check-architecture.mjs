import { API } from 'typescript/unstable/sync';
import * as ast from 'typescript/unstable/ast';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const modules = new Set([
  'shared', 'rtsp-parser', 'rtp-parser', 'h264', 'media', 'rtsp-client',
  'stream-session', 'recorded-stream-parser', 'recording-parser', 'playback',
  'playback-wire', 'recording-storage', 'stream-adapters', 'frame-extractor',
  'camera-runtime',
]);
const allowedModuleEdges = new Map(Object.entries({
  shared: [],
  'rtsp-parser': [],
  'rtp-parser': [],
  h264: ['rtp-parser'],
  media: ['h264', 'rtp-parser', 'rtsp-parser'],
  'rtsp-client': ['rtsp-parser', 'shared'],
  'stream-session': ['h264', 'media', 'rtp-parser', 'rtsp-client', 'rtsp-parser', 'shared'],
  'recorded-stream-parser': ['media', 'rtp-parser', 'rtsp-parser', 'shared'],
  'recording-parser': ['h264', 'media', 'rtp-parser', 'shared'],
  playback: ['h264', 'recorded-stream-parser', 'shared'],
  'playback-wire': [],
  'recording-storage': ['h264', 'recording-parser', 'stream-session'],
  'stream-adapters': ['h264', 'media', 'playback', 'rtsp-parser', 'shared', 'stream-session'],
  'frame-extractor': ['shared', 'stream-adapters'],
  'camera-runtime': ['frame-extractor', 'recording-parser', 'recording-storage', 'stream-adapters', 'stream-session'],
}).map(([name, targets]) => [name, new Set(targets)]));
const files = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(name);
    else if (entry.name.endsWith('.ts')) files.push(name);
  }
}
visit(root);
const fileSet = new Set(files);
const edges = new Map(files.map(file => [file, new Set()]));
const moduleEdges = new Map([...modules].map(name => [name, new Set()]));
const problems = [];
const api = new API();
function expectedRoleFolder(filename) {
  if (/\.(type|interface|enum)\.ts$/.test(filename)) return 'types';
  if (filename.endsWith('.util.ts')) return 'utils';
  if (filename.endsWith('.constant.ts')) return 'constants';
  if (filename.endsWith('-error.class.ts')) return 'errors';
  if (filename.endsWith('.class.ts')) return 'services';
  if (['camera-worker-entry.ts', 'decoder-process-entry.ts'].includes(filename)) return 'entries';
  return null;
}
function cycleIn(graph) {
  const active = new Set();
  const done = new Set();
  const trace = [];
  function walk(node) {
    if (active.has(node)) return [...trace.slice(trace.indexOf(node)), node];
    if (done.has(node)) return null;
    active.add(node);
    trace.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = walk(next);
      if (cycle) return cycle;
    }
    trace.pop();
    active.delete(node);
    done.add(node);
    return null;
  }
  for (const node of graph.keys()) {
    const cycle = walk(node);
    if (cycle) return cycle;
  }
  return null;
}
try {
  const snapshot = api.updateSnapshot({ openProjects: [path.resolve('tsconfig.json')] });
  const program = snapshot.getProjects()[0].program;
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep);
    const owner = relative.length > 1 ? relative[0] : null;
    const isModule = modules.has(owner);
    const isEntry = isModule && relative[1] === 'index.ts';
    if (isModule && !isEntry) {
      const expected = expectedRoleFolder(path.basename(file));
      if (relative.length !== 3 || expected === null || relative[1] !== expected) {
        problems.push(`${path.relative(root, file)} must be in its module's role folder`);
      }
    }
    const source = program.getSourceFile(file);
    if (!source) { problems.push(`Missing TypeScript source: ${file}`); continue; }
    const declarations = source.statements.filter(node =>
      ast.isTypeAliasDeclaration(node) || ast.isInterfaceDeclaration(node) ||
      ast.isClassDeclaration(node) || ast.isFunctionDeclaration(node) ||
      ast.isVariableStatement(node) || ast.isEnumDeclaration(node) ||
      ast.formatSyntaxKind(node.kind) === 'ModuleDeclaration',
    );
    if (isModule && !isEntry) {
      for (const statement of source.statements) {
        if (ast.isImportDeclaration(statement) || ast.isExportDeclaration(statement) ||
            declarations.includes(statement)) continue;
        if (['camera-worker-entry.ts', 'decoder-process-entry.ts'].includes(path.basename(file)) &&
            ast.isExpressionStatement(statement)) continue;
        problems.push(`${path.relative(root, file)} has an unexpected top-level statement`);
      }
    }
    if (isModule && declarations.length > 1) {
      problems.push(`${path.relative(root, file)} declares ${declarations.length} entities`);
    }
    if (isModule && declarations.length === 1 &&
        !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(type|interface|class|util|constant|enum)\.ts$/.test(path.basename(file)) &&
        !['camera-worker-entry.ts', 'decoder-process-entry.ts'].includes(path.basename(file))) {
      problems.push(`${path.relative(root, file)} needs a kebab-case role suffix`);
    }
    for (const declaration of declarations) {
      if (ast.isVariableStatement(declaration) && declaration.declarationList.declarations.length !== 1) {
        problems.push(`${path.relative(root, file)} declares multiple constants`);
      }
    }
    if (isEntry && source.statements.some(node => !ast.isExportDeclaration(node) || !node.exportClause)) {
      problems.push(`${path.relative(root, file)} must contain only explicit re-exports`);
    }
    const inspect = node => {
      if (ast.isCallExpression(node) && ast.formatSyntaxKind(node.expression.kind) === 'ImportKeyword' &&
          path.relative(root, file) !== 'frame-extractor/utils/create-scrypted-libav-runtime.util.ts') {
        problems.push(`${path.relative(root, file)} adds a dynamic runtime import`);
      }
      node.forEachChild(inspect);
    };
    source.forEachChild(inspect);
    for (const statement of source.statements) {
      if (!ast.isImportDeclaration(statement) && !ast.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier?.text;
      if (!specifier?.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts'));
      if (!fileSet.has(target)) {
        problems.push(`${path.relative(root, file)} cannot resolve ${specifier}`);
        continue;
      }
      edges.get(file).add(target);
      const targetRelative = path.relative(root, target).split(path.sep);
      const targetModule = targetRelative.length > 1 ? targetRelative[0] : null;
      if (isModule && modules.has(targetModule) && owner !== targetModule) {
        moduleEdges.get(owner).add(targetModule);
        if (!allowedModuleEdges.get(owner).has(targetModule)) {
          problems.push(`${path.relative(root, file)} adds an unapproved ${owner} -> ${targetModule} dependency`);
        }
        if (targetRelative[1] !== 'index.ts') {
          problems.push(`${path.relative(root, file)} imports inside ${targetModule}; use its index.ts`);
        }
      }
    }
  }
  for (const name of modules) {
    if (!fileSet.has(path.join(root, name, 'index.ts'))) problems.push(`${name} has no index.ts`);
    for (const entry of readdirSync(path.join(root, name), { withFileTypes: true })) {
      if (entry.isFile() && !['index.ts', 'README.md'].includes(entry.name)) {
        problems.push(`${name}/${entry.name} belongs in a role folder`);
      }
      if (entry.isDirectory() &&
          (!['types', 'utils', 'services', 'constants', 'errors', 'entries'].includes(entry.name) ||
           readdirSync(path.join(root, name, entry.name)).length === 0)) {
        problems.push(`${name}/${entry.name} is not a populated role folder`);
      }
    }
  }
  const fileCycle = cycleIn(edges);
  if (fileCycle) problems.push(`File cycle: ${fileCycle.map(file => path.relative(root, file)).join(' -> ')}`);
  const moduleCycle = cycleIn(moduleEdges);
  if (moduleCycle) problems.push(`Module cycle: ${moduleCycle.join(' -> ')}`);
  const installScript = readFileSync(path.resolve('scripts/install-libav.mjs'), 'utf8');
  const installImports = installScript.match(/\bimport\s*\(/g) ?? [];
  if (installImports.length !== 1 || !installScript.includes("import('@scrypted/libav')")) {
    problems.push('scripts/install-libav.mjs may only keep its existing libav dynamic import');
  }
  snapshot.dispose();
} finally { api.close(); }
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed: ${modules.size} modules, ${files.length} source files, no cycles or deep cross-module imports.`);
}
