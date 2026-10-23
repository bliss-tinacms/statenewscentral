/**
 * Island registry — single source of truth for every editable region the
 * bridge can refresh. Each entry maps a URL slug under `/tina-island/...`
 * to a fetcher + component + wrapper. Adding a new editable region = adding
 * one entry here; the dynamic `[name].ts` route picks it up automatically.
 */
import type { IslandRegistry } from '@tinacms/astro/experimental';
import type { QueryResult } from '@tinacms/astro/data';

import type { BlogQuery, CategoryQuery, ConfigQuery, NavigationQuery, PageQuery, UserQuery } from '../../tina/__generated__/types';
import type { CmsBlog, CmsCategory, CmsConfig, CmsPage, CmsUser } from './data';
import PageBody from '../components/islands/PageBody.astro';
import BlogBody from '../components/islands/BlogBody.astro';
import AuthorIsland from '../components/islands/AuthorIsland.astro';
import CategoryIsland from '../components/islands/CategoryIsland.astro';
import HeaderBrand from '../components/state-news/HeaderBrand.astro';
import HeaderNavigation from '../components/state-news/HeaderNavigation.astro';
import FooterBrand from '../components/state-news/FooterBrand.astro';
import FooterNavigation from '../components/state-news/FooterNavigation.astro';
import { getEditableBlog, getEditableCategory, getEditableConfig, getEditableNavigation, getEditablePage, getEditableUser } from './data';

export const islands: IslandRegistry = {
	page: {
		fetch: (_request, params) => getEditablePage(params.get('slug') ?? 'home'),
		component: PageBody,
		wrapper: { tag: 'main' },
		propsFromData: (data) => ({
			data: (data as QueryResult<PageQuery>).data?.page as CmsPage | undefined,
		}),
	},
	blog: {
		fetch: (_request, params) => getEditableBlog(params.get('slug') ?? ''),
		component: BlogBody,
		wrapper: { tag: 'article' },
		propsFromData: (data) => ({
			data: (data as QueryResult<BlogQuery>).data?.blog as CmsBlog | undefined,
		}),
	},
	author: {
		fetch: (_request, params) => {
			const slug = params.get('slug');
			if (!slug) throw new Error('Author slug is required.');
			return getEditableUser(slug);
		},
		component: AuthorIsland,
		wrapper: { tag: 'div' },
		propsFromData: (data, params) => ({
			user: (data as QueryResult<UserQuery>).data?.user as CmsUser | undefined,
			page: Number(params.get('page') || '1'),
		}),
	},
	category: {
		fetch: (_request, params) => getEditableCategory(params.get('slug') ?? ''),
		component: CategoryIsland,
		wrapper: { tag: 'div' },
		propsFromData: (data, params) => ({
			category: (data as QueryResult<CategoryQuery>).data?.category as CmsCategory | undefined,
			page: Number(params.get('page') || '1'),
		}),
	},
	global: {
		fetch: () => getEditableConfig(),
		component: HeaderBrand,
		wrapper: { tag: 'div' },
		propsFromData: (data) => ({
			config: (data as QueryResult<ConfigQuery>).data?.config as CmsConfig | undefined,
		}),
	},
	navigation: {
		fetch: (_request, params) => getEditableNavigation(params.get('slug') ?? 'header.json'),
		component: HeaderNavigation,
		wrapper: { tag: 'div' },
		propsFromData: (data) => ({
			navigation: (data as QueryResult<NavigationQuery>).data?.navigation,
		}),
	},
	'global-footer': {
		fetch: () => getEditableConfig(),
		component: FooterBrand,
		wrapper: { tag: 'div' },
		propsFromData: (data) => ({
			config: (data as QueryResult<ConfigQuery>).data?.config as CmsConfig | undefined,
		}),
	},
	'footer-navigation': {
		fetch: (_request, params) => getEditableNavigation(params.get('slug') ?? 'footer.json'),
		component: FooterNavigation,
		wrapper: { tag: 'div' },
		propsFromData: (data) => ({
			navigation: (data as QueryResult<NavigationQuery>).data?.navigation,
		}),
	},
	'footer-legal-navigation': {
		fetch: (_request, params) => getEditableNavigation(params.get('slug') ?? 'footer-legal.json'),
		component: FooterNavigation,
		wrapper: { tag: 'div' },
		propsFromData: (data) => ({
			navigation: (data as QueryResult<NavigationQuery>).data?.navigation,
			isLegal: true,
		}),
	},
};
