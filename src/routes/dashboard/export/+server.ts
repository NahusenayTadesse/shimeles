import { json } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/permissions';
import { audit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

/**
 * The permission check and the audit row behind a table export.
 *
 * The export itself is done in the browser — `table-export.svelte` reads the
 * rendered `<table>` out of the DOM — which is why this endpoint exists at all.
 * A client-side scrape cannot check a permission and cannot write to the audit
 * log, so it did neither: `data.export` was declared, granted to `finance` and
 * checked nowhere, and `exported_data` was declared and written nowhere. A
 * caseworker could take the whole application list to CSV, and §3.11 would show
 * nothing had happened.
 *
 * The component asks here first and exports only on a 200. That is a real
 * control on the permission and a real audit trail, with one honest limit:
 * someone determined to keep the rows can still copy what is on their screen.
 * That is true of any rendered page, and the point of the log is to record the
 * ordinary act of exporting, not to defeat a copy-paste.
 */
export const POST: RequestHandler = async (event) => {
	await requirePermission(event, 'data.export');

	const body = await event.request.json().catch(() => ({}) as Record<string, unknown>);
	const table = typeof body.table === 'string' ? body.table.slice(0, 100) : 'unknown';
	const format = body.format === 'print' ? 'print' : 'csv';
	const rows = Number.isFinite(Number(body.rows)) ? Number(body.rows) : null;

	audit({
		event,
		action: 'exported_data',
		entityType: 'export',
		metadata: { table, format, rows, path: event.request.headers.get('referer') }
	});

	return json({ ok: true });
};
