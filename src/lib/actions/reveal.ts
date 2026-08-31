import type { Action } from 'svelte/action';

export type RevealParams = {
	/** Delay before the element animates in, in ms. */
	delay?: number;
	/** Vertical offset it travels from, in px. Negative comes down from above. */
	y?: number;
	/** Horizontal offset it travels from, in px. */
	x?: number;
	/** Starting scale — 0.96 reads as a gentle push-in. */
	scale?: number;
	/** Starting blur in px. A touch of blur makes the settle feel expensive. */
	blur?: number;
	/** Transition duration in ms. */
	duration?: number;
	/** Re-hide and replay when the element leaves the viewport. Off by default. */
	repeat?: boolean;
	/** Fraction of the element that must be visible before it fires. */
	threshold?: number;
};

const DEFAULTS = {
	delay: 0,
	y: 24,
	x: 0,
	scale: 1,
	blur: 0,
	duration: 900,
	repeat: false,
	threshold: 0.12
} satisfies Required<RevealParams>;

const reduceMotion = () =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Entry = { params: Required<RevealParams>; timer?: ReturnType<typeof setTimeout> };

const registry = new WeakMap<Element, Entry>();
/** One observer per threshold — elements sharing a threshold share the callback. */
const observers = new Map<number, IntersectionObserver>();

/**
 * Whether this entry counts as "on screen enough to reveal".
 *
 * `intersectionRatio` is the visible portion over the element's *whole* area,
 * so an element taller than the viewport has a ceiling on it: a 7,800px
 * section in an 830px root can never exceed 0.107, and against the default
 * 0.12 it would stay hidden however far you scrolled. The Terms page hit this
 * exactly — both language blocks are single sections several screens tall, and
 * the page rendered blank on any window shorter than about 1,010px.
 *
 * So the threshold is treated as an intent rather than a literal ratio: where
 * the element is short enough to satisfy it, it must; where it is not, any
 * intersection reveals. The `-8%` bottom margin still holds the animation a
 * little inside the fold either way, which is what the threshold was buying.
 *
 * Measuring off `entry` rather than the node means this re-decides itself on
 * resize and after fonts settle, with no stored heights to go stale.
 */
function isRevealed(entry: IntersectionObserverEntry, threshold: number) {
	if (!entry.isIntersecting) return false;

	const rootHeight = entry.rootBounds?.height ?? window.innerHeight;
	const elementHeight = entry.boundingClientRect.height;
	const reachable = elementHeight === 0 || rootHeight / elementHeight >= threshold;

	return reachable ? entry.intersectionRatio >= threshold : true;
}

function observerFor(threshold: number) {
	let observer = observers.get(threshold);
	if (observer) return observer;

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const registered = registry.get(entry.target);
				if (!registered) continue;

				if (isRevealed(entry, registered.params.threshold)) {
					show(entry.target as HTMLElement, registered);
					if (!registered.params.repeat) observer!.unobserve(entry.target);
				} else if (registered.params.repeat) {
					hide(entry.target as HTMLElement, registered);
				}
			}
		},
		{
			// Two thresholds, not one. `threshold` is the intent — reveal once this
			// much of the element is on screen — but an element taller than the
			// viewport can never reach a fractional ratio (see `isRevealed`), so we
			// also watch the 0 crossing and let the callback decide which applies.
			threshold: threshold > 0 ? [0, threshold] : [0],
			// Hold the reveal until the element is a little way inside the fold, so it
			// animates where the eye already is rather than at the very edge.
			rootMargin: '0px 0px -8% 0px'
		}
	);

	observers.set(threshold, observer);
	return observer;
}

function show(node: HTMLElement, entry: Entry) {
	clearTimeout(entry.timer);
	node.dataset.reveal = 'in';
	// will-change earns its keep only while the transition runs.
	entry.timer = setTimeout(
		() => (node.style.willChange = ''),
		entry.params.delay + entry.params.duration + 60
	);
}

function hide(node: HTMLElement, entry: Entry) {
	clearTimeout(entry.timer);
	node.style.willChange = 'opacity, transform';
	node.dataset.reveal = 'out';
}

function applyVars(node: HTMLElement, params: Required<RevealParams>) {
	const style = node.style;
	style.setProperty('--reveal-y', `${params.y}px`);
	style.setProperty('--reveal-x', `${params.x}px`);
	style.setProperty('--reveal-scale', `${params.scale}`);
	style.setProperty('--reveal-blur', `${params.blur}px`);
	style.setProperty('--reveal-duration', `${params.duration}ms`);
	style.setProperty('--reveal-delay', `${params.delay}ms`);
}

/**
 * Fades and lifts an element into place the first time it scrolls into view.
 *
 * ```svelte
 * <h2 use:reveal>…</h2>
 * <Card use:reveal={{ delay: stagger(i) }} />
 * ```
 *
 * Elements start hidden via CSS (`[data-reveal]`), so the action only ever has
 * to flip them on. Honours `prefers-reduced-motion` by revealing immediately.
 */
export const reveal: Action<HTMLElement, RevealParams | undefined> = (node, params) => {
	const entry: Entry = { params: { ...DEFAULTS, ...params } };
	registry.set(node, entry);

	if (reduceMotion()) {
		node.dataset.reveal = 'in';
		return {
			destroy() {
				registry.delete(node);
			}
		};
	}

	applyVars(node, entry.params);
	node.style.willChange = 'opacity, transform';
	node.dataset.reveal = 'out';

	let observer = observerFor(entry.params.threshold);
	observer.observe(node);

	return {
		update(next) {
			const threshold = entry.params.threshold;
			entry.params = { ...DEFAULTS, ...next };
			applyVars(node, entry.params);

			if (entry.params.threshold !== threshold) {
				observer.unobserve(node);
				observer = observerFor(entry.params.threshold);
				observer.observe(node);
			}
		},
		destroy() {
			clearTimeout(entry.timer);
			observer.unobserve(node);
			registry.delete(node);
		}
	};
};

/** Evenly spaced delays for a list, capped so long grids never crawl. */
export function stagger(index: number, step = 90, max = 6) {
	return Math.min(index, max) * step;
}
