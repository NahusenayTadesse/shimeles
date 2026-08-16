import { getNavigation } from '$lib/server/content';
import { settingsMap, stringsMap } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

/**
 * The chrome every page needs: navigation, site settings and UI strings.
 *
 * Three cached reads rather than three queries per request — see
 * `$lib/server/cache`. None of this belongs in a component, because none of it
 * is allowed to be a string literal (§0).
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const [navigation, settings, strings] = await Promise.all([
		getNavigation(),
		settingsMap(),
		stringsMap()
	]);

	return {
		navigation,
		settings,
		strings,
		user: locals.user
			? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
			: null
	};
};
