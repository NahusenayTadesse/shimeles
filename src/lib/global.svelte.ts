import { SvelteDate } from 'svelte/reactivity';
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
 * Kept for its callers; the formatting itself now lives in `$lib/dates`.
 *
 * The name is a leftover — it never produced an Ethiopian-calendar date, and
 * the app is deliberately Gregorian for v1.
 */
export const formatEthiopianDate = (date: Date | string | undefined): string =>
	date ? formatDateLong(new SvelteDate(date), '') : '';
