import { describe, expect, it } from 'vitest';
import {
	hasRichText,
	isRichText,
	normalizeRichText,
	renderRichText,
	richTextToPlain,
	sanitizeRichText
} from './richtext';

/**
 * The rules the dashboard editors, the screens that show what they wrote and
 * the emails that send it all share. Every case here is one a caseworker can
 * reach: a pasted newsletter, an untouched box, a note typed years ago into
 * the plain textarea these editors replaced.
 */
describe('isRichText', () => {
	it('recognises what the editor emits', () => {
		expect(isRichText('<p>Hello</p>')).toBe(true);
		expect(isRichText('\n  <ul><li>One</li></ul>')).toBe(true);
	});

	it('leaves typed prose alone, angle brackets and all', () => {
		// The note that would break a looser test: a caseworker writing about a
		// family, in a plain box, years before this existed.
		expect(isRichText('She said <3 to the whole team')).toBe(false);
		expect(isRichText('Rang them.\nNo answer.')).toBe(false);
		expect(isRichText('')).toBe(false);
	});
});

describe('sanitizeRichText', () => {
	it('keeps the formatting staff actually use', () => {
		const html = '<p>Dear <strong>Sara</strong></p><ul><li>One</li><li>Two</li></ul>';
		expect(sanitizeRichText(html)).toBe(html);
	});

	it('removes a script tag and the code inside it', () => {
		expect(sanitizeRichText('<p>Hi</p><script>alert("x")</script>')).toBe('<p>Hi</p>');
	});

	it('drops event handlers and styles a paste dragged in', () => {
		expect(sanitizeRichText('<p onclick="steal()" style="color:red">Hi</p>')).toBe('<p>Hi</p>');
	});

	it('unwraps unknown tags rather than losing the words inside them', () => {
		expect(sanitizeRichText('<p><span class="x">Kept</span></p>')).toBe('<p>Kept</p>');
	});

	it('keeps a real link and refuses a javascript: one', () => {
		expect(sanitizeRichText('<a href="https://example.org">Site</a>')).toContain(
			'href="https://example.org"'
		);
		expect(sanitizeRichText('<a href="javascript:alert(1)">Bad</a>')).toBe('<a>Bad</a>');
	});
});

describe('renderRichText', () => {
	it('keeps the line breaks of a note written before the editors existed', () => {
		expect(renderRichText('Rang them.\nNo answer.')).toBe('<p>Rang them.<br />No answer.</p>');
	});

	it('renders editor HTML as itself', () => {
		expect(renderRichText('<p>Written today</p>')).toBe('<p>Written today</p>');
	});
});

describe('hasRichText', () => {
	it('sees through an untouched editor', () => {
		// What an editor posts when somebody clicks into it and straight back
		// out. `min(1)` is satisfied by this; a donor reading the decline is not.
		expect(hasRichText('<p></p>')).toBe(false);
		expect(hasRichText('<p><br></p>')).toBe(false);
		expect(hasRichText('')).toBe(false);
		expect(hasRichText('<p>Because we have no cold storage.</p>')).toBe(true);
	});
});

describe('normalizeRichText', () => {
	it('reduces an empty editor to an empty string', () => {
		expect(normalizeRichText('<p><br></p>')).toBe('');
	});

	it('sanitizes what it stores', () => {
		expect(normalizeRichText('<p>Hi</p><script>x()</script>')).toBe('<p>Hi</p>');
	});

	it('leaves plain text as plain text', () => {
		expect(normalizeRichText('  Rang them.  ')).toBe('Rang them.');
	});
});

describe('richTextToPlain', () => {
	it('reads a bulleted list back as lines', () => {
		expect(richTextToPlain('<p>Bring:</p><ul><li>Coats</li><li>Blankets</li></ul>')).toBe(
			'Bring:\nCoats\nBlankets'
		);
	});
});
