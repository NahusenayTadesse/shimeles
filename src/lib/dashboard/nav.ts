import {
	BarChart3,
	BookOpen,
	CircleHelp,
	ClipboardList,
	FileText,
	HandHeart,
	HeartHandshake,
	Image as ImageIcon,
	LayoutDashboard,
	LayoutTemplate,
	Languages,
	Mail,
	ListChecks,
	MapPin,
	MessageSquareQuote,
	Newspaper,
	Package,
	ScrollText,
	Settings,
	Sparkles,
	UserRoundCog,
	Users,
	Wallet
} from '@lucide/svelte';
import type { Permission } from '$lib/permissions';

export type NavEntry = {
	title: string;
	url: string;
	icon?: any;
	counter?: number;
	permission?: Permission;
	items?: { title: string; url: string; permission?: Permission }[];
};

export type NavSection = { section: string | null; items: NavEntry[] };

/**
 * The dashboard's full navigation tree — one definition shared by the
 * sidebar (`app-sidebar.svelte`) and the command palette (`Search.svelte`),
 * so a new route only needs adding here.
 *
 * Organised by *thing*, not by kind of screen: everything about volunteers —
 * the applications, the safeguarding checklist, and the vocabulary the public
 * form is built from — sits under Volunteers, and the same holds for
 * applications, messages, donations and gifts. A coordinator setting up their
 * corner of the site never has to know that "setup" used to live somewhere
 * else. Only config that belongs to no single entity (statuses, regions,
 * users, the audit log) sits apart, under System.
 */
export function dashboardSections(counts: Record<string, number> = {}): NavSection[] {
	return [
		{
			section: null,
			items: [
				{ title: 'Overview', url: '/dashboard', icon: LayoutDashboard },
				{ title: 'Impact', url: '/dashboard/impact', icon: BarChart3 }
			]
		},
		{
			section: 'Case work',
			items: [
				{
					title: 'Applications',
					url: '/dashboard/applications',
					icon: ClipboardList,
					counter: counts.newApplications,
					permission: 'submissions.read',
					items: [
						{ title: 'All applications', url: '/dashboard/applications' },
						{
							title: 'Kinds of help',
							url: '/dashboard/assistance-needs',
							permission: 'settings.manage'
						},
						{
							title: 'Need groups',
							url: '/dashboard/assistance-needs/categories',
							permission: 'settings.manage'
						},
						{ title: 'Languages', url: '/dashboard/languages', permission: 'settings.manage' }
					]
				},
				{
					title: 'Volunteers',
					url: '/dashboard/volunteers',
					icon: HandHeart,
					counter: counts.newVolunteers,
					permission: 'volunteers.read',
					items: [
						{ title: 'All volunteers', url: '/dashboard/volunteers' },
						{
							title: 'Safeguarding checklist',
							url: '/dashboard/safeguarding',
							permission: 'volunteers.safeguarding'
						},
						{
							title: 'Skills',
							url: '/dashboard/volunteer-skills',
							permission: 'volunteers.write'
						},
						{
							title: 'Skill groups',
							url: '/dashboard/volunteer-skills/categories',
							permission: 'volunteers.write'
						},
						{
							title: 'Time slots',
							url: '/dashboard/volunteer-availability',
							permission: 'volunteers.write'
						},
						{
							title: 'Professions',
							url: '/dashboard/volunteer-professions',
							permission: 'volunteers.write'
						}
					]
				},
				{
					title: 'Beneficiaries',
					url: '/dashboard/beneficiaries',
					icon: Users,
					permission: 'beneficiaries.read',
					items: [
						{ title: 'Beneficiaries', url: '/dashboard/beneficiaries' },
						{ title: 'Households', url: '/dashboard/households' }
					]
				},
				{
					title: 'Messages',
					url: '/dashboard/messages',
					icon: ScrollText,
					counter: counts.newMessages,
					permission: 'submissions.read',
					items: [
						{ title: 'All messages', url: '/dashboard/messages' },
						{
							title: 'Enquiry topics',
							url: '/dashboard/contact-subjects',
							permission: 'settings.manage'
						},
						{
							title: 'Offices',
							url: '/dashboard/contact-offices',
							permission: 'settings.manage'
						}
					]
				},
				{
					title: 'Newsletter',
					url: '/dashboard/newsletter',
					icon: Mail,
					permission: 'submissions.read'
				}
			]
		},
		{
			section: 'Money',
			items: [
				{
					title: 'Donations',
					url: '/dashboard/donations',
					icon: HeartHandshake,
					counter: counts.pendingDonations,
					permission: 'donations.read',
					items: [
						{ title: 'Reconciliation', url: '/dashboard/donations' },
						{ title: 'Donors', url: '/dashboard/donors' },
						{ title: 'Recurring pledges', url: '/dashboard/pledges' },
						{
							title: 'Payment methods',
							url: '/dashboard/payment-methods',
							permission: 'settings.manage'
						},
						{
							title: 'Payment accounts',
							url: '/dashboard/payment-accounts',
							permission: 'settings.manage'
						},
						{
							title: 'Donation links',
							url: '/dashboard/donation-links',
							permission: 'settings.manage'
						}
					]
				},
				{
					title: 'Gifts in kind',
					url: '/dashboard/in-kind',
					icon: Package,
					counter: counts.newInKind,
					permission: 'inkind.read',
					items: [
						{ title: 'Offers of goods', url: '/dashboard/in-kind' },
						{
							title: 'Gift categories',
							url: '/dashboard/gift-categories',
							permission: 'settings.manage'
						}
					]
				},
				{
					title: 'Disbursements',
					url: '/dashboard/disbursements',
					icon: Wallet,
					permission: 'disbursements.read'
				}
			]
		},
		{
			section: 'Website',
			items: [
				{
					title: 'Homepage',
					url: '/dashboard/homepage',
					icon: ImageIcon,
					permission: 'content.manage'
				},
				{
					title: 'About page',
					url: '/dashboard/about',
					icon: BookOpen,
					permission: 'content.manage'
				},
				{
					title: 'Pages & content',
					url: '/dashboard/pages',
					icon: LayoutTemplate,
					permission: 'content.manage',
					items: [
						{ title: 'Pages', url: '/dashboard/pages' },
						{ title: 'Navigation', url: '/dashboard/navigation' }
					]
				},
				{
					title: 'Testimonials',
					url: '/dashboard/testimonials',
					icon: MessageSquareQuote,
					permission: 'content.manage'
				},
				{
					title: 'Blog',
					url: '/dashboard/blog',
					icon: Newspaper,
					permission: 'content.manage',
					items: [
						{ title: 'Posts', url: '/dashboard/blog' },
						{ title: 'Categories', url: '/dashboard/blog-categories' }
					]
				},
				{
					title: 'Programmes',
					url: '/dashboard/pillars',
					icon: Sparkles,
					permission: 'pillars.manage',
					items: [
						{ title: 'Pillars', url: '/dashboard/pillars' },
						{ title: 'Future initiatives', url: '/dashboard/initiatives' }
					]
				},
				{
					title: 'Form builder',
					url: '/dashboard/forms',
					icon: FileText,
					permission: 'forms.manage'
				},
				{
					title: 'Translations',
					url: '/dashboard/translations',
					icon: Languages,
					permission: 'content.manage'
				},
				{
					title: 'Help panel',
					url: '/dashboard/help-topics',
					icon: CircleHelp,
					permission: 'content.manage'
				}
			]
		},
		{
			section: 'System',
			items: [
				{
					title: 'Site settings',
					url: '/dashboard/settings',
					icon: Settings,
					permission: 'settings.manage'
				},
				{
					// Shared by applications, volunteers, donations and messages
					// alike, so it belongs to none of them.
					title: 'Workflow statuses',
					url: '/dashboard/statuses',
					icon: ListChecks,
					permission: 'settings.manage'
				},
				{
					title: 'Regions',
					url: '/dashboard/regions',
					icon: MapPin,
					permission: 'settings.manage'
				},
				{
					title: 'Users & roles',
					url: '/dashboard/users',
					icon: UserRoundCog,
					permission: 'users.manage',
					items: [
						{ title: 'Users', url: '/dashboard/users' },
						{ title: 'Roles', url: '/dashboard/roles' }
					]
				},
				{
					title: 'Audit log',
					url: '/dashboard/audit',
					icon: ScrollText,
					permission: 'audit.read'
				}
			]
		}
	];
}

