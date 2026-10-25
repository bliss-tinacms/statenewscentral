export type SeoFields = {
	metaTitle?: string | null;
	metaDescription?: string | null;
	ogTitle?: string | null;
	ogDescription?: string | null;
	ogImage?: string | null;
	canonicalUrl?: string | null;
	noindex?: boolean | null;
	nofollow?: boolean | null;
};

export type SeoResolutionInput = {
	seo?: SeoFields | null;
	titleFallback?: string | null;
	descriptionFallback?: string | null;
	imageFallback?: string | null;
	canonicalFallback?: string | null;
};

/**
 * One SEO fallback contract for every public Tina detail/archive route.
 * Explicit document SEO wins; social values fall back to resolved primary values.
 */
export function resolveSeo(input: SeoResolutionInput) {
	const seo = input.seo ?? {};
	const title = seo.metaTitle || input.titleFallback || '';
	const description = seo.metaDescription || input.descriptionFallback || '';
	return {
		title,
		description,
		ogTitle: seo.ogTitle || title,
		ogDescription: seo.ogDescription || description,
		image: seo.ogImage || input.imageFallback || undefined,
		canonicalUrl: seo.canonicalUrl || input.canonicalFallback || undefined,
		noindex: seo.noindex === true,
		nofollow: seo.nofollow === true,
	};
}

/**
 * Connection/list records drive route discovery and may become current before a
 * separately indexed singleton query. When the connection query is complete,
 * it is the authoritative public record; singleton/local records are fallbacks.
 */
export function preferFreshConnectionRecord<T>(connection: T | null | undefined, singleton: T | null | undefined, fallback?: T | null) {
	return connection ?? singleton ?? fallback ?? null;
}
