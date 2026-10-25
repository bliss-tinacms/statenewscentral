#!/usr/bin/env node
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = resolve(import.meta.dirname, '..');
const required = [
  'scripts/test-seo-contract.mjs',
  'src/lib/seo.ts',
  'src/lib/data.ts',
  'src/pages/[...slug].astro',
  'src/pages/author/[...slug].astro',
  'src/components/BaseHead.astro',
  ...['page', 'blog', 'category', 'user'].map((name) => `tina/collections/${name}.ts`),
];

const cases = [
  {
    name: 'lightweight page payload cannot replace full document fetch',
    file: 'src/pages/[...slug].astro',
    mutate: (text) => text.replace('page = await getPublicPage(documentSlug)', 'page = null'),
    expected: 'homepage fetches full Tina document',
  },
  {
    name: 'stale singleton cannot outrank fresh category connection',
    file: 'src/pages/[...slug].astro',
    mutate: (text) => text.replace('preferFreshConnectionRecord(listedCategory, fetchedCategory, postCategory)', 'preferFreshConnectionRecord(fetchedCategory, listedCategory, postCategory)'),
    expected: 'category route uses freshness helper',
  },
  {
    name: 'public Page query cannot omit metaDescription',
    file: 'src/lib/data.ts',
    mutate: (text) => {
      const start = text.indexOf('query Page($relativePath: String!)');
      assert.ok(start >= 0);
      const end = text.indexOf('`;', start);
      return text.slice(0, start) + text.slice(start, end).replace('metaTitle metaDescription', 'metaTitle') + text.slice(end);
    },
    expected: 'Page: public detail query omits SEO field metaDescription',
  },
  {
    name: 'canonical head output cannot disappear',
    file: 'src/components/BaseHead.astro',
    mutate: (text) => text.replace('<link rel="canonical" href={canonicalURL} />', ''),
    expected: 'BaseHead missing required output',
  },
];

const results = [];
for (const testCase of cases) {
  const root = mkdtempSync(resolve(tmpdir(), 'snc-seo-negative-'));
  try {
    for (const file of required) {
      const target = resolve(root, file);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(resolve(sourceRoot, file), target);
    }
    const target = resolve(root, testCase.file);
    const original = readFileSync(target, 'utf8');
    const mutated = testCase.mutate(original);
    assert.notEqual(mutated, original, `${testCase.name}: mutation did not apply`);
    writeFileSync(target, mutated);
    const run = spawnSync(process.execPath, [resolve(root, 'scripts/test-seo-contract.mjs')], { encoding: 'utf8' });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.notEqual(run.status, 0, `${testCase.name}: positive gate incorrectly accepted the defect`);
    assert.ok(output.includes(testCase.expected), `${testCase.name}: failed for the wrong reason\n${output}`);
    results.push({ name: testCase.name, status: 'REJECTED_AS_REQUIRED' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ schema: 'seo-contract-negative-v1', status: 'PASS', controlledNegatives: results }, null, 2));
