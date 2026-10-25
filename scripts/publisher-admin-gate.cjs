#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORIGIN = process.env.PUBLISHER_GATE_ORIGIN || 'https://www.statenewscentral.com';
const STATE = process.env.PUBLISHER_GATE_STATE || '/tmp/snc-pw/snc-publisher-state.json';
const REPORT = process.env.PUBLISHER_GATE_REPORT || '/tmp/snc-publisher-admin-gate-v2.json';
const ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = { ...loadEnv(path.resolve('.env')), ...process.env };
const CLIENT = env.NEXT_PUBLIC_TINA_CLIENT_ID || env.TINA_CLIENT_ID;
const TOKEN = env.TINA_TOKEN || env.NEXT_PUBLIC_TINA_TOKEN || env.PUBLIC_TINA_TOKEN;
const BRANCH = env.NEXT_PUBLIC_TINA_BRANCH || env.TINA_BRANCH || 'main';
if (!CLIENT || !TOKEN) throw new Error('Tina client/token unavailable');
const API = `https://content.tinajs.io/2.4/content/${CLIENT}/github/${encodeURIComponent(BRANCH)}`;

const pageFields = ['seo.metaTitle', 'seo.metaDescription', 'seo.ogTitle', 'seo.ogDescription'];
const specs = [
  { collection: 'Page', document: 'home', relativePath: 'home.mdx', admin: '/admin/#/~', path: '/', fields: pageFields, markerPrefix: 'QA-PAGE' },
  { collection: 'Blog', document: 'what-rising-insurance-premiums-mean-for-household-budgets', relativePath: 'what-rising-insurance-premiums-mean-for-household-budgets.mdx', admin: '/admin/index.html#/collections/edit/blog/what-rising-insurance-premiums-mean-for-household-budgets', path: '/what-rising-insurance-premiums-mean-for-household-budgets/', field: 'title', markerPrefix: 'QA-BLOG' },
  { collection: 'Category', document: 'business', relativePath: 'business.json', admin: '/admin/index.html#/collections/edit/category/business', path: '/business/', field: 'seo.metaDescription', markerPrefix: 'QA-CATEGORY' },
  { collection: 'User', document: 'cheryl-nielsen', relativePath: 'cheryl-nielsen.json', admin: '/admin/index.html#/collections/edit/user/cheryl-nielsen', path: '/author/cheryl-nielsen/', field: 'role', markerPrefix: 'QA-USER' },
  { collection: 'Navigation', document: 'header', relativePath: 'header.json', admin: '/admin/index.html#/collections/edit/navigation/header', path: '/', field: 'items.0.label', markerPrefix: 'QA-NAV' },
  { collection: 'Global Config', document: 'config', relativePath: 'config.json', admin: '/admin/index.html#/collections/edit/config/config', path: '/', field: 'footer.copyrightText', markerPrefix: 'QA-GLOBAL' },
];
const requestedCollections = (process.env.PUBLISHER_GATE_COLLECTIONS || '').split(',').map(x => x.trim()).filter(Boolean);
const runSpecs = requestedCollections.length ? specs.filter(x => requestedCollections.includes(x.collection)) : specs;
if (!runSpecs.length) throw new Error('No Publisher gate collections selected');

