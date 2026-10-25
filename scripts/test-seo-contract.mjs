#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preferFreshConnectionRecord, resolveSeo } from '../src/lib/seo.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const pass = [];
const requireSource = (name, source, pattern) => {
  assert.match(source, pattern, `${name}: required SEO contract missing`);
  pass.push(name);
};

// Behavioral regression: explicit Tina SEO must override document/global fallbacks.
assert.deepEqual(resolveSeo({
  seo: { metaTitle: 'Tina title', metaDescription: 'Tina description', ogTitle: 'Social title', ogDescription: 'Social description', ogImage: '/share.jpg', canonicalUrl: '/canonical/', noindex: true, nofollow: true },
  titleFallback: 'Page title', descriptionFallback: 'Global description', imageFallback: '/hero.jpg', canonicalFallback: '/page/'
}), {
  title: 'Tina title', description: 'Tina description', ogTitle: 'Social title', ogDescription: 'Social description', image: '/share.jpg', canonicalUrl: '/canonical/', noindex: true, nofollow: true
});
pass.push('explicit Tina SEO precedence');

// Behavioral regression: blank SEO falls back to the document before global values.
assert.deepEqual(resolveSeo({ seo: {}, titleFallback: 'Page title', descriptionFallback: 'Site description', imageFallback: '/hero.jpg', canonicalFallback: '/page/' }), {
  title: 'Page title', description: 'Site description', ogTitle: 'Page title', ogDescription: 'Site description', image: '/hero.jpg', canonicalUrl: '/page/', noindex: false, nofollow: false
});
pass.push('document/social fallback contract');

// Behavioral regression: a fresh complete connection record must beat a stale singleton.
const connection = { title: 'Fresh category', seo: { metaTitle: 'Fresh SEO' } };
const singleton = { title: 'Stale category', seo: { metaTitle: 'Stale SEO' } };
assert.equal(preferFreshConnectionRecord(connection, singleton), connection);
assert.equal(preferFreshConnectionRecord(null, singleton), singleton);
pass.push('connection-over-singleton freshness');

const route = read('src/pages/[...slug].astro');
requireSource('homepage fetches full Tina document', route, /page\s*=\s*await getPublicPage\(documentSlug\)/);
requireSource('homepage renders full-document result first', route, /page\?\.data\?\.page\s*\?\?\s*matchedPage/);
requireSource('all primary dynamic routes use shared SEO resolver', route, /(resolveSeo\([\s\S]*?){3}/);
requireSource('category route uses freshness helper', route, /preferFreshConnectionRecord\(listedCategory, fetchedCategory, postCategory\)/);
requireSource('category head uses resolved SEO', route, /title=\{categoryContext\.resolvedSeo\.title\}[\s\S]*canonicalUrl=\{categoryContext\.resolvedSeo\.canonicalUrl\}/);

const authorRoute = read('src/pages/author/[...slug].astro');
requireSource('author route uses shared SEO resolver', authorRoute, /const resolvedSeo = resolveSeo\(/);
requireSource('author head uses resolved SEO', authorRoute, /title=\{resolvedSeo\.title\}[\s\S]*canonicalUrl=\{resolvedSeo\.canonicalUrl\}/);

const data = read('src/lib/data.ts');
for (const [name, block] of [
  ['Page', /query Page\([\s\S]*?\n\t\}`;/],
  ['Blog', /query Blog\([\s\S]*?\n\t\}`;/],
  ['Category', /query Category\([\s\S]*?\n\t\}`;/],
  ['User', /query User\([\s\S]*?\n\t\}`;/],
]) {
  const match = data.match(block);
  assert.ok(match, `${name}: public detail query not found`);
  for (const field of ['metaTitle', 'metaDescription', 'ogTitle', 'ogDescription', 'ogImage', 'canonicalUrl', 'noindex', 'nofollow']) {
    assert.match(match[0], new RegExp(`\\b${field}\\b`), `${name}: public detail query omits SEO field ${field}`);
  }
  pass.push(`${name} detail query SEO completeness`);
}

for (const collection of ['page', 'blog', 'category', 'user']) {
  requireSource(`${collection} schema includes shared SEO fields`, read(`tina/collections/${collection}.ts`), /seoFields/);
}

const head = read('src/components/BaseHead.astro');
for (const marker of [
  '<title>{title}</title>',
  '<meta name="description" content={description}',
  '<link rel="canonical" href={canonicalURL}',
  '<meta name="robots" content={robots}',
  '<meta property="og:title" content={socialTitle}',
  '<meta property="og:description" content={socialDescription}',
  '<meta name="twitter:title" content={socialTitle}',
  '<meta name="twitter:description" content={socialDescription}',
]) assert.ok(head.includes(marker), `BaseHead missing required output: ${marker}`);
pass.push('BaseHead metadata completeness');

console.log(JSON.stringify({ schema: 'seo-contract-v1', status: 'PASS', assertions: pass.length, checks: pass }, null, 2));
