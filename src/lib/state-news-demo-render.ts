import { load, type CheerioAPI } from 'cheerio';

const slugFromReference = (value: any) => {
  if (!value) return '';
  if (typeof value === 'string') return value.split('/').pop()?.replace(/\.(json|mdx?)$/i, '') || '';
  return value?._sys?.filename || String(value?.title || value?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};
const labelFromReference = (value: any) => {
  if (!value) return '';
  if (typeof value === 'string') return slugFromReference(value).replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  return String(value?.title || value?.name || slugFromReference(value));
};
const postUrl = (post: any) => {
  const slug = String(post?.permalink || post?._sys?.filename || '').replace(/^\/+|\/+$/g, '').replace(/^blog\//, '');
  return slug ? `/${slug}/` : '/blog/';
};
const dateLabel = (value: any) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
};
const textOf = (node: any): string => typeof node?.text === 'string' ? node.text : Array.isArray(node?.children) ? node.children.map(textOf).join('') : '';
const esc = (value: any) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugify = (value: string) => value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';

export function renderRichText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return `<p>${esc(node)}</p>`;
  if (node.type === 'text') {
    let value = esc(node.text || '');
    if (node.code) value = `<code>${value}</code>`;
    if (node.bold) value = `<strong>${value}</strong>`;
    if (node.italic) value = `<em>${value}</em>`;
    if (node.underline) value = `<u>${value}</u>`;
    if (node.strikethrough) value = `<s>${value}</s>`;
    return value;
  }
  const children = (node.children || []).map(renderRichText).join('');
  const tag: Record<string, string> = { root: '', p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', ul: 'ul', ol: 'ol', li: 'li', lic: 'span', blockquote: 'blockquote', block_quote: 'blockquote', hr: 'hr', code_block: 'pre' };
  if (node.type === 'root') return children;
  if (node.type === 'a') return `<a href="${esc(node.url || node.href || '#')}">${children}</a>`;
  if (node.type === 'img') return `<img src="${esc(node.url || node.src || '')}" alt="${esc(node.alt || '')}">`;
  const element = tag[node.type] || 'div';
  if (element === 'hr') return '<hr>';
  const id = /^h[1-6]$/.test(element) ? ` id="${esc(slugify(textOf(node)))}"` : '';
  return `<${element}${id}>${children}</${element}>`;
}

function setText($: CheerioAPI, selector: string, value: any) { $(selector).first().text(String(value ?? '')); }
function removeTemplateIds($: CheerioAPI, node: any) { $(node).find('[data-dc-tpl]').addBack('[data-dc-tpl]').removeAttr('data-dc-tpl'); }
function setInlineField($: CheerioAPI, selector: string, field?: string | null) { if (field) $(selector).first().attr('data-tina-field', field); }

export function renderArticleDemo(raw: string, options: any) {
  const $ = load(raw, null, false);
  const { post, author, categories = [], relatedPosts = [], config = {}, fields = {} } = options;
  const categorySource = $('[data-dc-tpl="39"]').first().clone();
  const categoryParent = $('[data-dc-tpl="39"]').first().parent();
  const categoryGroup = $('<div data-article-categories></div>').attr('style', 'display:flex;flex-wrap:wrap;justify-content:center;gap:10px');
  categoryParent.children('[data-article-categories], [data-article-category], [data-dc-tpl="39"]').remove();
  categories.forEach((category: any, index: number) => {
    const badge = categorySource.clone();
    if (index) badge.removeAttr('data-dc-tpl');
    badge.attr('data-article-category', '').attr('href', `/${slugFromReference(category)}/`).text(labelFromReference(category));
    if (fields.categories) badge.attr('data-tina-field', fields.categories);
    categoryGroup.append(badge);
  });
  categoryParent.find('[data-dc-tpl="40"]').before(categoryGroup);
  setText($, '[data-dc-tpl="40"]', post?.title);
  setInlineField($, '[data-dc-tpl="40"]', fields.title);
  const authorSlug = slugFromReference(author || post?.author);
  const authorLink = $('[data-dc-tpl="42"]').first();
  authorLink.attr('href', `/author/${authorSlug}/`);
  authorLink.contents().filter((_, node) => node.type === 'text').remove();
  authorLink.append(String(author?.name || labelFromReference(post?.author) || 'Site Staff'));
  $('[data-dc-tpl="43"]').attr({ src: author?.avatar || '', alt: author?.name || 'Author' });
  setInlineField($, '[data-dc-tpl="42"]', fields.author);
  setText($, '[data-dc-tpl="47"]', dateLabel(post?.pubDate));
  setText($, '[data-dc-tpl="49"]', post?.readTime || '');
  setInlineField($, '[data-dc-tpl="47"]', fields.pubDate);
  setInlineField($, '[data-dc-tpl="49"]', fields.readTime);
  $('[data-dc-tpl="51"]').attr({ src: post?.heroImage || '', alt: post?.heroImageAlt || post?.title || 'Article image' });
  setInlineField($, '[data-dc-tpl="51"]', fields.heroImage);
  const tocItems = (post?.body?.children || []).filter((node: any) => node?.type === 'h2').map((node: any) => ({ title: textOf(node), id: slugify(textOf(node)) }));
  const toc = $('[data-dc-tpl="57"]').first();
  const tocTemplate = toc.children('li').first().clone();
  toc.empty();
  tocItems.forEach((item: any, index: number) => {
    const li = tocTemplate.clone(); if (index) removeTemplateIds($, li);
    const link = li.find('a').first();
    const number = link.find('span').first();
    link.attr('href', `#${item.id}`);
    link.contents().filter((_, node) => node.type === 'text').remove();
    number.text(String(index + 1).padStart(2, '0'));
    link.append(item.title);
    toc.append(li);
  });
  const article = $('[data-dc-tpl="70"]').first();
  const firstParagraphStyle = $('[data-dc-tpl="71"]').attr('style') || '';
  const paragraphStyle = $('[data-dc-tpl="72"]').attr('style') || '';
  const headingStyles = Object.fromEntries([2, 3, 4, 5, 6].map((level) => [level, article.find(`h${level}`).first().attr('style') || $('[data-dc-tpl="73"]').attr('style') || '']));
  const blockquoteStyle = $('[data-dc-tpl="79"]').attr('style') || '';
  const authorCardTemplate = article.find('[data-dc-tpl="85"]').first().clone();
  article.html(renderRichText(post?.body));
  article.find('p').each((index, node) => { $(node).attr('style', index === 0 ? firstParagraphStyle : paragraphStyle); });
  for (const level of [2, 3, 4, 5, 6]) article.find(`h${level}`).attr('style', headingStyles[level]);
  article.find('blockquote').attr('style', blockquoteStyle);
  article.find('blockquote p').attr('style', 'margin:0;color:inherit;font:inherit;line-height:inherit');
  article.append(authorCardTemplate);
  article.attr('data-tina-field', fields.body || null);
  const authorCard = $('[data-dc-tpl="85"]').first();
  authorCard.find('[data-dc-tpl="86"]').attr({ src: author?.avatar || '', alt: author?.name || 'Author' });
  authorCard.find('[data-dc-tpl="89"]').attr('href', `/author/${authorSlug}/`).text(author?.name || 'Site Staff');
  authorCard.find('[data-dc-tpl="90"]').text(author?.bio || 'State News Digest newsroom contributor.');
  const relatedGrid = $('[data-dc-tpl="97"]').first();
  const relatedTemplate = relatedGrid.children('a').first().clone();
  relatedGrid.empty();
  relatedPosts.slice(0, 3).forEach((item: any, index: number) => {
    const card = relatedTemplate.clone(); if (index) removeTemplateIds($, card);
    card.attr('href', postUrl(item)).attr('data-post-card', '');
    card.find('img').attr({ src: item.heroImage || '', alt: item.heroImageAlt || item.title || '' });
    const spans = card.find('span'); spans.eq(0).text(labelFromReference((item.categories || [])[0])); spans.eq(1).text(item.title || 'Untitled story');
    relatedGrid.append(card);
  });
  setText($, '[data-dc-tpl="113"]', config?.contributorCta?.eyebrow || 'Write for us');
  setText($, '[data-dc-tpl="114"]', config?.contributorCta?.title || 'Have a story worth telling?');
  setText($, '[data-dc-tpl="116"]', config?.contributorCta?.description || 'State News Digest accepts work from outside contributors.');
  $('[data-dc-tpl="117"]').attr('href', config?.contributorCta?.buttonLink || '/write-for-us/').contents().first().replaceWith(config?.contributorCta?.buttonText || 'Write for Us');
  return $.html();
}

function populateCards($: CheerioAPI, gridSelector: string, posts: any[], firstCardSelector: string) {
  const grid = $(gridSelector).first();
  const template = grid.children(firstCardSelector).first().clone();
  grid.empty();
  posts.forEach((post: any, index: number) => {
    const card = template.clone(); if (index) removeTemplateIds($, card);
    card.attr('href', postUrl(post)).attr('data-post-card', '');
    card.find('img').first().attr({ src: post.heroImage || '', alt: post.heroImageAlt || post.title || '' });
    const title = card.find('span').last(); title.text(post.title || 'Untitled story');
    grid.append(card);
  });
}
function populatePagination($: CheerioAPI, selector: string, current: number, pages: number, basePath: string) {
  const nav = $(selector).first();
  const template = nav.children('a').first().clone(); nav.empty();
  if (pages <= 1) { nav.remove(); return; }
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const pageHref = (page: number) => page === 1 ? normalizedBase : normalizedBase === '/blog/' ? `${normalizedBase}?page=${page}` : `${normalizedBase}page/${page}/`;
  for (let page = 1; page <= pages; page += 1) {
    const link = template.clone(); if (page > 1) removeTemplateIds($, link);
    link.attr('href', pageHref(page)).text(String(page));
    if (page === current) link.attr('aria-current', 'page');
    nav.append(link);
  }
  if (current < pages) { const next = template.clone(); removeTemplateIds($, next); next.attr('href', pageHref(current + 1)).text('Next →'); nav.append(next); }
}
function contributor($: CheerioAPI, config: any, start = 69) {
  setText($, `[data-dc-tpl="${start}"]`, config?.contributorCta?.eyebrow || 'Write for us');
  setText($, `[data-dc-tpl="${start + 1}"]`, config?.contributorCta?.title || 'Have a story worth telling?');
  setText($, `[data-dc-tpl="${start + 3}"]`, config?.contributorCta?.description || 'State News Digest accepts work from outside contributors.');
  $(`[data-dc-tpl="${start + 4}"]`).attr('href', config?.contributorCta?.buttonLink || '/write-for-us/').contents().first().replaceWith(config?.contributorCta?.buttonText || 'Write for Us');
}

export function renderCategoryDemo(raw: string, options: any) {
  const $ = load(raw, null, false); const { category, posts = [], page = 1, pageSize = 6, totalPages, basePath, config = {}, fields = {} } = options;
  setText($, '[data-dc-tpl="40"]', category?.title || 'Category'); setInlineField($, '[data-dc-tpl="40"]', fields.title);
  const pages = totalPages ?? Math.max(1, Math.ceil(posts.length / pageSize)); const safePage = Math.min(Math.max(1, page), pages);
  const visiblePosts = totalPages ? posts : posts.slice((safePage - 1) * pageSize, safePage * pageSize);
  populateCards($, '[data-dc-tpl="42"]', visiblePosts, 'a');
  populatePagination($, '[data-dc-tpl="61"]', safePage, pages, basePath || `/${slugFromReference(category)}/`);
  contributor($, config, 69); return $.html();
}

export function renderAuthorDemo(raw: string, options: any) {
  const $ = load(raw, null, false); const { author, posts = [], page = 1, pageSize = 6, totalPages, basePath, config = {}, fields = {} } = options;
  $('[data-dc-tpl="39"]').attr({ src: author?.avatar || '', alt: author?.name || 'Author' });
  setText($, '[data-dc-tpl="42"]', author?.role || 'Contributor'); setText($, '[data-dc-tpl="43"]', author?.name || 'Author'); setText($, '[data-dc-tpl="44"]', author?.bio || '');
  setInlineField($, '[data-dc-tpl="39"]', fields.avatar); setInlineField($, '[data-dc-tpl="43"]', fields.name); setInlineField($, '[data-dc-tpl="44"]', fields.bio);
  const pages = totalPages ?? Math.max(1, Math.ceil(posts.length / pageSize)); const safePage = Math.min(Math.max(1, page), pages);
  const visiblePosts = totalPages ? posts : posts.slice((safePage - 1) * pageSize, safePage * pageSize);
  populateCards($, '[data-dc-tpl="46"]', visiblePosts, 'a');
  populatePagination($, '[data-dc-tpl="65"]', safePage, pages, basePath || `/author/${slugFromReference(author)}/`);
  contributor($, config, 73); return $.html();
}

export function renderDefaultPageDemo(raw: string, options: any) {
  const $ = load(raw, null, false);
  const { page, config = {}, fields = {} } = options;
  setText($, '[data-dc-tpl="39"]', page?.title || 'Page');
  setInlineField($, '[data-dc-tpl="39"]', fields.title);
  const date = page?.authorityUpdatedDate ? new Date(page.authorityUpdatedDate) : null;
  setText($, '[data-dc-tpl="41"]', date && !Number.isNaN(date.valueOf()) ? `Last Updated: ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : '');
  const sections = Array.isArray(page?.authoritySections) ? page.authoritySections.filter(Boolean) : [];
  const key = String(page?._sys?.filename || page?.permalink || '').replace(/^\/+|\/+$/g, '');
  const isEditorial = key === 'editorial-guidelines';
  const introSection = !isEditorial && sections.length && String(sections[0]?.heading || '').trim().toLowerCase() === String(page?.title || '').trim().toLowerCase() ? sections[0] : null;
  if (introSection) setText($, '[data-dc-tpl="42"]', introSection.body || '');
  else if (!isEditorial) setText($, '[data-dc-tpl="42"]', sections[0]?.body || '');
  const renderedSections = isEditorial ? sections : sections.slice(1);
  const main = $('[data-dc-tpl="40"]').first();
  const headingTemplate = $('[data-dc-tpl="43"]').first().clone();
  const bodyTemplate = $('[data-dc-tpl="44"]').first().clone();
  main.children().slice(2).remove();
  renderedSections.forEach((section: any, index: number) => {
    const heading = headingTemplate.clone(); const body = bodyTemplate.clone();
    if (index) { removeTemplateIds($, heading); removeTemplateIds($, body); }
    heading.text(section?.heading || ''); body.text(section?.body || '');
    main.append(heading, body);
  });
  const cta = config?.contributorCta || {};
  setText($, '[data-dc-tpl="64"]', cta.eyebrow || 'Write for us');
  setText($, '[data-dc-tpl="65"]', cta.heading || 'Have a story worth telling?');
  setText($, '[data-dc-tpl="67"]', cta.description || 'State News Digest accepts work from outside contributors.');
  $('[data-dc-tpl="68"]').attr('href', cta.buttonLink || '/write-for-us/').contents().first().replaceWith(cta.buttonLabel || 'Write for Us');
  return $.root().html() || '';
}

export function renderHomepageCollections(raw: string, options: any = {}) {
  const $ = load(raw, null, false);
  const { posts = [], categories = [], config = {} } = options;
  const categoryCards = ['66', '74', '82', '90', '98', '106', '114', '122'];
  categoryCards.forEach((id) => {
    const card = $(`[data-dc-tpl="${id}"]`).first();
    const labels = card.find('span');
    const sourceSlug = slugify(labels.eq(1).text());
    const category = categories.find((item: any) => slugFromReference(item) === sourceSlug || slugify(String(item?.title || '')) === sourceSlug);
    if (!category) return;
    card.attr('href', `/${slugFromReference(category)}/`);
    labels.eq(1).text(category.title || labelFromReference(category));
    labels.eq(2).text(category.description || labels.eq(2).text());
  });
  const postCards = ['176', '188', '196', '205', '211', '217'];
  const categoryIds = ['180', '191', '199', '208', '214', '220'];
  const titleIds = ['181', '192', '200', '209', '215', '221'];
  const metaIds = ['185', '195', '203', '210', '216', '222'];
  const authorIds = ['184', '194', '202'];
  postCards.forEach((id, index) => {
    const post = posts[index]; if (!post) return;
    const card = $(`[data-dc-tpl="${id}"]`).first();
    card.attr('href', postUrl(post)).attr('data-post-card', '');
    card.find('img').first().attr({ src: post.heroImage || '', alt: post.heroImageAlt || post.title || '' });
    setText($, `[data-dc-tpl="${categoryIds[index]}"]`, labelFromReference((post.categories || [])[0]));
    setText($, `[data-dc-tpl="${titleIds[index]}"]`, post.title || 'Untitled story');
    if (index < 3) {
      setText($, `[data-dc-tpl="${authorIds[index]}"]`, post.author?.name || labelFromReference(post.author));
      setText($, `[data-dc-tpl="${metaIds[index]}"]`, dateLabel(post.pubDate));
      if (index === 0) setText($, '[data-dc-tpl="186"]', post.readTime || '');
    } else {
      setText($, `[data-dc-tpl="${metaIds[index]}"]`, `${dateLabel(post.pubDate)}${post.readTime ? ` · ${post.readTime}` : ''}`);
    }
  });
  const users = posts.map((post: any) => post.author).filter((author: any) => author && typeof author === 'object');
  const uniqueUsers = [...new Map(users.map((author: any) => [slugFromReference(author), author])).values()].slice(0, 4) as any[];
  const teamCards = ['228', '233', '238', '243'];
  teamCards.forEach((id, index) => {
    const user = uniqueUsers[index]; if (!user) return;
    const card = $(`[data-dc-tpl="${id}"]`).first();
    card.attr('href', `/author/${slugFromReference(user)}/`);
    card.find('img').first().attr({ src: user.avatar || '', alt: user.name || '' });
    const labels = card.find('div');
    labels.eq(-2).text(user.name || 'Contributor');
    labels.eq(-1).text([user.role, user.location].filter(Boolean).join(' · '));
  });
  setText($, '[data-dc-tpl="251"]', config?.contributorCta?.eyebrow || 'Write for us');
  setText($, '[data-dc-tpl="252"]', config?.contributorCta?.title || 'Have a story worth telling?');
  setText($, '[data-dc-tpl="254"]', config?.contributorCta?.description || 'State News Digest accepts work from outside contributors.');
  $('[data-dc-tpl="255"]').attr('href', config?.contributorCta?.buttonLink || '/write-for-us/').contents().first().replaceWith(config?.contributorCta?.buttonText || 'Write for Us');
  return $.html();
}

export function render404Demo(raw: string, options: any = {}) {
  const $ = load(raw, null, false);
  const { config = {} } = options;
  const notFound = config?.notFound || {};
  setText($, '[data-dc-tpl="41"]', notFound.title || 'This page could not be found.');
  setText($, '[data-dc-tpl="42"]', notFound.description || 'The link may be outdated, or the page may have moved. Try one of the sections below to keep reading.');
  $('[data-dc-tpl="44"]').attr('href', notFound.buttonLink || '/').contents().first().replaceWith(notFound.buttonText || 'Back to Homepage');
  $('[data-dc-tpl="46"]').attr('href', '/blog/');
  $('[data-dc-tpl="47"]').attr('href', '/about/');
  $('[data-dc-tpl="48"]').attr('href', '/contact/');
  contributor($, config, 52);
  return $.html();
}

export function renderSitemapDemo(raw: string, options: any) {
  const $ = load(raw, null, false); const { pages = [], posts = [] } = options;
  const populate = (selector: string, items: any[], type: 'page' | 'post') => {
    const list = $(selector).first(); const template = list.children('li').first().clone(); list.empty();
    items.forEach((item, index) => { const li = template.clone(); if (index) removeTemplateIds($, li); const link = li.find('a').first(); link.attr('href', type === 'post' ? postUrl(item) : item.href); link.find('span').first().text(item.title); list.append(li); });
  };
  populate('[data-dc-tpl="44"]', pages, 'page'); populate('[data-dc-tpl="99"]', posts, 'post');
  $('[data-dc-tpl="42"]').attr('data-sitemap-section', 'webpages'); $('[data-dc-tpl="97"]').attr('data-sitemap-section', 'posts');
  return $.html();
}
