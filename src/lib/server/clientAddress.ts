import type { RequestEvent } from '@sveltejs/kit';

/**
 * The address the request actually came from.
 *
 * `event.getClientAddress()` is adapter-node's socket address, which in
 * production is the OpenLiteSpeed hop on `127.0.0.1` rather than the visitor —
 * so every `audit_log.ip_address` row was recording the proxy, and anything
 * keyed on the client address would put the entire internet in one bucket.
 *
 * The supported fix is `ADDRESS_HEADER=x-forwarded-for` (with `XFF_DEPTH`) in
 * the server's environment, and it should be set. This helper is the belt to
 * that pair of braces: with `ADDRESS_HEADER` set, `getClientAddress()` already
 * returns the visitor and the forwarded branch never runs; without it, the
 * address is recovered here rather than silently collapsing to loopback.
 *
 * **Why the rightmost entry.** `X-Forwarded-For` reads left to right as
 * `client, proxy1, proxy2`, and any of the left-hand values may have been sent
 * by the client itself — a header a caller controls cannot be an access
 * control. The rightmost entry is the one appended by the proxy immediately in
 * front of this process, which is the only hop here that is trusted, and it is
 * what `XFF_DEPTH=1` selects. Put a second proxy or a CDN in front and this
 * becomes wrong in the safe direction: it names that CDN, not a spoofed value.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function clientAddress(event: RequestEvent): string | null {
	const direct = socketAddress(event);

	// Anything but loopback means the address is already the visitor's, either
	// because ADDRESS_HEADER is set or because nothing is proxying us.
	if (direct && !LOOPBACK.has(direct)) return direct;

	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		const hops = forwarded
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		const nearest = hops.at(-1);
		if (nearest) return nearest;
	}

	return direct;
}

function socketAddress(event: RequestEvent): string | null {
	try {
		return event.getClientAddress();
	} catch {
		// Throws when no adapter address is available — during prerender, and in
		// any synthetic event a test or a scheduled job constructs.
		return null;
	}
}
