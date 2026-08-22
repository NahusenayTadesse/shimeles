/**
 * What a public form will accept as an attachment.
 *
 * Plain constants with no imports, because both sides need them and neither
 * can reach the other: `$lib/server/upload` enforces the ceiling when it writes
 * to disk, and `$lib/forms/schema` enforces it in the schema a browser also
 * builds. Declaring it in either one would drag a server module into the
 * client bundle or the form engine into the storage layer.
 */

/** The ceiling for anything written to disk, and for any single form field. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * A case document is a photograph of a letter or a PDF from a hospital. The
 * list is deliberately short: everything on it can be rendered in a browser
 * without downloading it, which is what makes the audited-read guarantee on
 * `/files/[name]` worth anything.
 */
export const ACCEPTED_UPLOAD_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/heic'
];

/** For the `accept` attribute on a file input. */
export const UPLOAD_ACCEPT_ATTRIBUTE = 'application/pdf,image/*';
