import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CheckboxField from './CheckboxField.svelte';

/**
 * The consent box, in a real browser.
 *
 * This component carries the required consents on `/apply`, the newsletter
 * opt-in on `/donate` and `/contact`, and the safe-to-contact question. Two
 * things about it are easy to get wrong and impossible to see from the call
 * site, and both are checked here:
 *
 * 1. **Clicking the words has to tick the box.** The label used to wrap the
 *    control rather than point at it, and `<Checkbox>` renders a
 *    `<button role="checkbox">` — a `<label>` that merely wraps a button does
 *    not forward clicks to it. So the words were dead, and the only target was
 *    the box itself, about 18 pixels square.
 * 2. **What it posts has to be a string the server reads correctly.** An
 *    unticked box posts `"false"`, which `z.coerce.boolean()` would turn into
 *    `true`; `flagField()` on the server parses it properly, and this asserts
 *    the wire value it is given.
 */

const hidden = (name: string) =>
	document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;

describe('a consent box', () => {
	it('posts a value the server reads as unticked before it is touched', async () => {
		render(CheckboxField, { name: 'consentToStore', label: 'You may keep this application' });
		expect(hidden('consentToStore')).toBe('false');
	});

	it('is ticked by clicking its own words, which is how people tick a box', async () => {
		render(CheckboxField, { name: 'consentToStore', label: 'You may keep this application' });
		await page.getByText('You may keep this application').click();
		expect(hidden('consentToStore')).toBe('true');
	});

	it('unticks again on a second click of the words', async () => {
		render(CheckboxField, { name: 'consentToStore', label: 'You may keep this application' });
		await page.getByText('You may keep this application').click();
		await page.getByText('You may keep this application').click();
		expect(hidden('consentToStore')).toBe('false');
	});

	it('binds the label to the control rather than leaving it pointing nowhere', async () => {
		render(CheckboxField, { name: 'safeToContact', label: 'It is safe to call me' });
		const label = document.querySelector('label[for]');
		expect(label?.getAttribute('for')).toBeTruthy();
		expect(document.getElementById(label!.getAttribute('for')!)).not.toBeNull();
	});

	it('still works with no name, which is what a JSON-posted form gives it', async () => {
		// Those forms carry no hidden mirror, so the only thing to check is that
		// the label still points at a control that exists.
		render(CheckboxField, { label: 'Send me occasional updates' });
		const label = document.querySelector('label[for]');
		expect(document.getElementById(label!.getAttribute('for')!)).not.toBeNull();
	});

	it('reads a question asked in the negative the right way round', async () => {
		// `invert` is for "it may NOT be safe to contact me" sitting on a
		// `safeToContact` field: ticking the box has to store `false`.
		render(CheckboxField, {
			name: 'safeToContact',
			label: 'It may not be safe to contact me',
			checked: true,
			invert: true
		});
		expect(hidden('safeToContact')).toBe('true');
		await page.getByText('It may not be safe to contact me').click();
		expect(hidden('safeToContact')).toBe('false');
	});
});
