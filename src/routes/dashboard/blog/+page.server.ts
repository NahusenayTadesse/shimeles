import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { contentCrud, idSchema } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { blogCategories, blogPosts, user } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { auditList } from '$lib/server/audit';
import {
	count,
	countOf,
	dateRangeFilter,
	idFilter,
	listPage,
	parseDateRange,
	searchFilter,
	withOrder,
	type SortMap
} from '$lib/server/query';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: blogPosts,
	label: 'Post',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'blog_post',
	fileFields: ['coverImage'],
	invalidates: ['blog']
});

/** The columns the table headers may sort by. `?sort=` reaches an ORDER BY. */
const sortMap: SortMap = {
	title: blogPosts.title,
	publishedAt: blogPosts.publishedAt,
	isPublished: blogPosts.isPublished,
	createdAt: blogPosts.createdAt
};

/**
 * Deliberately not `contentCrud.load`.
 *
 * The generic loader selects every live row and lets the browser filter them,
 * which is the right trade for a table of four regions and the wrong one for a
 * blog: a Foundation posting weekly has a few hundred rows within a few years,
 * and each carries a full rich-text article in `body`. This screen never needs
 * `body` at all, and never needs more than a page of rows.
 *
 * Four filters, all of them a click: a search box, the category, a publish-date
 * range and who created the post. Each is a plain URL parameter, so a filtered
 * list is a link a staff member can send to a colleague.
 *
 * The write actions are still the generic ones; only the read changes.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const params = event.url.searchParams;
	const search = params.get('q')?.trim() ?? '';
	const category = params.get('category') ?? '';
	const createdBy = params.get('createdBy') ?? '';
	const range = parseDateRange(params);

	const result = await listPage({
		url: event.url,
		sortMap,
		defaultSort: { field: 'publishedAt', direction: 'desc' },
		where: [
			isNull(blogPosts.deletedAt),
			// One box, four columns — a staff member remembering half a headline,
			// the byline or the slug finds it without choosing which they mean.
			searchFilter(search, [
				blogPosts.title,
				blogPosts.excerpt,
				blogPosts.slug,
				blogPosts.authorName
			]),
			idFilter(blogPosts.categoryId, category),
			dateRangeFilter(blogPosts.publishedAt, range),
			createdBy ? eq(blogPosts.createdBy, createdBy) : undefined
		],
		count: (where) => countOf(db.select({ value: count() }).from(blogPosts).where(where)),
		rows: ({ where, orderBy, limit, offset }) =>
			withOrder(
				db
					// `body` is excluded on purpose: it is the largest column in the
					// table and nothing on this screen renders it.
					.select({
						id: blogPosts.id,
						title: blogPosts.title,
						slug: blogPosts.slug,
						excerpt: blogPosts.excerpt,
						coverImage: blogPosts.coverImage,
						categoryId: blogPosts.categoryId,
						categoryName: blogCategories.name,
						authorName: blogPosts.authorName,
						metaDescription: blogPosts.metaDescription,
						readMinutes: blogPosts.readMinutes,
						isFeatured: blogPosts.isFeatured,
						isPublished: blogPosts.isPublished,
						publishedAt: blogPosts.publishedAt,
						sortOrder: blogPosts.sortOrder
					})
					.from(blogPosts)
					.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
					.where(where)
					.$dynamic(),
				orderBy
			)
				.limit(limit)
				.offset(offset)
	});

	const [addForm, editForm, deleteForm, categories, creators] = await Promise.all([
		superValidate(zod4(addSchema)),
		superValidate(zod4(editSchema)),
		superValidate(zod4(idSchema)),
		db
			.select({ id: blogCategories.id, name: blogCategories.name })
			.from(blogCategories)
			.where(isNull(blogCategories.deletedAt))
			.orderBy(asc(blogCategories.sortOrder), asc(blogCategories.id)),
		// Only staff who have actually written something. A select of every
		// account would mostly be people with nothing to filter to.
		db
			.selectDistinct({ id: user.id, name: user.name })
			.from(blogPosts)
			.innerJoin(user, eq(user.id, blogPosts.createdBy))
			.where(and(isNull(blogPosts.deletedAt), isNotNull(blogPosts.createdBy)))
			.orderBy(asc(user.name))
	]);

	// One row per screen load naming the filters used, the same way the case
	// list does it — who looked and what they looked for, not one row per post.
	auditList(event, 'blog_post', {
		search,
		category,
		createdBy,
		from: range.from,
		to: range.to,
		page: result.page,
		results: result.total
	});

	return {
		addForm,
		editForm,
		deleteForm,
		categories,
		creators,
		// `publishedAt` is epoch milliseconds; the edit dialog's date picker and
		// the table column both want `YYYY-MM-DD`.
		rows: result.rows.map((row) => ({
			...row,
			publishedAt: row.publishedAt ? isoDate(row.publishedAt) : ''
		})),
		total: result.total,
		page: result.page,
		perPage: result.perPage,
		pageCount: result.pageCount,
		sort: result.sort,
		filters: { search, category, createdBy, from: range.from, to: range.to }
	};
};

const isoDate = (date: Date) => {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const actions: Actions = crud.actions;
