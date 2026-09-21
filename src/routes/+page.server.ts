import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { newsletterSubscribers } from '$lib/server/db/schema';
import { loadPageData } from '$lib/server/pageData';
import { getImpactMetrics } from '$lib/server/impact';
import { getFeaturedTestimonials, getHeroGallery, getHomepageGallery } from '$lib/server/content';
import type { Actions, PageServerLoad } from './$types';

/**
 * The homepage is the `home` page row — nothing about it is special-cased
 * beyond the slug. Its hero, its pillar grid and its counters are all blocks a
 * staff member can reorder or remove. Two photo sets are the exception —
 * the `hero` and `homepage` collections in `media_items` (the header collage
 * and a gallery section further down) — so a program manager can add or
 * reorder photos in either without touching the page's block list. The
 * featured testimonials come along too, for a `testimonial_slider` block.
 *
 * The impact figures are loaded here as well, whatever blocks the page has.
 * `loadPageData` only fetches them for a page with a counters block, but the
 * hero shows them in its corner regardless — and a staff member removing the
 * counters section from further down the page should not also empty the hero.
 * The read is cached (`impact:public`), so it costs nothing when the block is
 * there too.
 */
export const load: PageServerLoad = async () => {
	const [page, heroGallery, gallery, testimonials, impact] = await Promise.all([
		loadPageData('home'),
		getHeroGallery(),
		getHomepageGallery(),
		getFeaturedTestimonials(),
		getImpactMetrics()
	]);
	return {
		...page,
		metrics: impact.values,
		moneyTotals: impact.money,
		heroGallery,
		gallery,
		testimonials
	};
};

const subscribeSchema = z.object({
	email: z.email().max(180),
	name: z.string().trim().max(150).optional()
});

export const actions: Actions = {
	/**
	 * Newsletter signup. Lives on the root route because the footer renders on
	 * every page and posts here regardless of where the visitor is.
	 */
	subscribe: async ({ request }) => {
		const form = Object.fromEntries(await request.formData());
		const parsed = subscribeSchema.safeParse(form);
		if (!parsed.success) return fail(400, { subscribe: 'invalid' });

		const email = parsed.data.email.toLowerCase();

		const [existing] = await db
			.select({ id: newsletterSubscribers.id, isActive: newsletterSubscribers.isActive })
			.from(newsletterSubscribers)
			.where(eq(newsletterSubscribers.email, email))
			.limit(1);

		if (existing) {
			// Re-subscribing after an unsubscribe is a normal thing to do, and
			// telling the visitor "you are already on the list" leaks who is on it.
			if (!existing.isActive) {
				await db
					.update(newsletterSubscribers)
					.set({ isActive: true, unsubscribedAt: null, subscribedAt: new Date() })
					.where(eq(newsletterSubscribers.id, existing.id));
			}
			return { subscribed: true };
		}

		await db.insert(newsletterSubscribers).values({
			email,
			name: parsed.data.name ?? null,
			source: 'footer',
			subscribedAt: new Date(),
			// A single-use token, so nobody unsubscribes someone else by guessing an id.
			unsubscribeToken: randomUUID(),
			createdAt: new Date()
		});

		return { subscribed: true };
	}
};
