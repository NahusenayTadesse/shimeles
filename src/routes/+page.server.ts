import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { newsletterSubscribers } from '$lib/server/db/schema';
import { loadPageData } from '$lib/server/pageData';
import { getHeroGallery, getHomepageGallery } from '$lib/server/content';
import type { Actions, PageServerLoad } from './$types';

/**
 * The homepage is the `home` page row — nothing about it is special-cased
 * beyond the slug. Its hero, its pillar grid and its counters are all blocks a
 * staff member can reorder or remove. Two photo sets are the exception —
 * `hero_gallery_images` (the header collage) and `homepage_gallery_images`
 * (a gallery section further down) — so a program manager can add or reorder
 * photos in either without touching the page's block list.
 */
export const load: PageServerLoad = async () => {
	const [page, heroGallery, gallery] = await Promise.all([
		loadPageData('home'),
		getHeroGallery(),
		getHomepageGallery()
	]);
	return { ...page, heroGallery, gallery };
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
