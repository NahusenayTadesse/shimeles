import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { sqlite } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import type { RequestHandler } from './$types';

/**
 * The whole system in one file: the database plus the uploaded files.
 *
 * There is no dump utility to shell out to here — this is SQLite, and the
 * database *is* a file. But copying that file while the server is running is
 * exactly the thing you must not do: under WAL (see `db/index.ts`) the recent
 * commits live in `local.db-wal`, so a plain `cp` of `local.db` yields a
 * database missing everything written since the last checkpoint, and a copy
 * taken mid-write is torn. `better-sqlite3`'s `backup()` is SQLite's online
 * backup API — it takes a consistent snapshot of a live database, WAL content
 * included, without blocking writers — so that is what produces the copy we
 * hand out. The snapshot lands in a temporary directory, goes into the archive
 * alongside `FILES_DIR`, and is deleted when the stream finishes.
 *
 * The pairing matters: half of this backup is useless without the other half.
 * `files.storage_path` rows point at names under `FILES_DIR`, and a file there
 * is only servable because a row says whether it is public. Restoring one
 * without the other gives you either orphaned bytes or dead links.
 */

/** Where uploads live. Same default as `$lib/server/upload.ts`. */
const FILES_DIR = env.FILES_DIR ?? '.tempFiles';

export const GET: RequestHandler = async (event) => {
	const access = await requirePermission(event, 'data.export');

	/*
	 * `data.export` covers taking one table to CSV. This is every table at
	 * once — safeguarding checks, case notes, beneficiary addresses — plus
	 * every private case document in `FILES_DIR`, in a single file that leaves
	 * the server. Nothing short of `super_admin` gets that.
	 */
	if (!access.isSuperAdmin) {
		audit({
			event,
			action: 'permission_denied',
			entityType: 'user',
			entityId: access.userId,
			metadata: { reason: 'backup_requires_super_admin', path: event.url.pathname }
		});
		error(403, 'Only a super admin may download a full backup.');
	}

	const dbPath = env.DATABASE_URL;
	if (!dbPath) error(500, 'DATABASE_URL is not set');

	const filesDir = path.resolve(FILES_DIR);
	const includeFiles = fs.existsSync(filesDir);

	// A snapshot of a few hundred megabytes should not sit in the project
	// directory, where the next `tar` of the deploy would pick it up.
	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shimeles-backup-'));
	const snapshotName = path.basename(dbPath);
	const snapshotPath = path.join(workDir, snapshotName);

	const cleanup = () => fs.rmSync(workDir, { recursive: true, force: true });

	try {
		await sqlite.backup(snapshotPath);
	} catch (err) {
		cleanup();
		console.error('sqlite backup failed', err);
		error(500, 'Could not snapshot the database');
	}

	// `-C` changes directory between members, so the archive contains
	// `local.db` and `<files dir>/…` at its root rather than absolute paths.
	const tar = spawn('tar', [
		'-czf',
		'-',
		'-C',
		workDir,
		snapshotName,
		...(includeFiles ? ['-C', path.dirname(filesDir), path.basename(filesDir)] : [])
	]);

	tar.stderr.on('data', (chunk) => console.error('tar:', chunk.toString()));
	tar.on('error', (err) => console.error('tar failed to start', err));
	// Fires on success, on failure, and when the client aborts the download and
	// the piped stream is destroyed — so the snapshot never outlives the request.
	tar.on('close', cleanup);

	/*
	 * `Readable.toWeb` rather than a hand-rolled `ReadableStream`: pushing every
	 * `data` chunk into a controller ignores backpressure, so a client on a slow
	 * connection would have the entire archive buffered in the server's memory.
	 * This keeps `tar` paused until the socket drains, and destroys it — firing
	 * the cleanup above — if the client goes away.
	 */
	const body = Readable.toWeb(tar.stdout) as ReadableStream<Uint8Array>;

	audit({
		event,
		action: 'exported_data',
		entityType: 'export',
		metadata: { kind: 'full_backup', database: snapshotName, files: includeFiles }
	});

	const fileName = `shimeles-backup_${new Date().toISOString().slice(0, 10)}.tar.gz`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/gzip',
			'Content-Disposition': `attachment; filename="${fileName}"`,
			// Nothing between here and the browser should keep a copy of this.
			'Cache-Control': 'no-store'
		}
	});
};
