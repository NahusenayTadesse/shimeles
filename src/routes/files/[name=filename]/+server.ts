import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { files, inKindDonationPhotos } from '$lib/server/db/schema';
import { getCachedStats } from '$lib/server/fileCache';
import { cached, peek } from '$lib/server/cache';
import { audit } from '$lib/server/audit';
import { loadAccess } from '$lib/server/permissions';
import type { RequestHandler } from './$types';

/**
 * File serving.
 *
 * §3.8 says the public/private distinction must be enforced "at the
 * storage/serving layer, not just this flag", so this endpoint does three
 * things before it streams a byte:
 *
 *  1. Refuses any path that escapes `FILES_DIR`.
 *  2. Looks the file up in `files`. An unknown name is a 404 whether or not
 *     the bytes exist — an orphaned file on disk is not a public URL.
 *  3. For a private file, requires a session and either of two claims on it:
 *     `submissions.read` plus the pillar scope matching the file's own pillar,
 *     which is the case-document rule — a Mental Wellness caseworker guessing a
 *     Medical Hardship document's UUID gets nothing — or `inkind.read` for a
 *     photo attached to an offer of goods, which is private but is not case
 *     data and belongs to no programme.
 *
 * Reads of private files are audited, because "who downloaded which document"
 * is exactly what §3.11 exists to answer.
 */

const FILES_DIR = path.resolve(env.FILES_DIR ?? '.tempFiles');

if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

const CACHE_TTL = {
	/** Stored names are UUIDs, so a public asset's bytes never change. */
	public: 'public, max-age=31536000, immutable',
	/** Private documents must not sit in a shared proxy or a browser cache. */
	private: 'private, no-store'
} as const;