/* ==========================================================================
   Reading the tree
   ========================================================================== */

/**
 * A link owns a path when it is that path or a page beneath it — compared
 * segment by segment, so `/dashboard/donations` never claims
 * `/dashboard/donation-links`. Overview is exact: everything is beneath it.
 */
export function ownsPath(url: string, pathname: string): boolean {
	if (url === '/dashboard') return pathname === '/dashboard';
	return pathname === url || pathname.startsWith(url + '/');
}

/**
 * A group's children no longer live under its own URL — Volunteers holds the
 * skills and the safeguarding checklist too — so a group owns the page when
 * it, or any child it shows, does.
 */
export function groupOwnsPath(
	item: { url: string; items?: { url: string }[] },
	pathname: string
): boolean {
	return (
		ownsPath(item.url, pathname) || (item.items ?? []).some((sub) => ownsPath(sub.url, pathname))
	);
}

/**
 * The most specific child of a group, or null. On
 * `/dashboard/volunteer-skills/categories` that is "Skill groups", not
 * "Skills"; on a volunteer's own record it is "All volunteers".
 */
export function activeChild(items: { url: string }[] = [], pathname: string): string | null {
	return items
		.filter((sub) => ownsPath(sub.url, pathname))
		.reduce<string | null>(
			(best, sub) => (best && best.length >= sub.url.length ? best : sub.url),
			null
		);
}

/**
 * The tree with everything the user may not open removed, and any group left
 * empty by that dropped whole.
 *
 * This is presentation only: the routes themselves each call
 * `requirePermission`, which is the actual control. Hiding a link a user would
 * get a 403 from is a courtesy, not a lock.
 */
export function visibleSections(
	counts: Record<string, number> = {},
	permissions: Permission[] = []
): NavSection[] {
	const granted = new Set(permissions);
	const has = (permission?: Permission) => !permission || granted.has(permission);

	return dashboardSections(counts)
		.map((section) => ({
			...section,
			items: section.items
				.filter((item) => has(item.permission))
				.map((item) => ({ ...item, items: item.items?.filter((sub) => has(sub.permission)) }))
		}))
		.filter((section) => section.items.length > 0);
}

/**
 * The entity the current page belongs to, if it belongs to one with siblings
 * worth showing. A group of a single visible child is no navigation at all, so
 * it returns null rather than a bar with one tab on it.
 */
export function currentEntity(sections: NavSection[], pathname: string): NavEntry | null {
	for (const section of sections) {
		for (const item of section.items) {
			if ((item.items?.length ?? 0) > 1 && groupOwnsPath(item, pathname)) return item;
		}
	}
	return null;
}