const queries = {
  Page: `query Q($relativePath:String!){page(relativePath:$relativePath){seo{metaTitle metaDescription ogTitle ogDescription}}}`,
  Blog: `query Q($relativePath:String!){blog(relativePath:$relativePath){title}}`,
  Category: `query Q($relativePath:String!){category(relativePath:$relativePath){seo{metaDescription}}}`,
  User: `query Q($relativePath:String!){user(relativePath:$relativePath){role}}`,
  Navigation: `query Q($relativePath:String!){navigation(relativePath:$relativePath){items{label}}}`,
  'Global Config': `query Q($relativePath:String!){config(relativePath:$relativePath){footer{copyrightText}}}`,
};
function extract(spec, data) {
  if (spec.collection === 'Page') return Object.fromEntries(pageFields.map(f => [f, data.page?.seo?.[f.split('.')[1]] ?? '']));
  if (spec.collection === 'Blog') return data.blog?.title ?? '';
  if (spec.collection === 'Category') return data.category?.seo?.metaDescription ?? '';
  if (spec.collection === 'User') return data.user?.role ?? '';
  if (spec.collection === 'Navigation') return data.navigation?.items?.[0]?.label ?? '';
  return data.config?.footer?.copyrightText ?? '';
}
async function backend(spec) {
  const r = await fetch(API, { method: 'POST', headers: { 'X-API-KEY': TOKEN, 'content-type': 'application/json', 'accept-encoding': 'identity' }, body: JSON.stringify({ query: queries[spec.collection], variables: { relativePath: spec.relativePath } }) });
  if (!r.ok) throw new Error(`backend HTTP ${r.status}`);
  const p = await r.json();
  if (p.errors?.length) throw new Error(`backend GraphQL error: ${p.errors.map(x => x.message).join('; ')}`);
  return extract(spec, p.data || {});
}
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
async function poll(label, fn, predicate, timeout = 300000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    try { last = await fn(); if (predicate(last)) return last; } catch (e) { last = String(e); }
    await sleep(5000);
  }
  throw new Error(`${label} timeout`);
}
async function openEditor(page, spec) {
  await page.goto(ORIGIN + spec.admin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const first = spec.fields?.[0] || spec.field;
  if (!await page.locator(`[name="${first}"]`).isVisible().catch(() => false)) {
    if (first.startsWith('seo.')) await page.getByRole('button', { name: /^SEO/ }).click();
    else if (spec.collection === 'Navigation') await page.getByText('US News', { exact: true }).first().click();
    else if (spec.collection === 'Global Config') await page.getByRole('button', { name: 'Footer', exact: true }).click();
  }
  await page.locator(`[name="${first}"]`).waitFor({ state: 'visible', timeout: 30000 });
}
async function uiValue(page, spec) {
  if (spec.fields) {
    const out = {}; for (const f of spec.fields) out[f] = await page.locator(`[name="${f}"]`).inputValue(); return out;
  }
  return page.locator(`[name="${spec.field}"]`).inputValue();
}
async function fillValue(page, spec, value) {
  if (spec.fields) { for (const f of spec.fields) await page.locator(`[name="${f}"]`).fill(value[f]); }
  else await page.locator(`[name="${spec.field}"]`).fill(value);
}
async function saveIfChanged(page, spec, target) {
  const current = await uiValue(page, spec);
  if (equal(current, target)) return { changed: false, successfulResponses: 0 };
  await fillValue(page, spec, target);
  const saveButton = page.getByRole('button', { name: 'Save', exact: true }).last();
  await poll(`${spec.collection} Save button enabled`, () => saveButton.isEnabled(), Boolean, 30000);
  const responses = [];
  const listener = r => { if (r.request().method() === 'POST' && (r.url().includes('tina') || r.url().includes('content'))) responses.push(r.status()); };
  page.on('response', listener);
  await saveButton.click();
  await page.waitForTimeout(5000);
  page.off('response', listener);
  const ok = responses.filter(x => x >= 200 && x < 300).length;
  return { changed: true, successfulResponses: ok };
}
async function publicSnapshot(browser, spec) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${ORIGIN}${spec.path}?publisher-gate=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let value;
  if (spec.collection === 'Page') value = {
    'seo.metaTitle': await p.title(),
    'seo.metaDescription': await p.locator('meta[name="description"]').getAttribute('content') || '',
    'seo.ogTitle': await p.locator('meta[property="og:title"]').getAttribute('content') || '',
    'seo.ogDescription': await p.locator('meta[property="og:description"]').getAttribute('content') || '',
    twitterTitle: await p.locator('meta[name="twitter:title"]').getAttribute('content') || '',
    twitterDescription: await p.locator('meta[name="twitter:description"]').getAttribute('content') || '',
  };
  else if (spec.collection === 'Category') value = await p.locator('meta[name="description"]').getAttribute('content') || '';
  else value = await p.locator('body').innerText();
  await c.close(); return value;
}
function markerValue(spec) {
  if (spec.fields) return Object.fromEntries(spec.fields.map(f => [f, `${spec.markerPrefix}-${f.split('.')[1].toUpperCase()}-${ID}`]));
  return `${spec.markerPrefix}-${ID}`;
}
function publicHas(spec, snapshot, target, markerMode) {
  if (spec.collection === 'Page') {
    const expected = {
      ...target,
      'seo.ogTitle': target['seo.ogTitle'] || target['seo.metaTitle'],
      'seo.ogDescription': target['seo.ogDescription'] || target['seo.metaDescription'],
    };
    const exact = pageFields.every(f => snapshot[f] === expected[f]);
    const twitter = snapshot.twitterTitle === expected['seo.ogTitle'] && snapshot.twitterDescription === expected['seo.ogDescription'];
    return exact && twitter;
  }
  if (markerMode) return snapshot.includes(target);
  return !snapshot.includes(`${spec.markerPrefix}-`) && (!target || snapshot.includes(target));
}
async function runOne(browser, context, spec) {
  const rec = { collection: spec.collection, document: spec.document, path: spec.path, status: 'FAIL', steps: {} };
  const page = await context.newPage(); let baseline; let mutation;
  try {
    await openEditor(page, spec);
    baseline = await uiValue(page, spec);
    if (JSON.stringify(baseline).includes('QA-')) throw new Error('baseline already contains QA marker');
    const initialBackend = await backend(spec);
    if (!equal(initialBackend, baseline)) throw new Error('UI/backend baseline mismatch');
    rec.steps.baseline = 'PASS';
    const marker = markerValue(spec);
    mutation = spec.fields ? marker : `${baseline}${baseline ? ' ' : ''}${marker}`;
    rec.steps.mutationSave = await saveIfChanged(page, spec, mutation);
    await poll(`${spec.collection} backend mutation`, () => backend(spec), v => equal(v, mutation));
    rec.steps.backendMutation = 'PASS';
    await poll(`${spec.collection} public mutation`, () => publicSnapshot(browser, spec), v => publicHas(spec, v, spec.fields ? mutation : marker, true));
    rec.steps.publicMutation = 'PASS';
  } catch (e) { rec.mutationError = String(e); }
  finally {
    if (baseline !== undefined) {
      try {
        await openEditor(page, spec);
        rec.steps.restoreSave = await saveIfChanged(page, spec, baseline);
        await poll(`${spec.collection} backend restore`, () => backend(spec), v => equal(v, baseline));
        rec.steps.backendRestore = 'PASS';
        await poll(`${spec.collection} public restore`, () => publicSnapshot(browser, spec), v => publicHas(spec, v, baseline, false));
        rec.steps.publicRestore = 'PASS';
      } catch (e) { rec.restoreError = String(e); }
    }
    await page.close();
  }
  if (!rec.mutationError && !rec.restoreError && rec.steps.publicMutation === 'PASS' && rec.steps.publicRestore === 'PASS') rec.status = 'PASS';
  return rec;
}

(async () => {
  const report = { schema: 'publisher-admin-gate-v2', id: ID, origin: ORIGIN, startedAt: new Date().toISOString(), results: [] };
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: STATE });
    for (const spec of runSpecs) report.results.push(await runOne(browser, context, spec));
    await context.close();
  } finally { await browser.close(); }
  report.completedAt = new Date().toISOString();
  report.status = report.results.length === runSpecs.length && report.results.every(x => x.status === 'PASS') ? 'PASS' : 'FAIL';
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
})().catch(e => { console.error(String(e)); process.exitCode = 1; });
