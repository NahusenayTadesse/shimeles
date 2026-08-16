import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { siteSettings } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { invalidateSettings } from '$lib/server/settings';
import { savePublicImage } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Site settings.
 *
 * Fully generic, per §5.2: one auto-rendered form per `group`, built entirely
 * from the rows in `site_settings`. Adding `social.linkedin` next year is a new
 * row — no migration, no new field in a schema, no change to this file.
 *
 * That is also why there is no Zod schema here. The set of fields is not known
 * at compile time, so validation is per-`value_type` at save time instead:
 * a `number` setting must parse as a number, a `url` must look like one, and
 * anything else is stored as the text it is.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'settings.manage');

	const rows = await db
		.select()
		.from(siteSettings)
		.where(isNull(siteSettings.deletedAt))
		.orderBy(asc(siteSettings.group), asc(siteSettings.sortOrder), asc(siteSettings.id));

	audit({ event, action: 'viewed_list', entityType: 'site_setting' });

	// Grouped here rather than in the component, so the page renders a stable
	// order without the client re-sorting on every keystroke.
	const groups = new Map<string, typeof rows>();
	for (const row of rows) {
		const list = groups.get(row.group) ?? [];
		list.push(row);
		groups.set(row.group, list);
	}

	return {
		groups: [...groups.entries()].map(([name, settings]) => ({ name, settings }))
	};
};

/** What a value must look like, by `value_type`. Returns an error or null. */
function validate(valueType: string, value: string): string | null {
	if (value === '') return null;

	switch (valueType) {
		case 'number':
			return Number.isFinite(Number(value)) ? null : 'must be a number';
		case 'boolean':
			return ['true', 'false'].includes(value) ? null : 'must be true or false';
		case 'url':
			try {
				new URL(value);
				return null;
			} catch {
				return 'must be a full URL, including https://';
			}
		case 'json':
			try {
				JSON.parse(value);
				return null;
			} catch {
				return 'must be valid JSON';
			}
		default:
			return null;
	}
}

export const actions: Actions = {
	/**
	 * Saves one group's worth of settings.
	 *
	 * Each group is its own form, so a staff member editing the contact details
	 * cannot accidentally blank the homepage hero by having it in the same POST.
	 */
	save: async (event) => {
		const access = await requirePermission(event, 'settings.manage');
		const formData = await event.request.formData();
		const group = String(formData.get('__group') ?? '');

		if (!group) return fail(400, { error: 'No settings group was given.' });

		const rows = await db
			.select()
			.from(siteSettings)
			.where(and(eq(siteSettings.group, group), isNull(siteSettings.deletedAt)));

		const errors: Record<string, string> = {};
		const updates: { id: number; key: string; value: string | null }[] = [];

		for (const row of rows) {
			// Image settings post a File under the key, and keep their stored value
			// when nothing new was chosen.
			if (row.valueType === 'image') {
				const file = formData.get(row.key);
				if (file instanceof File && file.size > 0) {
					try {
						const stored = await savePublicImage(file, access.userId);
						updates.push({ id: row.id, key: row.key, value: stored });
					} catch (err) {
						errors[row.key] = (err as Error).message;
					}
				}
				continue;
			}

			const raw = formData.get(row.key);
			// A key absent from this POST was not on this form; leave it alone
			// rather than blanking it.
			if (raw === null) continue;

			const value = String(raw).trim();
			const problem = validate(row.valueType, value);
			if (problem) {
				errors[row.key] = `${row.label} ${problem}`;
				continue;
			}

			updates.push({ id: row.id, key: row.key, value: value || null });
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors, group });
		}

		for (const update of updates) {
			await db
				.update(siteSettings)
				.set({ value: update.value, updatedBy: access.userId, updatedAt: new Date() })
				.where(eq(siteSettings.id, update.id));
		}

		invalidateSettings();
		audit({
			event,
			action: 'updated',
			entityType: 'site_setting',
			metadata: { group, keys: updates.map((u) => u.key) }
		});

		return { saved: group, count: updates.length };
	}
};
