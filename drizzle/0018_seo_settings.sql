-- Two settings behind the site's share previews and search snippets.
--
-- Data, not schema: `site_settings` is a key-value table, and "the Foundation
-- can edit its own meta description" is a row rather than a column. Written as
-- a migration as well as into `seed.ts` because an installed site is upgraded
-- with `db:migrate`, not re-seeded — without this the two keys would exist only
-- on a fresh install.
--
-- `INSERT OR IGNORE`, so re-running is harmless and a value staff have already
-- edited is never overwritten.
INSERT OR IGNORE INTO `site_settings`
	(`key`, `value`, `value_type`, `label`, `hint`, `group`, `sort_order`, `is_active`)
VALUES
	(
		'seo.description',
		'Hope, compassion and opportunity for families in Addis Ababa: medical hardship support, elder care, mental wellness and youth education.',
		'textarea',
		'Search description',
		'Shown under the site name in Google results and on shared links, for pages with no description of their own. Around 155 characters.',
		'general',
		4,
		1
	),
	(
		'seo.share_image',
		NULL,
		'image',
		'Default share image',
		'The picture shown when a link to this site is posted on Facebook, WhatsApp or X. Ideally 1200x630. Pages with their own share image use that instead.',
		'general',
		5,
		1
	);
