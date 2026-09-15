import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { clientAddress } from './clientAddress';

/**
 * Who the request came from.
 *
 * This decides both what `audit_log.ip_address` records and what the rate
 * limiter counts against, and in production it is the difference between one
 * bucket per visitor and one bucket for the internet.
 */

function eventWith(socket: string | null, forwarded?: string) {
	const headers = new Headers();
	if (forwarded) headers.set('x-forwarded-for', forwarded);

	return {
		request: new Request('https://example.org/apply', { headers }),
		getClientAddress: () => {
			if (socket === null) throw new Error('no address');
			return socket;
		}
	} as unknown as RequestEvent;
}

describe('clientAddress', () => {
	it('uses the socket address when it is a real one', () => {
		// ADDRESS_HEADER set, or nothing proxying: trust what the adapter says
		// and never look at a header the caller could have written.
		expect(clientAddress(eventWith('203.0.113.7', '198.51.100.1'))).toBe('203.0.113.7');
	});

	it('recovers the visitor when the socket is the proxy hop', () => {
		expect(clientAddress(eventWith('127.0.0.1', '203.0.113.7'))).toBe('203.0.113.7');
	});

	it('takes the rightmost forwarded entry, the one our own proxy appended', () => {
		// The left-hand values may have been sent by the caller. Only the last
		// hop was added by something we trust.
		expect(clientAddress(eventWith('127.0.0.1', '1.1.1.1, 2.2.2.2, 203.0.113.7'))).toBe(
			'203.0.113.7'
		);
	});

	it('treats IPv6 and IPv4-mapped loopback as the proxy hop too', () => {
		expect(clientAddress(eventWith('::1', '203.0.113.7'))).toBe('203.0.113.7');
		expect(clientAddress(eventWith('::ffff:127.0.0.1', '203.0.113.7'))).toBe('203.0.113.7');
	});

	it('keeps loopback when nothing was forwarded', () => {
		// Development, where 127.0.0.1 is the honest answer.
		expect(clientAddress(eventWith('127.0.0.1'))).toBe('127.0.0.1');
	});

	it('returns null rather than throwing when there is no address at all', () => {
		// Prerender, and any synthetic event a scheduled job constructs.
		expect(clientAddress(eventWith(null))).toBeNull();
	});

	it('falls back to the forwarded header when the adapter has no address', () => {
		expect(clientAddress(eventWith(null, '203.0.113.7'))).toBe('203.0.113.7');
	});
});
