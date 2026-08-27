import { describe, expect, it } from 'vitest';
import {
	escapeHtml,
	footnote,
	htmlToText,
	paragraphs,
	plainTemplate,
	referencePanel,
	replyTemplate,
	shell
} from './email';

/**
 * The template-building helpers, which are pure and therefore the part worth
 * testing. `sendEmail` itself is a thin wrapper over nodemailer and is
 * exercised by `scripts/send-test-email.ts` against a real SMTP server.
 */
describe('escapeHtml', () => {
	it('neutralises markup somebody typed into a reply box', () => {
		expect(escapeHtml('<script>alert("x")</script> & co')).toBe(
			'&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co'
		);
	});
});

describe('paragraphs', () => {
	it('keeps the line breaks the writer meant', () => {
		// The bug this replaces: a body dropped straight into one <p>, where
		// every newline collapsed and a reference on its own line ran on.
		expect(paragraphs('First line\nSecond line')).toBe('<p>First line<br />Second line</p>');
	});

	it('splits blank-line-separated blocks into separate paragraphs', () => {
		expect(paragraphs('One\n\nTwo')).toBe('<p>One</p>\n<p>Two</p>');
	});

	it('escapes as it goes, so typed-in prose cannot inject markup', () => {
		expect(paragraphs('<b>hi</b>')).toBe('<p>&lt;b&gt;hi&lt;/b&gt;</p>');
	});
});

describe('shell', () => {
	const rendered = shell('Heading', '<p>Body</p>', {
		origin: 'https://example.org',
		action: { label: 'Give now', href: '/donate' }
	});

	it('carries the logo from the site origin, never a relative path', () => {
		// A mail client has no page to resolve a relative URL against.
		expect(rendered).toContain('src="https://example.org/logo.png"');
	});

	it('leads with the brand green, not the terracotta it used to', () => {
		expect(rendered).toContain('#0e3b2e');
		expect(rendered).not.toContain('#b4622f');
	});

	it('resolves an action path against the origin and keeps absolute ones', () => {
		expect(rendered).toContain('href="https://example.org/donate"');
		expect(
			shell('H', '', {
				origin: 'https://example.org',
				action: { label: 'X', href: 'https://x.test/y' }
			})
		).toContain('href="https://x.test/y"');
	});

	it('carries the standing links back into the site', () => {
		expect(rendered).toContain('https://example.org/volunteer');
		expect(rendered).toContain('https://example.org/contact');
		expect(rendered).toContain('Visit the website');
	});

	it('escapes the heading, so a status label cannot inject markup', () => {
		expect(shell('<b>x</b>', '', { origin: 'https://example.org' })).toContain(
			'&lt;b&gt;x&lt;/b&gt;'
		);
	});
});

describe('htmlToText', () => {
	it('gives a readable alternative rather than a wall of tags', () => {
		const text = htmlToText(
			shell('Heading', '<p>First</p><p>Second<br />line</p>', { origin: 'https://example.org' })
		);
		expect(text).toContain('Heading');
		expect(text).toContain('First');
		expect(text).toMatch(/Second\nline/);
		expect(text).not.toContain('<');
	});

	it('unescapes what escapeHtml escaped, so the text reads as written', () => {
		expect(htmlToText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
	});
});

describe('plainTemplate', () => {
	it('is a complete template: subject, heading, body, and its own text', () => {
		const template = plainTemplate(
			'New enquiry',
			'A message arrived.\n\nReference: ABC',
			'Subject line'
		);
		expect(template.subject).toBe('Subject line');
		expect(template.heading).toBe('New enquiry');
		expect(template.body).toContain('<p>Reference: ABC</p>');
		// The text alternative is the body exactly as it was written.
		expect(template.text).toBe('A message arrived.\n\nReference: ABC');
	});

	it('falls back to the heading when no subject is given', () => {
		expect(plainTemplate('Just this', 'body').subject).toBe('Just this');
	});
});

describe('replyTemplate', () => {
	const reply = replyTemplate({
		name: 'Daniel Tesfaye',
		body: 'First paragraph.\n\nSecond paragraph.',
		reference: 'SAF-MED-2026-0042',
		about: 'request'
	});

	it('names what it is a reply to, so two threads are distinguishable', () => {
		expect(reply.subject).toContain('your request');
		expect(reply.subject).toContain('SAF-MED-2026-0042');
		expect(
			replyTemplate({ name: 'X', body: 'y', reference: 'R', about: 'message' }).subject
		).toContain('your message');
	});

	it('gives the reference the same panel every other template gives it', () => {
		// It used to be 13px grey text flush against the last sentence — the one
		// thing the reader has to keep, and the hardest thing to find.
		expect(reply.body).toContain(referencePanel('SAF-MED-2026-0042'));
	});

	it('keeps the paragraphs the staff member wrote', () => {
		expect(reply.body).toContain('<p>First paragraph.</p>');
		expect(reply.body).toContain('<p>Second paragraph.</p>');
	});

	it('escapes what was typed, so a reply cannot inject markup', () => {
		expect(
			replyTemplate({ name: 'X', body: '<b>hi</b>', reference: 'R', about: 'message' }).body
		).toContain('&lt;b&gt;hi&lt;/b&gt;');
	});

	it('carries no button, because the action is replying to the email', () => {
		expect(reply.action).toBeUndefined();
	});
});

describe('footnote', () => {
	it('separates a closing aside instead of gluing it to the last line', () => {
		expect(footnote('note')).toContain('border-top');
	});
});
