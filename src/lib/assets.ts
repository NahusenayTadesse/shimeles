/**
 * Resolves a stored asset reference to its URL.
 *
 * Every database-backed image is a bare filename served by the `/files`
 * endpoint, so uploading a replacement through the dashboard is all it takes to
 * change what the site shows. Absolute URLs pass through for externally hosted
 * assets such as partner logos.
 */
export const assetUrl = (path?: string | null): string => {
	if (!path) return '';
	return path.startsWith('http') ? path : `/files/${path}`;
};

/** Keep in step with `WIDTHS` in `scripts/image-variants.mjs`. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;

/**
 * A `srcset` offering the resized copies of a stored photograph, so a phone
 * downloads the 480px copy instead of the 1600px original.
 *
 * `/files` falls back to the original for any width whose copy the cron job
 * has not made yet, so this is always safe to emit. External URLs, SVGs and
 * GIFs get no `srcset` — there is nothing of ours to resize.
 */
export const imageSrcset = (path?: string | null): string | undefined => {
	if (!path || path.startsWith('http') || /\.(svg|gif)$/i.test(path)) return undefined;
	const base = assetUrl(path);
	return IMAGE_WIDTHS.map((width) => `${base}?w=${width} ${width}w`).join(', ');
};
