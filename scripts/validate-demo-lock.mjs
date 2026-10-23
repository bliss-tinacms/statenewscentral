#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';

const root = resolve(new URL('..', import.meta.url).pathname);
const port = Number(process.env.DEMO_LOCK_PORT || 4397);
const origin = `http://127.0.0.1:${port}`;
const mutation = process.env.DEMO_LOCK_MUTATION || '';
const routes = [
  { path: '/', status: 200, family: 'index', text: 'Where a story happens is where understanding begins.' },
  { path: '/about/', status: 200, family: 'about', text: 'About State News Central' },
  { path: '/our-team/', status: 200, family: 'team', text: 'The State News Central newsroom' },
  { path: '/editorial-guidelines/', status: 200, family: 'page', text: 'Editorial Guidelines' },
  { path: '/contact/', status: 200, family: 'contact', text: 'Get in touch with State News Central' },
  { path: '/business/', status: 200, family: 'category', text: 'Business' },
  { path: '/author/cheryl-nielsen/', status: 200, family: 'author', text: 'Cheryl Nielsen' },
  { path: '/what-rising-insurance-premiums-mean-for-household-budgets/', status: 200, family: 'article', text: 'What rising insurance premiums mean for household budgets' },
  { path: '/sitemap/', status: 200, family: 'sitemap', text: 'Sitemap' },
  { path: '/demo-lock-missing-route/', status: 404, family: '404', text: 'This page could not be found.' },
];
const files = {
  config: resolve(root, 'src/content/config/config.json'),
  header: resolve(root, 'src/content/navigation/header.json'),
  about: resolve(root, 'src/content/page/about.mdx'),
};
const originals = new Map();
let server;