const MIME: Record<string, string> = {
	pdf: 'application/pdf',
	txt: 'text/plain; charset=utf-8',
	webp: 'image/webp',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	avif: 'image/avif',
	heic: 'image/heic',
	svg: 'image/svg+xml',
	mp3: 'audio/mpeg',
	mp4: 'video/mp4',
	webm: 'video/webm',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const mimeFor = (name: string) =>
	MIME[name.toLowerCase().split('.').at(-1) ?? ''] ?? 'application/octet-stream';

const readFileRow = async (name: string) => {
	const [row] = await db
		.select({
			id: files.id,
			isPublic: files.isPublic,
			pillarId: files.pillarId,
			mimeType: files.mimeType,
			originalFilename: files.originalFilename
		})
		.from(files)
		.where(and(eq(files.storagePath, name), isNull(files.deletedAt)))
		.limit(1);
	return row ?? null;
};

/**
 * Public rows are cached; a private row is looked up fresh every time.
 *
 * Which means the read has to happen before the decision to cache, not after —
 * wrapping the whole lookup in `cached()` would hold a private row's
 * `is_public`, `pillar_id` and `deleted_at` for the TTL. The permission check
 * itself runs per request either way, but it would be checking a stale row: a
 * document whose pillar was corrected would keep admitting the wrong
 * caseworkers, and one that was just soft-deleted would keep resolving.
 *
 * A public asset is none of those things — its bytes are immutable behind a
 * UUID — so it is worth caching and nothing is risked by doing so.
 */
const lookup = async (name: string) => {
	const key = `file:${name}`;
	const hit = await peek(key);
	if (hit !== undefined) return hit as Awaited<ReturnType<typeof readFileRow>>;

	const row = await readFileRow(name);
	if (row?.isPublic) await cached(key, async () => row);
	return row;
};

/** Whether this file is a photo hanging off an in-kind offer. */
const isInKindPhoto = async (fileId: number) => {
	const [row] = await db
		.select({ id: inKindDonationPhotos.id })
		.from(inKindDonationPhotos)
		.where(and(eq(inKindDonationPhotos.fileId, fileId), isNull(inKindDonationPhotos.deletedAt)))
		.limit(1);
	return Boolean(row);
};

function parseRange(header: string, size: number): { start: number; end: number } | null {
	const match = header.match(/^bytes=(\d*)-(\d*)$/);
	if (!match) return null;

	let start = match[1] === '' ? NaN : Number(match[1]);
	let end = match[2] === '' ? NaN : Number(match[2]);
	if (isNaN(start) && isNaN(end)) return null;

	if (isNaN(start)) {
		start = Math.max(0, size - end);
		end = size - 1;
	} else if (isNaN(end)) {
		end = size - 1;
	}

	if (start > end || end >= size) return null;
	return { start, end };
}

export const GET: RequestHandler = async (event) => {
	const { params, request } = event;

	// Path traversal: `..%2f..%2fetc%2fpasswd` resolves outside FILES_DIR.
	const filePath = path.resolve(FILES_DIR, params.name);
	const relative = path.relative(FILES_DIR, filePath);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw error(403, 'Forbidden');
	}

	const record = await lookup(params.name);
	if (!record) throw error(404, 'Not found');

	if (!record.isPublic) {
		if (!event.locals.user) throw error(404, 'Not found');

		const access = await loadAccess(event.locals.user.id);

		// This endpoint reads `loadAccess` directly rather than going through
		// `requireUser`, so the suspension check has to be repeated here — a
		// suspended caseworker must not keep downloading case documents on a
		// session that is still, as far as Better Auth is concerned, valid.
		const caseDocument =
			access.permissions.has('submissions.read') &&
			(access.pillarIds === null ||
				(record.pillarId != null && access.pillarIds.includes(record.pillarId)));

		/**
		 * A photo attached to an offer of goods is private, but it is not case
		 * data and it is not pillar-scoped — it is a picture of what somebody is
		 * offering, worked by whoever holds `inkind.read`.
		 *
		 * Without this it was unreachable by everyone who needs it. A general-fund
		 * offer carries no pillar, and the case-document rule above demands a
		 * pillar the user is assigned to, so no scoped caseworker could open one;
		 * and a finance user with `inkind.read` but not `submissions.read` failed
		 * the first clause outright. Checked second and only on the fallback, so
		 * the common path is still one query.
		 */
		const inKindPhoto =
			!caseDocument && access.permissions.has('inkind.read') && (await isInKindPhoto(record.id));

		const allowed = !access.isBanned && (caseDocument || inKindPhoto);

		if (!allowed) {
			audit({
				event,
				action: 'permission_denied',
				entityType: 'file',
				entityId: record.id,
				metadata: { reason: 'private_file', pillarId: record.pillarId }
			});
			// 404 rather than 403: confirming a document exists at a guessed URL is
			// itself a small disclosure.
			throw error(404, 'Not found');
		}

		audit({
			event,
			action: 'downloaded_document',
			entityType: 'file',
			entityId: record.id,
			metadata: { filename: record.originalFilename }
		});
	}

	const stats = getCachedStats(filePath);
	if (!stats) throw error(404, 'Not found');

	const mimeType = record.mimeType || mimeFor(params.name);
	const cacheControl = record.isPublic ? CACHE_TTL.public : CACHE_TTL.private;
	const etag = `W/"${stats.size}-${stats.mtime.getTime()}"`;

	// Conditional requests are only worth honouring for public assets; a private
	// document should be re-authorised on every request rather than 304'd.
	if (record.isPublic) {
		if (request.headers.get('if-none-match') === etag) {
			return new Response(null, { status: 304 });
		}
		const ifModifiedSince = request.headers.get('if-modified-since');
		if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) {
			return new Response(null, { status: 304 });
		}
	}

	const baseHeaders: Record<string, string> = {
		'Content-Type': mimeType,
		'Cache-Control': cacheControl,
		'Accept-Ranges': 'bytes',
		'Last-Modified': stats.mtime.toUTCString(),
		ETag: etag,
		// An uploaded SVG or HTML file is script the browser would otherwise run
		// on our origin; forcing a download for anything but images and PDFs
		// closes that off.
		'Content-Disposition': inlineSafe(mimeType)
			? `inline; filename="${encodeURIComponent(record.originalFilename)}"`
			: `attachment; filename="${encodeURIComponent(record.originalFilename)}"`,
		'X-Content-Type-Options': 'nosniff'
	};

	const rangeHeader = request.headers.get('range');
	if (rangeHeader) {
		const range = parseRange(rangeHeader, stats.size);
		if (!range) {
			return new Response('Range not satisfiable', {
				status: 416,
				headers: { 'Content-Range': `bytes */${stats.size}` }
			});
		}

		const stream = Readable.toWeb(
			fs.createReadStream(filePath, { start: range.start, end: range.end }),
			{ strategy: new CountQueuingStrategy({ highWaterMark: 100 }) }
		);

		return new Response(stream as ReadableStream, {
			status: 206,
			headers: {
				...baseHeaders,
				'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`,
				'Content-Length': String(range.end - range.start + 1)
			}
		});
	}

	const stream = Readable.toWeb(fs.createReadStream(filePath), {
		strategy: new CountQueuingStrategy({ highWaterMark: 100 })
	});

	return new Response(stream as ReadableStream, {
		headers: { ...baseHeaders, 'Content-Length': String(stats.size) }
	});
};

/** Only these render inline; everything else downloads. */
const inlineSafe = (mimeType: string) =>
	mimeType === 'application/pdf' ||
	(mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') ||
	mimeType.startsWith('video/') ||
	mimeType.startsWith('audio/');
