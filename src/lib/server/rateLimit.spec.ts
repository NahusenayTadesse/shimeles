import { beforeEach, describe, expect, it } from 'vitest';
import {
	AUTH_POLICY,
	PUBLIC_FORM_POLICY,
	consume,
	policyFor,
	resetRateLimits,
	type Policy
} from './rateLimit';

/**
 * The throttle in front of the public routes.
 *
 * Both halves are pure and both are load-bearing in opposite directions: the
 * counter has to hold a limit against somebody pushing at it, and `policyFor`
 * has to keep its hands off the routes staff use all day. A mistake in the
 * first is an open door; a mistake in the second locks the Foundation out of
 * its own dashboard.
 */

const TEST_POLICY: Policy = { id: 'test', limit: 3, windowMs: 10_000 };

beforeEach(() => resetRateLimits());

describe('consume', () => {
	it('allows exactly the limit, then refuses', () => {
		const now = 1_000_000;
		const outcomes = [1, 2, 3, 4].map(() => consume('1.2.3.4', TEST_POLICY, now).allowed);

		expect(outcomes).toEqual([true, true, true, false]);
	});

	it('reports the seconds left in the window, rounded up and never zero', () => {
		const now = 1_000_000;
		for (let i = 0; i < TEST_POLICY.limit; i++) consume('1.2.3.4', TEST_POLICY, now);

		// 9.5s left of a 10s window: a `Retry-After: 9` would invite a retry that
		// is still refused, so it rounds up.
		expect(consume('1.2.3.4', TEST_POLICY, now + 500).retryAfter).toBe(10);

		// A request landing in the last fraction of a second still has to wait.
		expect(consume('1.2.3.4', TEST_POLICY, now + 9_900).retryAfter).toBe(1);
	});

	it('starts a fresh window once the old one has passed', () => {
		const now = 1_000_000;
		for (let i = 0; i < 4; i++) consume('1.2.3.4', TEST_POLICY, now);

		expect(consume('1.2.3.4', TEST_POLICY, now + 10_001).allowed).toBe(true);
	});

	it('does not extend the window when a blocked caller keeps pushing', () => {
		// The point of a fixed window: hammering it holds you out for the rest of
		// the window, but never for longer than the window itself.
		const now = 1_000_000;
		for (let i = 0; i < 50; i++) consume('1.2.3.4', TEST_POLICY, now + i);

		expect(consume('1.2.3.4', TEST_POLICY, now + 10_001).allowed).toBe(true);
	});

	it('counts each address separately', () => {
		const now = 1_000_000;
		for (let i = 0; i < 4; i++) consume('1.2.3.4', TEST_POLICY, now);

		expect(consume('5.6.7.8', TEST_POLICY, now).allowed).toBe(true);
	});

	it('counts each policy separately for the same address', () => {
		// Somebody who has used up their form submissions has not thereby used up
		// their sign-in attempts.
		const now = 1_000_000;
		for (let i = 0; i < PUBLIC_FORM_POLICY.limit + 1; i++) {
			consume('1.2.3.4', PUBLIC_FORM_POLICY, now);
		}

		expect(consume('1.2.3.4', AUTH_POLICY, now).allowed).toBe(true);
	});

	it('flags only the first request over the limit', () => {
		// One audit row per offender per window. Without this a flood writes a
		// row per request, and the log that is supposed to show the attack is
		// the thing that falls over during it.
		const now = 1_000_000;
		const breaches = Array.from({ length: 8 }, () => consume('1.2.3.4', TEST_POLICY, now)).filter(
			(decision) => decision.firstBreach
		);

		expect(breaches).toHaveLength(1);
	});
});

describe('policyFor', () => {
	it('leaves safe methods alone', () => {
		expect(policyFor('/apply', 'GET')).toBeNull();
		expect(policyFor('/login', 'HEAD')).toBeNull();
	});

	it('exempts the dashboard, which is session-gated and used in bursts', () => {
		expect(policyFor('/dashboard/volunteers', 'POST')).toBeNull();
		expect(policyFor('/dashboard/applications/12', 'POST')).toBeNull();
	});

	it("exempts Better Auth's own endpoints, which it throttles itself", () => {
		expect(policyFor('/api/auth/sign-in/email', 'POST')).toBeNull();
	});

	it('puts sign-in and account recovery on the auth policy', () => {
		for (const path of ['/login', '/forgot-password', '/magic-link', '/reset-password', '/setup']) {
			expect(policyFor(path, 'POST')).toBe(AUTH_POLICY);
		}
	});

	it('reads a trailing slash as the same route', () => {
		expect(policyFor('/login/', 'POST')).toBe(AUTH_POLICY);
	});

	it('covers every other public post, including pages that do not exist yet', () => {
		// A form embedded in a page a staff member adds next year arrives as a
		// POST to an arbitrary slug, so the default has to be to limit rather
		// than to allow.
		for (const path of ['/apply', '/volunteer', '/contact', '/donate', '/', '/some-new-page']) {
			expect(policyFor(path, 'POST')).toBe(PUBLIC_FORM_POLICY);
		}
	});
});
