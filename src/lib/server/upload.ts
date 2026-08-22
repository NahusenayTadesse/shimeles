import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { files } from '$lib/server/db/schema';
import { invalidateStatCache } from '$lib/server/fileCache';

/**
 * File storage.
 *
 * Two rules shape this module.
 *
 * 1. **The stored name is never the uploaded name.** A UUID plus the original
 *    extension means no path traversal, no collisions, and no guessable URL
 *    for a private document.
 * 2. **Public media and private case documents share a directory but not an
 *    access rule.** A medical letter and a homepage photo both land in
 *    `FILES_DIR`; what separates them is the `files.is_public` row, which
 *    `/files/[name]` checks before it streams a byte. There is no second
 *    "private" directory to get misconfigured on deploy.
 */

const FILES_DIR = env.FILES_DIR ?? '.tempFiles';

/**
 * The ceiling for anything written to disk, matching the per-field limit the
 * dynamic form applies. Declared here rather than imported from
 * `$lib/server/forms` so the storage layer does not depend on the form engine.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

/** Extensions we are willing to hand back out. Anything else is rejected. */
const ALLOWED_EXTENSIONS = new Set([
	'.pdf',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.avif',
	'.heic',
	'.txt',
	'.doc',
	'.docx'
]);

export interface SaveOptions {
	/** Public media (content-block images, pillar photos) versus case documents. */
	isPublic?: boolean;
	/** Scopes a private file to one pillar, for the §3.10 access check. */
	pillarId?: number | null;
	uploadedBy?: string | null;
}

export interface SavedFile {
	/** Row id in `files`, for the join tables. */
	id: number;
	/** The on-disk name, which is also the `/files/:name` segment. */
	storagePath: string;
}

/**
 * Writes an uploaded file to disk and records it in `files`.
 *
 * Streams rather than buffering: a 10 MB scan of a medical letter should not
 * sit in memory in full, and several uploading at once should not either.
 */
export async function saveUploadedFile(file: File, options: SaveOptions = {}): Promise<SavedFile> {
	const ext = path.extname(file.name).toLowerCase();
	if (!ALLOWED_EXTENSIONS.has(ext)) {
		throw new Error(`Files of type "${ext || 'unknown'}" are not accepted`);
	}

	// The dynamic form enforces this in its schema, but `/apply`'s documents and
	// the in-kind photos reach this function without passing through one — and a
	// public endpoint that streams an unbounded body to disk is a way to fill the
	// volume that holds the case documents.
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error(`Files must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`);
	}

	const storagePath = `${randomUUID()}${ext}`;
	const target = path.join(FILES_DIR, storagePath);

	await pipeline(
		Readable.fromWeb(file.stream() as never),
		fs.createWriteStream(target, { flags: 'wx' })
	);
	invalidateStatCache(path.resolve(FILES_DIR, storagePath));

	const [row] = await db
		.insert(files)
		.values({
			originalFilename: file.name.slice(0, 255),
			storagePath,
			mimeType: file.type || 'application/octet-stream',
			sizeBytes: file.size,
			isPublic: options.isPublic ?? false,
			pillarId: options.pillarId ?? null,
			uploadedBy: options.uploadedBy ?? null,
			createdAt: new Date()
		})
		.returning({ id: files.id });

	return { id: row.id, storagePath };
}

/**
 * The shorthand the generic CRUD layer uses for content images: public, no
 * pillar, and only the filename matters because the column stores a string.
 */
export async function savePublicImage(file: File, uploadedBy?: string | null): Promise<string> {
	const saved = await saveUploadedFile(file, { isPublic: true, uploadedBy });
	return saved.storagePath;
}

/**
 * Soft-deletes the row and removes the bytes.
 *
 * The row is kept (with `deletedAt` set) so an audit entry referencing the
 * file id still resolves to a filename afterwards — "who downloaded what" has
 * to survive the file itself being removed.
 */
export async function deleteStoredFile(fileId: number): Promise<void> {
	const [row] = await db
		.update(files)
		.set({ deletedAt: new Date() })
		.where(eq(files.id, fileId))
		.returning({ storagePath: files.storagePath });

	if (!row) return;

	const target = path.resolve(FILES_DIR, row.storagePath);
	try {
		await fs.promises.unlink(target);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
	invalidateStatCache(target);
}
