/**
 * Makes phone- and tablet-sized copies of every public photograph.
 *
 * A photo is uploaded once, at up to 1600px (see `$lib/forms/uploads.ts`), and
 * every visitor used to download that whole file — a 400px-wide phone included,
 * on mobile data, which is most of the Foundation's audience. This writes
 * `480`, `960` and `1600`-wide WebP copies beside the originals, and
 * `/files/[name]?w=480` serves them. Pages ask for them with `srcset`, so the
 * browser picks the smallest one that is sharp on that screen.
 *
 * **Runs from cron, never inside a request.** The server has one core; resizing
 * while a visitor waits would slow every page for everyone else. Here it runs
 * one image at a time, at the lowest CPU priority, in a process that exits when
 * it is done — the web server's memory never sees it. Until a copy exists,
 * `/files` serves the original, so nothing is ever broken in between.
 *
 * The crontab line — every ten minutes, niced, never two runs at once — is in
 * OPERATIONS.md §5b, with how to check it is working.
 *
 * Deliberate choices:
 *
 * - **Public images only**, for the same reason as `optimize-images.mjs`: a
 *   private file is a case document, and copying evidence around is not this
 *   script's business. `/files` also refuses `?w=` on a private file.
 * - **Originals are never touched.** Copies live in `.variants/` under
 *   `FILES_DIR`, named after the stored file, so deleting that folder is a
 *   complete undo and the next run rebuilds it.
 * - **No copy wider than the original.** A 900px photo gets a 480 copy and
 *   nothing else; asking for 960 or 1600 falls back to the original, which is
 *   already that size.
 * - **Metadata is dropped** (sharp's default). A phone photo carries GPS
 *   coordinates, and these are pictures of people the Foundation works with.
 * - **Copies of files that are gone or no longer public are deleted**, so the
 *   folder does not outlive what it was made from.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';

/** Keep in step with `IMAGE_WIDTHS` in `src/lib/assets.ts`. */
const WIDTHS = [480, 960, 1600];
const QUALITY = 74;

// One thread and no cache: this box has one core and a web server to protect,
// and a cron run that finishes a little slower costs nobody anything.
sharp.concurrency(1);
sharp.cache(false);

const FILES_DIR = path.resolve(process.env.FILES_DIR ?? '.tempFiles');
const VARIANTS_DIR = path.join(FILES_DIR, '.variants');
const DB_PATH = process.env.DATABASE_URL ?? 'local.db';

fs.mkdirSync(VARIANTS_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });
const rows = db
	.prepare(
		`select storage_path from files
		 where is_public = 1 and deleted_at is null
		   and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')`
	)
	.all();
db.close();

/** Must match `variantName` in `src/routes/files/[name=filename]/+server.ts`. */
const variantName = (storagePath, width) => `${storagePath}.${width}w.webp`;

const started = Date.now();
let made = 0;
let failed = 0;
const keep = new Set();

for (const { storage_path: name } of rows) {
	const source = path.join(FILES_DIR, name);
	// A stored name is a bare filename; anything with a separator is not ours.
	if (name.includes('/') || name.includes('\\') || !fs.existsSync(source)) continue;

	const sourceTime = fs.statSync(source).mtimeMs;
	let width;

	for (const target of WIDTHS) {
		const file = variantName(name, target);
		const out = path.join(VARIANTS_DIR, file);

		if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= sourceTime) {
			keep.add(file);
			continue;
		}

		try {
			width ??= (await sharp(source).metadata()).width ?? 0;
			// The smallest copy is always worth making; the larger ones only when
			// they are actually smaller than the photo itself.
			if (target !== WIDTHS[0] && target >= width) continue;

			const temp = `${out}.tmp`;
			await sharp(source, { limitInputPixels: 50_000_000 })
				.rotate()
				.resize({ width: target, withoutEnlargement: true })
				.webp({ quality: QUALITY, effort: 4 })
				.toFile(temp);
			// Renamed into place, so `/files` never serves a half-written copy.
			fs.renameSync(temp, out);
			keep.add(file);
			made += 1;
		} catch (err) {
			failed += 1;
			console.error(`  ! ${name} @${target}: ${String(err.message).split('\n')[0]}`);
			fs.rmSync(`${out}.tmp`, { force: true });
			break;
		}
	}
}

let removed = 0;
for (const file of fs.readdirSync(VARIANTS_DIR)) {
	if (keep.has(file) || file.endsWith('.tmp')) continue;
	// A copy whose original is still public but was skipped above (too small
	// for that width) is simply not in `keep` either — only delete copies whose
	// source is no longer in the public set at all.
	const source = file.replace(/\.\d+w\.webp$/, '');
	if (rows.some((row) => row.storage_path === source)) continue;
	fs.rmSync(path.join(VARIANTS_DIR, file), { force: true });
	removed += 1;
}

if (made || failed || removed) {
	console.log(
		`${new Date().toISOString()} made ${made}, failed ${failed}, removed ${removed}, ` +
			`${rows.length} public images, ${((Date.now() - started) / 1000).toFixed(1)}s`
	);
}
