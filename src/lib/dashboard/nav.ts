import {
	BarChart3,
	BookOpen,
	ClipboardList,
	FileText,
	HandHeart,
	HeartHandshake,
	Image as ImageIcon,
	LayoutDashboard,
	LayoutTemplate,
	Languages,
	Landmark,
	ListChecks,
	MapPin,
	MessageSquareQuote,
	Newspaper,
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
 */
export function dashboardSections(counts: Record<string, number> = {}): NavSection[] {
	return [
		{
			section: null,
			items: [
				{ title: 'Overview', url: '/dashboard', icon: LayoutDashboard },
				{
					title: 'Applications',
					url: '/dashboard/applications',
					icon: ClipboardList,
					counter: counts.newApplications,
					permission: 'submissions.read'
				},
				{
					title: 'Volunteers',
					url: '/dashboard/volunteers',
					icon: HandHeart,
					counter: counts.newVolunteers,
					permission: 'volunteers.read'
				},
				{
					title: 'Messages',
					url: '/dashboard/messages',
					icon: ScrollText,
					counter: counts.newMessages,
					permission: 'submissions.read'
				},
				{
					title: 'Impact',
					url: '/dashboard/impact',
					icon: BarChart3
				}
			]
		},
		{
			section: 'People',
			items: [
				{
					title: 'Beneficiaries',
					url: '/dashboard/beneficiaries',
					icon: Users,
					permission: 'beneficiaries.read',
					items: [
						{ title: 'Beneficiaries', url: '/dashboard/beneficiaries' },
						{ title: 'Households', url: '/dashboard/households' }
					]
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
						{ title: 'Recurring pledges', url: '/dashboard/pledges' }
					]
				},
				{
					title: 'Disbursements',
					url: '/dashboard/disbursements',
					icon: Wallet,
					permission: 'disbursements.read'
				},
				{
					title: 'Payment details',
					url: '/dashboard/payment-methods',
					icon: Landmark,
					permission: 'settings.manage',
					items: [
						{ title: 'Methods', url: '/dashboard/payment-methods' },
						{ title: 'Accounts', url: '/dashboard/payment-accounts' },
						{ title: 'Donation links', url: '/dashboard/donation-links' }
					]
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
					title: 'Site settings',
					url: '/dashboard/settings',
					icon: Settings,
					permission: 'settings.manage'
				}
			]
		},
		{
			section: 'Configuration',
			items: [
				{
					title: 'Workflow statuses',
					url: '/dashboard/statuses',
					icon: ListChecks,
					permission: 'settings.manage'
				},
				{
					title: 'Safeguarding checklist',
					url: '/dashboard/safeguarding',
					icon: ListChecks,
					permission: 'volunteers.safeguarding'
				},
				{ title: 'Regions', url: '/dashboard/regions', icon: MapPin, permission: 'settings.manage' }
			]
		},
		{
			section: 'Administration',
			items: [
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
