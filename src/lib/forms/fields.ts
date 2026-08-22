import { z } from 'zod/v4';

/**
 * Zod field helpers shared by server-only CRUD schemas and by schemas a public
 * page also imports.
 *
 * Deliberately *not* in `$lib/server/crud.ts`: `/apply` renders its own
 * schema's constants in the browser, and importing anything under
 * `$lib/server` into a component is a build error — correctly, since that
 * module reaches the database. `$lib/server/crud.ts` re-exports what is here,
 * so the dashboard schemas keep their single import.
 */

/**
 * A number that may be left blank, where blank must stay blank.
 *
 * The ordering of this union is the whole point. `z.coerce.number()` accepts
 * `null` and `''` and turns both into **0**, and a union returns its first
 * success — so putting the number first means "I don't know what this costs"
 * is stored as "it costs nothing", and a time slot with no fixed day becomes
 * Sunday. The empty cases are matched first, and only then is a real value
 * coerced.
 *
 * `optionalIdField` escapes this by accident: `.positive()` rejects the 0 that
 * `null` coerces to, so it falls through. Anything whose valid range includes
 * 0 has no such luck, which is why this helper exists.
 */
export const optionalNumberField = (
	options: { min?: number; max?: number; int?: boolean } = {}
) => {
	let number = z.coerce.number();
	if (options.int) number = number.int();
	if (options.min !== undefined) number = number.min(options.min);
	if (options.max !== undefined) number = number.max(options.max);

	return z
		.union([z.literal(''), z.null(), z.undefined(), number])
		.optional()
		.transform((value) => (typeof value === 'number' ? value : null));
};

/**
 * The longest address SMTP will carry: 64 characters of local part, an `@`,
 * and 255 of domain, capped by RFC 5321 at 254 for the whole thing.
 *
 * `z.email()` checks *shape* and nothing else — the pattern is happy with a
 * local part a megabyte long, so an unbounded email field is an unbounded
 * text field wearing a validator. Every address the app accepts goes through
 * one of the two helpers below.
 */
export const MAX_EMAIL = 254;

export const emailField = (message = 'Enter a valid email address') =>
	z.email(message).max(MAX_EMAIL, 'That email address is too long');

/** The same, for a field an untouched input posts as `''`. */
export const optionalEmailField = (message?: string) =>
	z.union([emailField(message), z.literal('')]).optional();

/**
 * A boolean that survives the several shapes HTML gives one.
 *
 * `z.coerce.boolean()` is wrong here, and wrong in a way that is silent and
 * inverted: an unticked checkbox mirrored into a hidden input, and a `<select>`
 * whose "No" option carries `value="false"`, both post the *string* `"false"` —
 * and `Boolean("false")` is `true`. Every "hide this from the site" becomes
 * "show it", every "do not add me to the newsletter" becomes a subscription,
 * and a required consent box is satisfied by a POST that never ticked it,
 * because coercion turns the string into `true` before `.refine` ever sees it.
 *
 * This parses the string forms explicitly and only then falls back to
 * truthiness. `fallback` is what a genuinely absent value means — `''` and
 * `undefined`, not `"false"`.
 *
 * Lives here rather than in `$lib/server/crud.ts` because the public schemas
 * (`/apply`, `/volunteer`, `/donate`, `/contact`, in-kind) need it too, and
 * importing anything under `$lib/server` into a schema a component also imports
 * is a build error. `$lib/server/crud.ts` re-exports it.
 *
 * Composes with `.refine()` for a consent box that must actually be ticked:
 *
 * ```ts
 * consentToContact: flagField(false).refine((v) => v === true, 'We need your permission')
 * ```
 */
export const flagField = (fallback = true) =>
	z
		.union([z.boolean(), z.string(), z.number(), z.undefined(), z.null()])
		.default(fallback)
		.transform((value) => {
			if (typeof value === 'boolean') return value;
			if (value == null || value === '') return fallback;
			if (typeof value === 'number') return value !== 0;
			return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
		});

/**
 * The tri-state form: yes, no, or *not answered*.
 *
 * For questions where "we did not ask" and "they said no" are different facts
 * and the column is nullable — `has_prior_conviction` is the one that matters,
 * since collapsing an unanswered safeguarding question into a confident `false`
 * is exactly the wrong direction to guess in.
 */
export const optionalFlagField = () =>
	z
		.union([z.boolean(), z.string(), z.number(), z.undefined(), z.null()])
		.default(null)
		.transform((value) => {
			if (typeof value === 'boolean') return value;
			if (value == null || value === '') return null;
			if (typeof value === 'number') return value !== 0;
			return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
		});
