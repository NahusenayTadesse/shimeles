import { settingsMap } from '$lib/server/settings';
import { siteOrigin } from '$lib/seo';
import type { RequestHandler } from './$types';

/**
 * robots.txt.
 *
 * A route rather than `static/robots.txt`, for one reason: the `Sitemap:` line
 * has to be an absolute URL, and a static file cannot know what the site's
 * domain is. It comes from the `site.url` setting, so moving domain stays a
 * settings edit rather than a deploy (§0).
 *
 * Note what is *not* disallowed. `/files` serves every public photograph on the
 * site, including the share images in the Open Graph tags — and Facebook,
 * X/Twitter and Google all check robots.txt before fetching a preview image.
 * Blocking it would silently strip the picture off every link the Foundation
 * shares. The private files behind that same path are protected by the
 * endpoint itself (a session, the pillar scope, an audit row) and answer 404
 * to a crawler, which is the protection that actually holds.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const settings = await settingsMap();
	const origin = siteOrigin(settings, url.origin);

	const body = `# ${settings['site.name'] || 'Shimeles Abera Foundation'}
User-agent: *
Allow: /

# Staff surface. Also noindex'd by header and by meta tag.
Disallow: /dashboard
Disallow: /login
Disallow: /setup

# Application forms: a shared link can carry someone's circumstances in its
# query string, so these stay out of search results entirely.
Disallow: /forms/

# Auth endpoints. Nothing here is a page.
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;

	setHeaders({
		'Content-Type': 'text/plain; charset=utf-8',
		'Cache-Control': 'public, max-age=86400'
	});

	return new Response(body);
};
