import { readFileSync } from 'node:fs';
import path from 'node:path';
import { API } from 'typescript/unstable/sync';
import { checkInterfaceUsage } from './checks/check-interface-usage.mjs';

const root = process.cwd();
const baseline = JSON.parse(readFileSync(path.join(root, 'test/public-api-baseline.json'), 'utf8'));
const legacyPublicInterfaces = new Set(baseline.legacyPublicInterfaces);
const api = new API();
try {
  const snapshot = api.updateSnapshot({ openProjects: [path.join(root, 'tsconfig.json')] });
  const program = snapshot.getProjects()[0].program;
  const { violations, publicInterfaces } = checkInterfaceUsage(
    program, path.join(root, 'src'), legacyPublicInterfaces,
  );
  if (violations.length) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
  } else {
    console.log(`Convention check passed: ${publicInterfaces.size} compatible public interfaces.`);
  }
  snapshot.dispose();
} finally {
  api.close();
}