function cleanEnvironment() {
  const env = { ...process.env, SITE_URL: origin, TINA_USE_LOCAL_CONTENT: '1' };
  for (const key of Object.keys(env)) {
    if (/^(TINA_TOKEN|NEXT_PUBLIC_TINA_CLIENT_ID|NEXT_PUBLIC_TINA_CONTENT_API_URL|TINA_UPSTREAM_CONTENT_API_URL|TINA_DIRECT_CONTENT_API_URL)$/.test(key)) delete env[key];
  }
  return env;
}
async function fetchPage(path) { return fetch(origin + path, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } }); }
function templateSignature(html) {
  const $ = load(html);
  return $('[data-dc-tpl]').toArray().map((node) => {
    const element = $(node);
    const parent = element.parent().closest('[data-dc-tpl]').attr('data-dc-tpl') || '';
    return `${element.attr('data-dc-tpl')}:${String(node.tagName || '').toLowerCase()}:${parent}`;
  });
}
async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Astro exited before readiness (${server.exitCode})`);
    try { const response = await fetchPage('/'); if (response.status === 200) return; } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Astro readiness timeout');
}
async function assertRoutes() {
  const results = [];
  const htmlByPath = new Map();
  for (const route of routes) {
    const response = await fetchPage(route.path);
    const html = await response.text();
    htmlByPath.set(route.path, html);
    const expectedStatus = mutation === 'route-status' && route.path === '/' ? 418 : route.status;
    if (response.status !== expectedStatus) throw new Error(`route-status:${route.path}:expected-${expectedStatus}:got-${response.status}`);
    if (!html.toLowerCase().includes(route.text.toLowerCase())) throw new Error(`route-content:${route.path}:${route.text}`);
    const authority = await readFile(resolve(root, `tests/fixtures/astro-demo-lock/authoritative/${route.family}.html`), 'utf8');
    const expectedStructure = templateSignature(authority);
    const currentStructure = templateSignature(html);
    if (mutation === 'dom-structure' && route.family === 'page') currentStructure.splice(currentStructure.findIndex((entry) => entry.startsWith('44:')), 1);
    const expectedSet = new Set(expectedStructure);
    const unexpected = currentStructure.filter((entry) => !expectedSet.has(entry));
    const requiredMarkers = {
      index: ['35', '40', '76', '145', '191', '215'], about: ['35', '41', '42', '54', '63', '99', '118', '124'], team: ['35', '41', '42', '47', '56', '68', '70', '106'],
      page: ['35', '40', '41', '42', '43', '44', '62', '66'], contact: ['35', '41', '42', '45', '53', '73', '98'],
      category: ['35', '41', '42', '43', '55', '100', '109'], author: ['35', '40', '42', '43', '44', '45', '47', '86', '95'],
      article: ['35', '37', '40', '41', '42', '46', '48', '49', '50', '84', '90', '92', '110', '118', '139'],
      sitemap: ['35', '40', '41', '42', '43', '70', '71', '94'], '404': ['35', '37', '42', '43', '44', '45', '50', '54'],
    }[route.family] || [];
    const presentIds = new Set(currentStructure.map((entry) => entry.split(':', 1)[0]));
    const missingRequired = requiredMarkers.filter((id) => !presentIds.has(id));
    if (unexpected.length || missingRequired.length) {
      throw new Error(`route-template-structure:${route.path}:unexpected-${unexpected.length}:missing-${missingRequired.join(',') || 'none'}`);
    }
    results.push({ path: route.path, status: response.status, family: route.family, signatureCount: currentStructure.length });
  }
  const legacyBlog = await fetchPage('/blog/what-rising-insurance-premiums-mean-for-household-budgets/');
  if (legacyBlog.status !== 301 || legacyBlog.headers.get('location') !== '/what-rising-insurance-premiums-mean-for-household-budgets/') {
    throw new Error(`legacy-blog-redirect:${legacyBlog.status}:${legacyBlog.headers.get('location') || 'missing'}`);
  }
  const legacyPage = await fetchPage('/blog/privacy-policy/');
  const legacyPageHtml = await legacyPage.text();
  if (legacyPage.status !== 404 || !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(legacyPageHtml)) {
    throw new Error(`legacy-page-blog-route:${legacyPage.status}`);
  }
  const article = load(htmlByPath.get('/what-rising-insurance-premiums-mean-for-household-budgets/') || '');
  const badges = article('[data-article-category]');
  if (badges.length !== 2) throw new Error(`article-category-cardinality:expected-2:got-${badges.length}`);
  const hrefs = badges.toArray().map((node) => article(node).attr('href'));
  if (JSON.stringify(hrefs) !== JSON.stringify(['/business/', '/featured/'])) throw new Error(`article-category-routes:${JSON.stringify(hrefs)}`);
  const business = load(htmlByPath.get('/business/') || '');
  const businessPage2Response = await fetchPage('/business/page/2/');
  const businessPage2 = load(await businessPage2Response.text());
  if (businessPage2Response.status !== 200 || business('[data-post-card]').length + businessPage2('[data-post-card]').length !== 8) throw new Error(`category-membership-business:expected-8:got-${business('[data-post-card]').length + businessPage2('[data-post-card]').length}`);
  const sitemap = load(htmlByPath.get('/sitemap/') || '');
  if (sitemap('[data-sitemap-section="webpages"] a').length < 10 || sitemap('[data-sitemap-section="posts"] a').length !== 13) throw new Error('sitemap-published-membership');
  return results;
}
async function assertDynamicInputs() {
  for (const path of Object.values(files)) originals.set(path, await readFile(path, 'utf8'));
  const marker = 'DEMO-LOCK-DYNAMIC-MARKER';
  const config = JSON.parse(originals.get(files.config)); config.seo.title = marker;
  const header = JSON.parse(originals.get(files.header)); header.items[0] = { label: marker, href: '/dynamic-navigation-proof/' };
  const about = originals.get(files.about).replace('title: About State News Central', `title: ${marker}`);
  await writeFile(files.config, JSON.stringify(config, null, 2) + '\n');
  await writeFile(files.header, JSON.stringify(header, null, 2) + '\n');
  await writeFile(files.about, about);
  await new Promise((done) => setTimeout(done, 800));
  const home = await (await fetchPage('/')).text();
  const aboutHtml = await (await fetchPage('/about/')).text();
  const required = [marker, 'href="/dynamic-navigation-proof/"'];
  if (mutation === 'dynamic-input') required.push('INTENTIONAL-MISSING-MARKER');
  for (const value of required) if (!home.includes(value) && !aboutHtml.includes(value)) throw new Error(`dynamic-input-not-rendered:${value}`);
  return { content: true, navigation: true, configIdentity: true };
}
async function restore() {
  for (const [path, bytes] of originals) await writeFile(path, bytes);
  if (originals.size && server?.exitCode === null) {
    await new Promise((done) => setTimeout(done, 500));
    const html = await (await fetchPage('/')).text();
    if (html.includes('DEMO-LOCK-DYNAMIC-MARKER')) throw new Error('dynamic-input-restore-failed');
  }
}
try {
  server = spawn('pnpm', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.resume(); server.stderr.resume();
  await waitForServer();
  const routeResults = await assertRoutes();
  const dynamic = await assertDynamicInputs();
  await restore();
  console.log(JSON.stringify({ schema: 'state-news-demo-lock-v1', status: 'PASS', routes: routeResults, dynamic }, null, 2));
  console.log('ASTRO_DEMO_LOCK_PASS');
} catch (error) {
  try { await restore(); } catch (restoreError) { console.error(`ASTRO_DEMO_LOCK_RESTORE_FAIL ${restoreError.message}`); }
  console.error(`ASTRO_DEMO_LOCK_FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
    await Promise.race([once(server, 'exit'), new Promise((done) => setTimeout(done, 5000))]);
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); } }
  }
}
