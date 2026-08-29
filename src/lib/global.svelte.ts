import { MediaQuery, SvelteDate } from 'svelte/reactivity';
import { formatDateLong } from '$lib/dates';

export const bgGradient = `bg-linear-to-r from-background to-secondary`;

export const selectItem = `hover:bg-gray-100 hover:shadow-md hover:scale-101 duration-300 transition-all ease-in-out dark:hover:bg-gray-900`;

export const dropdownClass = `flex capitalize flex-row gap-2 ${selectItem}`;

/** Shared label styling for the form components that do not use shadcn's Label. */
export const label = `text-sm font-medium leading-none capitalize`;

/** Option shape used by the select and combobox inputs. */
export type Item = {
	value: string | number;
	name: string;
	/** Shown, but not choosable — a paused in-kind category, say. */
	disabled?: boolean;
};

export function isMobile() {
	if (typeof window === 'undefined') return false; // SSR guard
	return window.innerWidth <= 768;
}

/**
 * A phone-width viewport, reactively.
 *
 * `isMobile()` reads the window once, wherever it happens to be called, so a
 * component that branched on it kept whatever answer it got on first render —
 * rotate the phone or drag the window and the layout stayed as it was. This
 * tracks the media query itself, and answers `false` during SSR so the server
 * always renders the wide layout and the client corrects it if it must.
 */
export const phone = new MediaQuery('max-width: 640px');

/**
 * Kept for its callers; the formatting itself now lives in `$lib/dates`.
 *
 * The name is a leftover — it never produced an Ethiopian-calendar date, and
 * the app is deliberately Gregorian for v1.
 */
export const formatEthiopianDate = (date: Date | string | undefined): string =>
	date ? formatDateLong(new SvelteDate(date), '') : '';
