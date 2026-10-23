import type { APIRoute } from 'astro';

export const prerender = false;
export const GET: APIRoute = async ({ site, url }) => {
  const origin = site || new URL(url.origin);
  const loc = new URL('/sitemap-0.xml', origin).href.replace(/&/g, '&amp;');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${loc}</loc></sitemap>\n</sitemapindex>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
};
