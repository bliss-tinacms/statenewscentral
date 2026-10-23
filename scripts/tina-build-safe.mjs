#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { sanitizeGeneratedClient } from './sanitize-generated-client.mjs';

const local = process.argv.includes('--local');
const run = (command, args, env = process.env) => spawnSync(command, args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
const tina = (args, env = process.env) => run('pnpm', ['exec', 'tinacms', ...args], env);
const astro = (env = process.env) => run('pnpm', ['exec', 'astro', 'build'], env);
const withoutTinaTokens = (source) => Object.fromEntries(
  Object.entries(source).filter(([key]) => !(key.toUpperCase().includes('TINA') && key.toUpperCase().includes('TOKEN'))),
);

let status = 1;
try {
  if (local) {
    status = tina(['build', '--local', '--skip-cloud-checks', '--noTelemetry', '-c', 'astro build']).status ?? 1;
  } else {
    // First prove the destination schema directly against Tina Cloud. This phase
    // may temporarily generate a credential-bearing client, so sanitize it before
    // any server bundle is compiled.
    const cloudEnv = { ...process.env, TINA_DIRECT_CLOUD_CHECK: '1' };
    const cloudCheck = tina(['build', '--noTelemetry', '-c', 'node --version'], cloudEnv);
    if ((cloudCheck.status ?? 1) !== 0) {
      status = cloudCheck.status ?? 1;
    } else {
      sanitizeGeneratedClient();
      const safeEnv = withoutTinaTokens(process.env);
      // Generate the deployed same-origin-proxy admin without any content token,
      // sanitize once more, then compile Astro in a separate token-free process.
      const adminBuild = tina(['build', '--skip-cloud-checks', '--noTelemetry', '-c', 'node --version'], safeEnv);
      if ((adminBuild.status ?? 1) !== 0) {
        status = adminBuild.status ?? 1;
      } else {
        sanitizeGeneratedClient();
        status = astro(safeEnv).status ?? 1;
      }
    }
  }
} finally {
  sanitizeGeneratedClient();
}
process.exit(status);
