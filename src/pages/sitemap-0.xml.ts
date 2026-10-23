import type { APIRoute } from 'astro';
import { buildXmlSitemap } from '../lib/xml-sitemap';

export const prerender = false;
export const GET: APIRoute = async ({ site, url }) => new Response(await buildXmlSitemap(site || new URL(url.origin)), {
  headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
});
