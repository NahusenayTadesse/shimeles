/**
 * Prose a staff member typed, on its way to a screen or an inbox.
 *
 * Four things now share one definition of what that prose is: the dashboard
 * editors that write it, the pages that show it back, the emails that send it,
 * and the server actions that decide whether anything was actually written.
 *
 * **Dependency-free, deliberately.** `$lib/server/email-templates` imports it
 * with a relative path for the reason documented there — `scripts/send-test-emails.ts`
 * runs under tsx, outside Vite, where the `$lib` alias does not resolve.
 *
 * The trust model matches the rest of the dashboard: staff are authors, and
 * what they write is rendered as HTML rather than escaped, exactly as a blog
 * post or a page block is. `sanitizeRichText` is not what keeps the Foundation
 * safe from its own caseworkers — it is what stops a pasted-in newsletter from
 * carrying a `<script>` tag or a tracking pixel into somebody's inbox.
 */

/** `&` first, or the escapes escape each other. */
export const escapeHtml = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Tags the editor produces, plus the ones a paste can drag in behind them.
 *
 * Anything outside this list is unwrapped rather than deleted — the words
 * inside a stray `<span>` are still the words the person wrote.
 */
const ALLOWED_TAGS = new Set([
	'p',
	'br',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'strike',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'h1',
	'h2',
	'h3',
	'h4',
	'a',
	'hr'
]);

/** Kept per tag. Everything else — `style`, `class`, every `on*` — is dropped. */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
	a: ['href', 'title']
};

/** Their content goes too, not just their tags: a stripped `<script>` would leave its code as text. */
const ELEMENTS_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * An allowlist of schemes, not a blocklist of `javascript:` and `data:`.
 *
 * The difference matters: a blocklist has to anticipate every spelling —
 * padded, tab-separated, entity-encoded — while a link that does not *begin*
 * with one of these four shapes is dropped however it was written.
 */
const isSafeUrl = (url: string): boolean =>
	/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim());

/**
 * True when a stored value is editor HTML rather than prose somebody typed
 * into a plain box.
 *
 * Every one of these fields has rows of plain text behind it, written before
 * the editors existed, and they must keep rendering with their line breaks
 * intact. The test is deliberately narrow — it asks whether the value *opens*
 * with a block element, which is what the editor always emits and what a
 * person writing "I said <3 to the family" never does.
 */
export const isRichText = (value: string | null | undefined): boolean =>
	/^\s*<(p|div|h[1-6]|ul|ol|blockquote|pre|hr|table|figure)\b/i.test(value ?? '');

/**
 * Editor HTML with anything executable, remote or invisible taken out.
 *
 * A tag walk rather than a parser: this runs on the server, where there is no
 * DOM, and inside `email-templates`, which is not allowed to grow a dependency.
 */
export const sanitizeRichText = (html: string): string =>
	html
		.replace(ELEMENTS_WITH_CONTENT, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(
			/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g,
			(_match, closing: string, rawName: string, rawAttrs: string) => {
				const tag = rawName.toLowerCase();
				if (!ALLOWED_TAGS.has(tag)) return '';
				if (closing) return `</${tag}>`;

				const attrs: string[] = [];

				for (const attr of ALLOWED_ATTRIBUTES[tag] ?? []) {
					const found = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(rawAttrs);
					const value = found?.[2] ?? found?.[3];
					if (value === undefined) continue;
					if (attr === 'href' && !isSafeUrl(value)) continue;
					attrs.push(`${attr}="${escapeHtml(value)}"`);
				}

				// A link that leaves the dashboard opens away from it, and
				// `noopener` is what stops the page it opens reaching back.
				if (tag === 'a' && attrs.length) attrs.push('target="_blank"', 'rel="noopener noreferrer"');

				return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
			}
		);

/**
 * Turns typed-in prose into paragraphs.
 *
 * Blank lines become paragraphs, single newlines become `<br />`. Dropping a
 * plain-text body straight into an HTML message — which is what this codebase
 * used to do — collapses every newline, so a note with a reference on its own
 * line arrived as one run-on sentence.
 */
export const plainToHtml = (text: string): string =>
	text
		.split(/\n{2,}/)
		.map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br />')}</p>`)
		.join('\n');

/** Safe HTML for either kind of stored value. What `{@html}` gets. */
export const renderRichText = (value: string | null | undefined): string =>
	!value ? '' : isRichText(value) ? sanitizeRichText(value) : plainToHtml(value);

/** The words alone — for a plain-text email part, an excerpt, a length check. */
export const richTextToPlain = (value: string | null | undefined): string =>
	!value
		? ''
		: value
				.replace(ELEMENTS_WITH_CONTENT, '')
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
				.replace(/<[^>]+>/g, '')
				.replace(/&nbsp;/g, ' ')
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/[ \t]+/g, ' ')
				.replace(/\n{3,}/g, '\n\n')
				.split('\n')
				.map((line) => line.trim())
				.join('\n')
				.trim();

/**
 * Whether anything was actually written.
 *
 * An empty editor posts `<p></p>`, which is a non-empty string and satisfies
 * every `min(1)` check ever written. Without this, "Why?" on a declined gift
 * could be answered by clicking into the box and straight back out, and the
 * donor would get a letter with an empty panel where the reason should be.
 */
export const hasRichText = (value: string | null | undefined): boolean =>
	richTextToPlain(value).length > 0;

/** The value as it should be stored: sanitized, or empty if nothing was typed. */
export const normalizeRichText = (value: string | null | undefined): string => {
	if (!hasRichText(value)) return '';
	return isRichText(value) ? sanitizeRichText(value!).trim() : value!.trim();
};
