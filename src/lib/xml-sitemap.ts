import { getBlogPermalink, getPageRouteSlug } from './permalinks';
import { getUser, listBlogs, listCategories, listPages } from './data';

function escapeXml(value: unknown) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char] || char));
}

function referenceSlug(reference: any) {
  const value = typeof reference === 'string'
    ? reference.split('/').pop()?.replace(/\.(json|mdx?)$/i, '')
    : reference?._sys?.filename || reference?.name || '';
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function buildXmlSitemap(site: URL) {
  const [pages, posts, categories] = await Promise.all([listPages(), listBlogs(), listCategories()]);
  const entries = new Map<string, string | undefined>();
  const add = (path: string, lastmod?: unknown) => {
    const url = new URL(path, site).href;
    entries.set(url, lastmod ? new Date(lastmod as any).toISOString() : undefined);
  };

  for (const page of pages) {
    if (page?.seo?.noindex) continue;
    const slug = getPageRouteSlug(page);
    add(slug ? `/${slug}/` : '/');
  }
  add('/blog/');
  add('/sitemap/');

  for (const post of posts) {
    if (post?.seo?.noindex) continue;
    add(`${getBlogPermalink(post)}/`, post.updatedDate || post.pubDate);
  }

  for (const category of categories) {
    if (category?.seo?.noindex) continue;
    const slug = referenceSlug(category);
    if (slug) add(`/${slug}/`);
  }

  const authorSlugs = [...new Set(posts.map((post: any) => referenceSlug(post.author)).filter(Boolean))];
  for (const slug of authorSlugs) {
    const user = (await getUser(slug)).data?.user;
    if (user?.seo?.noindex) continue;
    add(`/author/${slug}/`);
  }

  const body = [...entries.entries()].map(([loc, lastmod]) =>
    `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
