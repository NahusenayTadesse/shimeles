/**
 * YouTube links, parsed rather than pasted.
 *
 * Staff paste the URL from the browser bar — the thing you get from "Share",
 * or just by copying the address. They are never asked for the `<iframe>`
 * snippet YouTube offers, for the same reason they are never asked for
 * PayPal's button HTML (see `$lib/donations`): pasting markup into a database
 * field is how a stray `<script>` gets onto a page, and an embed pasted in
 * 2026 keeps whatever attributes YouTube happened to suggest that year.
 *
 * So the URL is what is stored, and the player is ours — our aspect ratio, our
 * rounded corners, our privacy setting, changeable in one place for every
 * video on the site.
 */

/** A video id is eleven characters of URL-safe base64. */
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Hosts we accept a video from.
 *
 * A whitelist rather than a "contains youtube" check: `youtube.com.evil.test`
 * contains it too, and the id lifted out of that URL would be embedded from a
 * host nobody vetted.
 */
const HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com',
	'youtu.be',
	'www.youtu.be'
]);

/** Path prefixes that carry the id as the next segment. */
const PATH_PREFIXES = ['embed', 'shorts', 'live', 'v'];

export interface YouTubeVideo {
	id: string;
	/** Seconds to start at, from a `t=`/`start=` parameter. 0 when absent. */
	start: number;
}

/**
 * Lifts the video id out of any of the shapes a YouTube link comes in.
 *
 * Returns `null` when the link carries none, which is how the dashboard tells
 * a staff member they have pasted the wrong thing *before* it reaches a reader
 * — and how the public page decides to render nothing rather than a broken
 * player.
 */
export function parseYouTubeUrl(input: string | null | undefined): YouTubeVideo | null {
	const raw = input?.trim();
	if (!raw) return null;

	let url: URL;
	try {
		// A URL copied without its scheme is still a link a person meant to paste.
		url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
	} catch {
		return null;
	}

	if (!HOSTS.has(url.hostname.toLowerCase())) return null;

	const segments = url.pathname.split('/').filter(Boolean);
	const candidate =
		// youtu.be/ID
		url.hostname.toLowerCase().endsWith('youtu.be')
			? segments[0]
			: // youtube.com/watch?v=ID
				url.pathname === '/watch'
				? (url.searchParams.get('v') ?? '')
				: // youtube.com/embed/ID, /shorts/ID, /live/ID, /v/ID
					PATH_PREFIXES.includes(segments[0] ?? '')
					? segments[1]
					: '';

	if (!candidate || !ID_PATTERN.test(candidate)) return null;

	return { id: candidate, start: parseStart(url) };
}

/**
 * Reads the start time off the link.
 *
 * "Share at current time" adds `t=90` or `t=1m30s`, and someone who pasted
 * that link meant the moment, not the beginning.
 */
function parseStart(url: URL): number {
	const raw = (url.searchParams.get('t') ?? url.searchParams.get('start') ?? '').trim();
	if (!raw) return 0;

	if (/^\d+$/.test(raw)) return clampStart(Number(raw));

	const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
	if (!match) return 0;

	const [, h, m, s] = match;
	return clampStart(Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0));
}

/** A day of seconds is well past any sane video; anything beyond is a typo. */
const clampStart = (seconds: number) =>
	Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.floor(seconds), 86_400) : 0;

/**
 * The player URL for an embed.
 *
 * `youtube-nocookie.com` is YouTube's own privacy-enhanced host: it does not
 * write tracking cookies until someone actually presses play. This site
 * publishes about medical hardship and mental health, and a reader should be
 * able to look at a page here without that being logged against them before
 * they have touched anything.
 */
export function youtubeEmbedUrl(video: YouTubeVideo, autoplay = false): string {
	const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
	if (video.start) params.set('start', String(video.start));
	// Only ever set when a reader has just pressed play, so this cannot start a
	// video at somebody unasked — it continues the gesture they already made.
	if (autoplay) params.set('autoplay', '1');
	return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
}

/** The canonical watch link, for a "watch on YouTube" fallback. */
export const youtubeWatchUrl = (video: YouTubeVideo): string =>
	`https://www.youtube.com/watch?v=${video.id}${video.start ? `&t=${video.start}` : ''}`;

/** Whether a pasted link can actually drive a player. Used by the save check. */
export const isUsableYouTubeUrl = (url: string | null | undefined): boolean =>
	parseYouTubeUrl(url) !== null;
