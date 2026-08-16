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

function observerFor(threshold: number) {
	let observer = observers.get(threshold);
	if (observer) return observer;

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const registered = registry.get(entry.target);
				if (!registered) continue;

				if (entry.isIntersecting) {
					show(entry.target as HTMLElement, registered);
					if (!registered.params.repeat) observer!.unobserve(entry.target);
				} else if (registered.params.repeat) {
					hide(entry.target as HTMLElement, registered);
				}
			}
		},
		{
			threshold,
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
