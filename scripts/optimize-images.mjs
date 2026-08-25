/**
 * Re-encodes the public images already in `.tempFiles/`, in place.
 *
 * The site's photographs were arriving as 900 KB PNGs — a photograph saved in a
 * lossless format at full quality — and About was shipping 7.6 MB of them, for
 * a 14-second largest-contentful-paint on a throttled phone. The browser-side
 * compression in `$lib/forms/uploads.ts` stops that happening to anything
 * uploaded from now on; this is for everything uploaded before it.
 *
 * Run it **on the server**, where the files are:
 *
 *     ssh hstgr 'cd /home/admin/app && node optimize-images.mjs --dry-run'
 *     ssh hstgr 'cd /home/admin/app && node optimize-images.mjs'
 *
 * Take a backup first (OPERATIONS.md §4) — this rewrites files in place — and
 * restart the service afterwards, because the app caches each file's row and
 * its size on disk and would otherwise serve a stale `Content-Length`.
 *
 * Three deliberate choices:
 *
 * - **Public files only.** A private file is a case document — a photograph of
 *   a hospital letter — and re-compressing evidence is not this script's
 *   business. It reads `is_public = 1` and touches nothing else.
 * - **The stored name is left alone.** Every reference to an image anywhere in
 *   the database is this filename, across a dozen columns and one JSON blob;
 *   renaming `photo.png` to `photo.webp` to match its new bytes would mean
 *   rewriting all of them, and one missed reference is a broken image on the
 *   live site. The extension is cosmetic — `/files/[name]` sends the
 *   `Content-Type` from the `files` row, which this script updates.
 * - **Only kept when it is a real saving.** Anything under 15% smaller is
 *   discarded and the original left untouched, which is also what makes
 *   re-running this a no-op rather than a slow re-compression of everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const DRY_RUN = process.argv.includes('--dry-run');

/** Beyond this, a photograph on a page is being downscaled by the browser. */
const MAX_DIMENSION = 1600;
const QUALITY = 82;
/** Below this saving, the churn is not worth a re-encode. */
const MIN_SAVING = 0.15;

const FILES_DIR = path.resolve(process.env.FILES_DIR ?? '.tempFiles');
const DB_PATH = process.env.DATABASE_URL ?? 'local.db';

const db = new Database(DB_PATH);

const rows = db
	.prepare(
		`select id, storage_path, mime_type, size_bytes
		 from files
		 where is_public = 1 and mime_type like 'image/%' and deleted_at is null`
	)
	.all();

const update = db.prepare(`update files set mime_type = ?, size_bytes = ? where id = ?`);

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

let before = 0;
let after = 0;
let rewritten = 0;
let untouched = 0;
let missing = 0;

for (const row of rows) {
	const source = path.join(FILES_DIR, row.storage_path);
	if (!fs.existsSync(source)) {
		missing += 1;
		continue;
	}

	const originalSize = fs.statSync(source).size;
	before += originalSize;

	// A sibling temp file, so a failure part-way through leaves the original
	// exactly as it was rather than a half-written image.
	const temp = `${source}.optimising`;

	try {
		execFileSync('convert', [
			source,
			'-auto-orient',
			// The `>` suffix is "only shrink" — a small logo is never blown up.
			'-resize',
			`${MAX_DIMENSION}x${MAX_DIMENSION}>`,
			// Drops EXIF. A photograph taken on a phone carries GPS coordinates,
			// and these are pictures of people the Foundation works with.
			'-strip',
			'-quality',
			String(QUALITY),
			'-define',
			'webp:method=6',
			`webp:${temp}`
		]);
	} catch (err) {
		console.error(`  ! ${row.storage_path}: ${err.message.split('\n')[0]}`);
		fs.rmSync(temp, { force: true });
		after += originalSize;
		untouched += 1;
		continue;
	}

	const newSize = fs.statSync(temp).size;

	if (newSize > originalSize * (1 - MIN_SAVING)) {
		fs.rmSync(temp, { force: true });
		after += originalSize;
		untouched += 1;
		continue;
	}

	console.log(
		`  ${row.storage_path}  ${kb(originalSize)} → ${kb(newSize)}  (−${Math.round((1 - newSize / originalSize) * 100)}%)`
	);

	if (!DRY_RUN) {
		fs.renameSync(temp, source);
		update.run('image/webp', newSize, row.id);
	} else {
		fs.rmSync(temp, { force: true });
	}

	after += newSize;
	rewritten += 1;
}

console.log(
	`\n${DRY_RUN ? '[dry run] ' : ''}${rewritten} re-encoded, ${untouched} already small enough` +
		(missing ? `, ${missing} missing from disk` : '')
);
console.log(
	`${kb(before)} → ${kb(after)}  (−${before ? Math.round((1 - after / before) * 100) : 0}%)`
);

if (!DRY_RUN && rewritten) {
	console.log('\nRestart the service now — it caches file rows and sizes:');
	console.log('  ssh root@148.230.83.102 systemctl restart shimeles');
}
