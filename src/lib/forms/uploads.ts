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

/**
 * How an image is compressed in the browser before it is uploaded.
 *
 * Shared by the two components that accept one — `FileUpload` (a form field, a
 * dashboard image, a case document) and `GalleryUpload` (a photo set) — so a
 * photograph arrives the same size whichever screen it came from.
 *
 * The numbers matter more than they look. The previous settings (1 MB, keep the
 * original format) let a photograph land as a 900 KB PNG, and the About page
 * ended up shipping 7.6 MB of images: a 14-second largest-contentful-paint on a
 * throttled phone, which is most of Ethiopia. WebP at this quality is visually
 * indistinguishable at 1920px and lands between 100 and 250 KB.
 *
 * 1920px is kept rather than lowered because this same path takes photographs
 * of hospital letters. The ceiling that matters for those is resolution, not
 * bytes — a caseworker has to be able to read the small print.
 */
export const IMAGE_COMPRESSION = {
	maxSizeMB: 0.4,
	maxWidthOrHeight: 1920,
	useWebWorker: true,
	initialQuality: 0.82,
	/** Transcodes PNG and JPEG alike; the extension has to follow — see `webpName`. */
	fileType: 'image/webp'
} as const;

/**
 * The stored name has to agree with the bytes.
 *
 * `savePublicImage` takes the extension from the filename and the MIME type
 * from `file.type`, so compressing to WebP without renaming would store WebP
 * bytes at `photo.png` — served with the right `Content-Type`, but wrong in
 * every listing, every download and every share tag that reads the extension.
 */
/* The leading `(.)` is what stops a dotfile — `.hidden` — being read as one
   long extension and losing its whole name. */
export const webpName = (name: string) => `${name.replace(/(.)\.[^./\\]+$/, '$1')}.webp`;
