import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { siteSettings, translations } from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';

/* ==========================================================================
   Site settings
   ========================================================================== */

export interface SettingRow {
	key: string;
	value: string | null;
	valueType: string;
	label: string;
	hint: string | null;
	group: string;
	sortOrder: number;
}

/** Every live setting, keyed for O(1) lookup. Cached — see `$lib/server/cache`. */
export const loadSettings = (): Promise<Map<string, SettingRow>> =>
	cached('settings', async () => {
		const rows = await db
			.select({
				key: siteSettings.key,
				value: siteSettings.value,
				valueType: siteSettings.valueType,
				label: siteSettings.label,
				hint: siteSettings.hint,
				group: siteSettings.group,
				sortOrder: siteSettings.sortOrder
			})
			.from(siteSettings)
			.where(and(eq(siteSettings.isActive, true), isNull(siteSettings.deletedAt)))
			.orderBy(asc(siteSettings.group), asc(siteSettings.sortOrder));

		return new Map(rows.map((row) => [row.key, row]));
	});

/**
 * Settings as a plain object, for handing to components through `load`.
 * Returns `''` rather than `undefined` for an unset key, so a template can
 * interpolate it without a guard.
 */
export async function settingsMap(): Promise<Record<string, string>> {
	const map = await loadSettings();
	const out: Record<string, string> = {};
	for (const [key, row] of map) out[key] = row.value ?? '';
	return out;
}

/** One setting. Empty string when unset, never `undefined`. */
export async function setting(key: string): Promise<string> {
	return (await loadSettings()).get(key)?.value ?? '';
}

/** Numeric settings — the impact-counter overrides. Null when unset or blank. */
export async function settingNumber(key: string): Promise<number | null> {
	const raw = (await loadSettings()).get(key)?.value;
	if (raw == null || raw.trim() === '') return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Boolean settings — the yes/no switches the settings screen renders as a
 * select of `true`/`false`.
 *
 * Anything that is not an explicit yes is a no, including a missing row and a
 * blank value. A switch that decides whether mail goes to a beneficiary must
 * default to *not sending* when its value is unreadable, not to sending.
 */
export async function settingFlag(key: string): Promise<boolean> {
	const raw = (await loadSettings()).get(key)?.value?.trim().toLowerCase();
	return raw === 'true' || raw === '1' || raw === 'yes';
}

export const invalidateSettings = () => invalidate('settings');

/* ==========================================================================
   UI strings
   ========================================================================== */

/**
 * The `t(key)` helper the spec asks for: reads from the `translations` table
 * rather than a static i18n JSON file, so fixing a wrong or clumsy button label
 * is a dashboard edit and not a deploy.
 *
 * v1 is English-only *by default*. The table keeps its `am` column, and the
 * one component that lets a visitor ask for Amharic — the help panel — reads it
 * through `stringPairs` below. Everything else renders `en`, so restoring the
 * language properly stays a rendering change rather than a migration.
 *
 * Returns the key itself when a string is missing, which makes the gap obvious
 * on the page instead of rendering a blank button.
 */
const loadStrings = () =>
	cached('translations', () =>
		db
			.select({ key: translations.key, en: translations.en, am: translations.am })
			.from(translations)
			.where(and(eq(translations.isActive, true), isNull(translations.deletedAt)))
	);

export async function translator(): Promise<(key: string, fallback?: string) => string> {
	const rows = await loadStrings();
	const map = new Map(rows.map((row) => [row.key, row.en]));
	return (key: string, fallback?: string) => map.get(key) || fallback || key;
}

/**
 * The same strings as a plain object, for handing to components through
 * `load`. Functions do not survive serialisation across the load boundary.
 */
export async function stringsMap(): Promise<Record<string, string>> {
	const rows = await loadStrings();
	const out: Record<string, string> = {};
	for (const row of rows) out[row.key] = row.en || row.key;
	return out;
}

/**
 * The strings under a prefix, with their Amharic where somebody has written it.
 *
 * For the one place a visitor picks the language rather than the server: the
 * help panel. Everywhere else reads `stringsMap`, which stays English — see
 * *Language* in the README for what v1 does and does not switch.
 */
export async function stringPairs(
	prefix: string
): Promise<Record<string, { en: string; am: string | null }>> {
	const rows = await loadStrings();
	const out: Record<string, { en: string; am: string | null }> = {};
	for (const row of rows) {
		if (row.key.startsWith(prefix)) out[row.key] = { en: row.en || row.key, am: row.am };
	}
	return out;
}

export const invalidateTranslations = () => invalidate('translations');
