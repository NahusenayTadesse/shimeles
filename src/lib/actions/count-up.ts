import type { Action } from 'svelte/action';

export type CountUpParams = {
	/** The number to land on. */
	value: number;
	/** Turns the tweened number into displayed text — money, compact notation, etc. */
	format?: (value: number) => string;
	duration?: number;
};

const reduceMotion = () =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts a number up from zero the first time it scrolls into view — the
 * "earned, not printed" feeling a static figure doesn't give. Falls back to
 * writing the final value straight away under reduced motion.
 */
export const countUp: Action<HTMLElement, CountUpParams> = (node, params) => {
	let current = params;
	let raf = 0;

	const write = (value: number) => {
		node.textContent = (current.format ?? ((n) => String(Math.round(n))))(value);
	};

	function run() {
		if (reduceMotion() || current.value === 0) {
			write(current.value);
			return;
		}
		write(0);
		const duration = current.duration ?? 1400;
		const start = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - Math.pow(1 - t, 3);
			write(current.value * eased);
			if (t < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					run();
					observer.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0.4 }
	);
	observer.observe(node);

	return {
		update(next) {
			current = next;
		},
		destroy() {
			observer.disconnect();
			cancelAnimationFrame(raf);
		}
	};
};
