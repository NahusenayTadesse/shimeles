import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from './schema';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE } from '../../permissions';
import { PRIVACY_POLICY_BODY, TERMS_AND_CONDITIONS_BODY } from './legal-content';

/**
 * Seeds every configuration table the system needs to render.
 *
 * Run with `bun run db:seed`. Idempotent: each insert is an upsert keyed on the
 * row's natural key, so re-running after adding a pillar or a setting adds the
 * new rows without duplicating or overwriting anything staff have since edited.
 * That last part matters — a seed that clobbers edited copy is a seed nobody
 * dares run twice.
 *
 * This script connects to SQLite directly rather than through
 * `$lib/server/db`, because that module reads `$env/dynamic/private`, which
 * only exists inside a running SvelteKit server.
 *
 * **Staff accounts are not seeded here.** The first `super_admin` is created
 * through `/setup`, which goes via Better Auth so the password is hashed the
 * same way a real signup would be. A seeded password hash is a seeded
 * vulnerability.
 *
 * Copy note: the technical spec names `SAF-Website-v1-Scope-and-Features.md` as
 * the source of truth for tone and body copy. That file is not in this repo, so
 * the prose below is written from §1 of the technical spec and is explicitly
 * placeholder — it is meant to be replaced through the dashboard, which is the
 * whole point of the content model. Nothing here is load-bearing.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = new Database(url);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');
const db = drizzle(client, { schema });

const now = () => new Date();

/**
 * The family's tribute copy — the full version lives on `/about` (in
 * `about_content`, see `seedAboutPage`), the short excerpt on Home (in
 * `seedPages`, as a `memoriam` content block).
 */
const ABOUT_MEMORIAM_BODY =
	'<p>With deep respect and heartfelt remembrance, we honor the life of our beloved Shimeles Abera, a man whose legacy is defined by integrity, humility, and an unwavering commitment to others.</p>' +
	'<p>Shimeles lived a life guided by strong moral principles and genuine compassion. He was known for his calm strength, respectful nature, and the sincerity with which he treated every individual. His presence brought comfort, his words carried wisdom, and his actions reflected a life devoted to service and humanity.</p>' +
	'<p>While his passing brought profound sorrow, his life remains a lasting source of inspiration. The values he embodied, kindness, integrity, and service, continue to live on in the many lives he touched.</p>' +
	'<p>His legacy will continue forever through the Shimeles Abera Foundation, ensuring that his vision, values, and compassion endure for generations to come.</p>' +
	'<p>We remember Shimeles with profound gratitude and admiration. His life stands as a testament to the power of character and the lasting impact of a life well lived.</p>' +
	'<p><em>May his soul rest in eternal peace.</em></p>';

const ABOUT_STORY_BODY =
	'<p>This foundation carries the name of Shimeles Abera, and it was built by the people who knew him.</p>' +
	'<p>It is not a large organisation. It is a group of people in Addis Ababa who decided that the gap between what a family needs on their worst day and what they can actually reach is a gap somebody should stand in.</p>' +
	'<h2>How we work</h2><p>Someone applies, or someone tells us about a neighbour. We look at it properly. If we can help, we help, and we record where the money went, down to the hospital and the date, because a nonprofit that cannot show that has not earned the next gift.</p>';

/* ==========================================================================
   Roles & permissions
   ========================================================================== */

async function seedPermissions() {
	for (const [name, meta] of Object.entries(PERMISSIONS)) {
		await db
			.insert(schema.permissions)
			.values({ name, description: meta.description, group: meta.group })
			.onConflictDoUpdate({
				target: schema.permissions.name,
				set: { description: meta.description, group: meta.group }
			});
	}

	const roles = [
		{ slug: ROLE.SUPER_ADMIN, name: 'Super Admin', description: 'Full access to everything.' },
		{
			slug: ROLE.PROGRAM_STAFF,
			name: 'Program Staff',
			description: 'Case work, scoped to their assigned pillars.'
		},
		{
			slug: ROLE.FINANCE,
			name: 'Finance',
			description: 'Donations, pledges and reconciliation.'
		},
		{
			slug: ROLE.VOLUNTEER_COORDINATOR,
			name: 'Volunteer Coordinator',
			description: 'Volunteer applications, safeguarding and placements.'
		}
	];

	for (const role of roles) {
		await db
			.insert(schema.roles)
			.values(role)
			.onConflictDoUpdate({ target: schema.roles.slug, set: { description: role.description } });
	}

	// A super admin's grant is a wildcard resolved in code, so only the three
	// scoped roles get explicit rows.
	for (const [slug, granted] of Object.entries(ROLE_PERMISSIONS)) {
		const [role] = await db.select().from(schema.roles).where(eq(schema.roles.slug, slug)).limit(1);
		if (!role) continue;

		for (const permissionName of granted) {
			const [permission] = await db
				.select()
				.from(schema.permissions)
				.where(eq(schema.permissions.name, permissionName))
				.limit(1);
			if (!permission) continue;

			await db
				.insert(schema.rolePermissions)
				.values({ roleId: role.id, permissionId: permission.id })
				.onConflictDoNothing();
		}
	}

	console.log('✓ roles and permissions');
}

/* ==========================================================================
   Regions
   ========================================================================== */

async function seedRegions() {
	// v1 operates in Addis Ababa alone, but §1 requires the field to exist now so
	// expansion in two years is data entry rather than a migration.
	const regions = [{ slug: 'addis-ababa', name: 'Addis Ababa', isDefault: true, sortOrder: 0 }];

	for (const region of regions) {
		await db
			.insert(schema.regions)
			.values(region)
			.onConflictDoNothing({ target: schema.regions.slug });
	}
	console.log('✓ regions');
}

/* ==========================================================================
   Site settings
   ========================================================================== */

type SettingSeed = {
	key: string;
	label: string;
	group: string;
	value?: string;
	valueType?: 'text' | 'textarea' | 'number' | 'boolean' | 'json' | 'image' | 'url';
	hint?: string;
};

async function seedSettings() {
	const settings: SettingSeed[] = [
		// Identity
		{
			key: 'site.name',
			label: 'Foundation name',
			group: 'general',
			value: 'Shimeles Abera Foundation'
		},
		{
			key: 'site.url',
			label: 'Public site URL',
			group: 'general',
			valueType: 'url',
			value: 'https://shimelesaberafoundation.org',
			hint: 'Used in emails and share tags.'
		},
		{
			key: 'site.tagline',
			label: 'Tagline',
			group: 'general',
			value: 'Hope. Compassion. Opportunity.'
		},
		{ key: 'site.logo', label: 'Logo', group: 'general', valueType: 'image' },
		{
			key: 'seo.description',
			label: 'Search description',
			group: 'general',
			valueType: 'textarea',
			value:
				'Hope, compassion and opportunity for families in Addis Ababa: medical hardship ' +
				'support, elder care, mental wellness and youth education.',
			hint: 'Shown under the site name in Google results and on shared links, for pages with no description of their own. Around 155 characters.'
		},
		{
			key: 'seo.share_image',
			label: 'Default share image',
			group: 'general',
			valueType: 'image',
			hint: 'The picture shown when a link to this site is posted on Facebook, WhatsApp or X. Ideally 1200x630. Pages with their own share image use that instead.'
		},

		// Contact
		{
			key: 'contact.email_primary',
			label: 'Primary email',
			group: 'contact',
			value: 'info@shimelesaberafoundation.org'
		},
		{ key: 'contact.email_secondary', label: 'Secondary email', group: 'contact' },
		{ key: 'contact.phone_1', label: 'Phone 1', group: 'contact', value: '+251 11 000 0000' },
		{ key: 'contact.phone_2', label: 'Phone 2', group: 'contact' },
		{
			key: 'contact.address',
			label: 'Address',
			group: 'contact',
			valueType: 'textarea',
			value: 'Addis Ababa, Ethiopia'
		},
		{
			key: 'contact.office_hours',
			label: 'Office hours',
			group: 'contact',
			value: 'Monday to Friday, 8:30–17:00'
		},

		// Social
		{ key: 'social.facebook', label: 'Facebook URL', group: 'social', valueType: 'url' },
		{ key: 'social.instagram', label: 'Instagram URL', group: 'social', valueType: 'url' },
		{ key: 'social.tiktok', label: 'TikTok URL', group: 'social', valueType: 'url' },
		{ key: 'social.youtube', label: 'YouTube URL', group: 'social', valueType: 'url' },
		{ key: 'social.telegram', label: 'Telegram URL', group: 'social', valueType: 'url' },
		{ key: 'social.linkedin', label: 'LinkedIn URL', group: 'social', valueType: 'url' },

		// Donation
		{
			key: 'donation.bank_account_name',
			label: 'Bank account name',
			group: 'donation',
			value: 'Shimeles Abera Foundation'
		},
		{
			key: 'donation.bank_account_number',
			label: 'Bank account number',
			group: 'donation',
			value: '1000000000000'
		},
		{
			key: 'donation.bank_name',
			label: 'Bank name',
			group: 'donation',
			value: 'Commercial Bank of Ethiopia'
		},
		{
			key: 'donation.thank_you_note',
			label: 'Thank-you note',
			group: 'donation',
			valueType: 'textarea',
			value: 'Every birr is accounted for and reported back to the people who gave it.'
		},

		// Future initiatives. §0: the disclaimer is a row, not a string in a
		// component — it is a legal notice the Foundation must be able to revise
		// (or withdraw, by clearing it) the day a programme actually opens,
		// without waiting on a deploy.
		{
			key: 'initiatives.disclaimer',
			label: 'Future initiatives disclaimer',
			group: 'initiatives',
			valueType: 'textarea',
			hint: 'Shown wherever the long-term initiatives are listed. Clear it to remove the notice.',
			value:
				'These initiatives are in the strategic planning phase and are not open for ' +
				'beneficiary registration, volunteer assignment or service requests. Please do not ' +
				'apply for them. Registration will be announced by national press release and on ' +
				'this website well ahead of each launch. Gifts towards them are welcome and are held ' +
				'against the named initiative.'
		},

		// Homepage
		{
			key: 'hero.headline',
			label: 'Hero headline',
			group: 'homepage',
			value: 'Nobody should face the hardest days alone.'
		},
		{
			key: 'hero.subheadline',
			label: 'Hero subheadline',
			group: 'homepage',
			valueType: 'textarea',
			value:
				'Founded by the family and friends of Shimeles Abera, we walk with families in Addis Ababa through medical crisis, old age, mental strain, and the long work of getting a child through school.'
		},
		{ key: 'hero.image', label: 'Hero image', group: 'homepage', valueType: 'image' },

		// Impact overrides — deliberately blank. §4: computed values are the
		// default, and an override is an editorial exception, not a habit.
		{
			key: 'impact.override_families_supported',
			label: 'Override: families supported',
			group: 'impact',
			valueType: 'number',
			hint: 'Leave blank to use the live count. Only fill this in to publish a manually verified figure.'
		},
		{
			key: 'impact.override_students_sponsored',
			label: 'Override: students sponsored',
			group: 'impact',
			valueType: 'number',
			hint: 'Leave blank to use the live count.'
		},
		{
			key: 'impact.override_elders_cared_for',
			label: 'Override: elders cared for',
			group: 'impact',
			valueType: 'number',
			hint: 'Leave blank to use the live count.'
		},
		{
			key: 'impact.override_funds_raised',
			label: 'Override: funds raised (minor units)',
			group: 'impact',
			valueType: 'number',
			hint: 'Leave blank to use the live totals of completed donations, counted per currency.'
		},
		{
			key: 'impact.override_funds_raised_currency',
			value: 'ETB',
			label: 'Override: funds raised — currency',
			group: 'impact',
			hint: 'Which currency the override above is in. Only read when it is set.'
		},

		// Which pillar each per-pillar counter reads. Settings rather than
		// literals in the code, because a pillar's slug is editable and a counter
		// that silently stopped counting is worse than one that is obviously
		// pointed at the wrong place (§0).
		{
			key: 'impact.pillar_students_sponsored',
			value: 'youth-education',
			label: 'Students sponsored: which pillar',
			group: 'impact',
			valueType: 'text',
			hint: 'The slug of the pillar this counter counts. Change it if you rename that pillar.'
		},
		{
			key: 'impact.pillar_elders_cared_for',
			value: 'elder-care',
			label: 'Elders cared for: which pillar',
			group: 'impact',
			valueType: 'text',
			hint: 'The slug of the pillar this counter counts. Change it if you rename that pillar.'
		},

		// Footer
		{
			key: 'footer.blurb',
			label: 'Footer blurb',
			group: 'footer',
			valueType: 'textarea',
			value:
				'An Ethiopian nonprofit founded by the family and friends of Shimeles Abera, working in Addis Ababa across medical hardship, elder care, mental wellness, and youth education.'
		},
		{
			key: 'footer.links_heading',
			label: 'Footer links heading',
			group: 'footer',
			value: 'Explore'
		},
		{
			key: 'footer.contact_heading',
			label: 'Footer contact heading',
			group: 'footer',
			value: 'Get in touch'
		},
		{
			key: 'footer.newsletter_placeholder',
			label: 'Newsletter placeholder',
			group: 'footer',
			value: 'Your email'
		},
		{ key: 'footer.rights', label: 'Rights line', group: 'footer', value: 'All rights reserved.' },
		{
			key: 'footer.registration',
			label: 'Charity registration number',
			group: 'footer',
			hint: 'Shown as the registration line in the footer.',
			value: 'Charity registration no. 8032'
		},
		{
			key: 'workflow.notify_on_status_change',
			label: 'Email people on every status change',
			group: 'workflow',
			valueType: 'boolean',
			hint:
				'When Yes, moving an application or a volunteer to any status emails them, not only the ' +
				'statuses ticked under Configuration → Statuses. A status with nothing written in its ' +
				'public description still sends nothing unless the caseworker adds a note. Off by default.',
			value: 'false'
		}
	];

	for (const [index, setting] of settings.entries()) {
		await db
			.insert(schema.siteSettings)
			.values({
				key: setting.key,
				value: setting.value ?? null,
				valueType: setting.valueType ?? 'text',
				label: setting.label,
				hint: setting.hint ?? null,
				group: setting.group,
				sortOrder: index
			})
			// Only the metadata is refreshed — the value is whatever staff last
			// saved, and a re-run must not undo their edit.
			.onConflictDoUpdate({
				target: schema.siteSettings.key,
				set: {
					label: setting.label,
					hint: setting.hint ?? null,
					group: setting.group,
					valueType: setting.valueType ?? 'text',
					sortOrder: index
				}
			});
	}

	console.log(`✓ ${settings.length} site settings`);
}

/* ==========================================================================
   Status options
   ========================================================================== */

async function seedStatuses() {
	const statuses = [
		// Applications
		{
			context: 'application',
			stage: 'submitted',
			label: 'Submitted',
			color: 'slate',
			isDefault: true
		},
		{
			context: 'application',
			stage: 'under_review',
			label: 'Under review',
			color: 'sky'
		},
		{
			context: 'application',
			stage: 'verified',
			label: 'Verified',
			color: 'plum'
		},
		{
			context: 'application',
			stage: 'approved',
			label: 'Approved',
			color: 'olive',
			notifyApplicant: true,
			publicDescription:
				'Your request has been approved. Someone from the team will be in touch to arrange ' +
				'what happens next. There is nothing you need to do in the meantime.'
		},
		{
			context: 'application',
			stage: 'active',
			label: 'Receiving support',
			color: 'clay'
		},
		{
			context: 'application',
			stage: 'waitlisted',
			label: 'Waitlisted',
			color: 'amber',
			notifyApplicant: true,
			publicDescription:
				'You are on the waiting list. We assess the list at each intake round and will ' +
				'contact you if you match an upcoming camp or programme.'
		},
		{ context: 'application', stage: 'closed', label: 'Closed', color: 'slate' },
		{
			context: 'application',
			stage: 'declined',
			label: 'Not proceeding',
			color: 'rose',
			notifyApplicant: true,
			publicDescription:
				'We are not able to take this request forward. That is not a judgement about you or ' +
				'your situation — we can only reach a limited number of families at a time. You are ' +
				'welcome to apply again.'
		},

		// Volunteers
		{ context: 'volunteer', stage: 'submitted', label: 'Applied', color: 'slate', isDefault: true },
		{ context: 'volunteer', stage: 'under_review', label: 'Under review', color: 'sky' },
		{
			context: 'volunteer',
			stage: 'references_checked',
			label: 'References checked',
			color: 'plum'
		},
		{
			context: 'volunteer',
			stage: 'credentials_verified',
			label: 'Credentials verified',
			color: 'olive'
		},
		{
			context: 'volunteer',
			stage: 'approved',
			label: 'Approved to volunteer',
			color: 'clay',
			notifyApplicant: true,
			publicDescription:
				'Your safeguarding review is complete and you are approved to volunteer with us. ' +
				'The coordinator will be in touch about placing you.'
		},
		{
			context: 'volunteer',
			stage: 'declined',
			label: 'Not proceeding',
			color: 'rose',
			notifyApplicant: true,
			publicDescription:
				'We are not taking your volunteer application forward on this occasion. Thank you ' +
				'for offering your time — it matters that you did.'
		},

		// Contact messages reuse the same vocabulary rather than a second
		// hardcoded lifecycle, so a coordinator can relabel "Answered" without
		// anything keying off the word.
		{ context: 'contact', stage: 'submitted', label: 'New', color: 'sky', isDefault: true },
		{ context: 'contact', stage: 'under_review', label: 'In progress', color: 'olive' },
		{ context: 'contact', stage: 'active', label: 'Waiting on them', color: 'slate' },
		{ context: 'contact', stage: 'closed', label: 'Answered', color: 'clay' },
		{ context: 'contact', stage: 'declined', label: 'No reply needed', color: 'rose' }
	] as const;

	for (const [index, status] of statuses.entries()) {
		const existing = await db
			.select({ id: schema.statusOptions.id })
			.from(schema.statusOptions)
			.where(
				sql`${schema.statusOptions.context} = ${status.context} and ${schema.statusOptions.stage} = ${status.stage}`
			)
			.limit(1);

		if (existing.length) continue;

		await db.insert(schema.statusOptions).values({
			context: status.context,
			stage: status.stage,
			label: status.label,
			color: status.color,
			isDefault: 'isDefault' in status ? status.isDefault : false,
			publicDescription: 'publicDescription' in status ? status.publicDescription : null,
			// Only the moments that genuinely warrant a letter start out ticked:
			// a decision, and the waitlist. Everything else is internal movement,
			// and mailing somebody about it trains them to ignore the one that
			// matters. Staff turn any of them on from Configuration → Statuses.
			notifyApplicant: 'notifyApplicant' in status ? status.notifyApplicant : false,
			sortOrder: index
		});
	}

	console.log('✓ status options');
}

/* ==========================================================================
   Pillars & initiatives
   ========================================================================== */

const PILLARS = [
	{
		slug: 'medical-hardship',
		name: 'Medical Hardship Support',
		summary:
			'Financial assistance, access to care, and someone beside you during a medical crisis.',
		description:
			'<p>When someone falls seriously ill in Addis Ababa, the cost is rarely only the bill. It is the lost income, the transport, the nights in a corridor, the family member who has to stop working to sit beside the bed.</p><p>We help with the cost of treatment, we help people navigate a hospital system that is hard to navigate alone, and we make sure nobody sits through the worst week of their life without a person beside them.</p>',
		icon: 'HeartPulse',
		color: 'clay',
		referencePrefix: 'MED'
	},
	{
		slug: 'elder-care',
		name: 'Elder Care & Assistance',
		summary: 'Direct care, dignity, and company for elders who would otherwise be alone.',
		description:
			'<p>Our elders raised the people who are now raising Ethiopia. Too many of them spend their last years isolated: physically able enough to be overlooked, and alone enough that nobody notices when they are not.</p><p>We provide direct assistance with the practical things, and just as importantly we keep showing up. Isolation is a condition, and company is a treatment for it.</p>',
		icon: 'Users',
		color: 'olive',
		referencePrefix: 'ELD'
	},
	{
		slug: 'mental-wellness',
		name: 'Mental Wellness',
		summary: 'Stigma-free support. No proof of need. No forms about how bad it has to be first.',
		description:
			'<p>Asking for help with your mental health in Ethiopia still costs something socially. We have designed this programme so that it costs as little as possible.</p><p>You do not need a diagnosis. You do not need a letter. You do not need to explain yourself to three people before you reach the one who can help. If you would rather not tell us your name, that is a complete and acceptable answer.</p>',
		icon: 'Brain',
		color: 'plum',
		referencePrefix: 'MEN',
		isLowBarrier: true
	},
	{
		slug: 'youth-education',
		name: 'Youth & Education',
		summary:
			'Scholarships, mentorship, leadership development, and the school supplies that quietly decide who stays in school.',
		description:
			'<p>A bright child leaves school in Ethiopia for reasons that are almost never about ability. Fees. A uniform. A younger sibling who needs looking after. A family that ran out of margin in one bad month.</p><p>We work on all of it: scholarships that cover the real cost, mentors who stay in touch past the first term, and leadership programmes for young people who are already leading and do not know it yet.</p>',
		icon: 'GraduationCap',
		color: 'sky',
		referencePrefix: 'YTH'
	}
] as const;

async function seedPillars() {
	for (const [index, pillar] of PILLARS.entries()) {
		await db
			.insert(schema.pillars)
			.values({
				slug: pillar.slug,
				name: pillar.name,
				summary: pillar.summary,
				description: pillar.description,
				icon: pillar.icon,
				color: pillar.color,
				sortOrder: index,
				hasPublicApplication: true
			})
			.onConflictDoNothing({ target: schema.pillars.slug });
	}

	const initiatives = [
		{
			slug: 'free-hospital',
			name: 'A free hospital',
			description:
				'A hospital where the question at the door is what is wrong with you, not what you can pay.',
			icon: 'Cross',
			status: 'planned' as const
		},
		{
			slug: 'boarding-schools',
			name: 'Tuition-free boarding schools',
			description:
				'A network of boarding schools for children whose potential is currently limited by their postcode and their family income.',
			icon: 'School',
			status: 'planned' as const
		},
		{
			slug: 'senior-centers',
			name: 'Senior citizen centres',
			description:
				'Places where elders are expected, known by name, and missed when they do not arrive.',
			icon: 'Home',
			status: 'planned' as const
		}
	];

	for (const [index, initiative] of initiatives.entries()) {
		await db
			.insert(schema.futureInitiatives)
			.values({ ...initiative, sortOrder: index })
			.onConflictDoNothing({ target: schema.futureInitiatives.slug });
	}

	console.log('✓ pillars and future initiatives');
}

/* ==========================================================================
   Forms
   ========================================================================== */

/** The questions every assistance application asks, whatever the pillar. */
const commonApplicationFields = (isLowBarrier: boolean) => [
	{
		fieldKey: 'applicant_name',
		label: 'Your full name',
		fieldType: 'text' as const,
		isRequired: !isLowBarrier,
		mapsTo: 'name' as const,
		validation: { maxLength: 150 }
	},
	{
		fieldKey: 'applicant_phone',
		label: 'Phone number',
		hint: isLowBarrier
			? 'Only if you would like us to be able to call you.'
			: 'So we can reach you about this request.',
		fieldType: 'phone' as const,
		isRequired: !isLowBarrier,
		mapsTo: 'phone' as const
	},
	{
		fieldKey: 'applicant_email',
		label: 'Email address',
		fieldType: 'email' as const,
		isRequired: false,
		mapsTo: 'email' as const
	},
	{
		fieldKey: 'household_size',
		label: 'How many people live in your household?',
		fieldType: 'number' as const,
		isRequired: false,
		validation: { min: 1, max: 30 }
	}
];

async function seedForms() {
	const pillarRows = await db.select().from(schema.pillars);
	const bySlug = new Map(pillarRows.map((row) => [row.slug, row]));

	const forms = [
		{
			slug: 'application-medical',
			name: 'Medical Hardship application',
			pillarSlug: 'medical-hardship',
			title: 'Apply for medical hardship support',
			introText:
				'Tell us what is happening. We will read every word of this, and someone will contact you.',
			requiresDocuments: true,
			isLowBarrier: false,
			referencePrefix: 'MED',
			fields: [
				...commonApplicationFields(false),
				{
					fieldKey: 'section_situation',
					label: 'About the medical situation',
					fieldType: 'heading' as const,
					isRequired: false
				},
				{
					fieldKey: 'patient_name',
					label: "Patient's name, if it is not you",
					fieldType: 'text' as const,
					isRequired: false
				},
				{
					fieldKey: 'condition',
					label: 'What is the medical situation?',
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { minLength: 20, maxLength: 3000 }
				},
				{
					fieldKey: 'hospital',
					label: 'Which hospital or clinic?',
					fieldType: 'text' as const,
					isRequired: false
				},
				{
					fieldKey: 'support_needed',
					label: 'What kind of help do you need?',
					fieldType: 'multiselect' as const,
					isRequired: true,
					options: [
						{
							value: 'treatment_cost',
							label: 'Help with treatment costs'
						},
						{ value: 'medication', label: 'Medication' },
						{ value: 'transport', label: 'Transport to appointments' },
						{ value: 'navigating_care', label: 'Help navigating the hospital' },
						{ value: 'accompaniment', label: 'Someone to be there' }
					]
				},
				{
					fieldKey: 'estimated_cost',
					label: 'Estimated cost, in birr, if you know it',
					fieldType: 'number' as const,
					isRequired: false,
					validation: { min: 0 }
				},
				{
					fieldKey: 'section_documents',
					label: 'Supporting documents',
					fieldType: 'heading' as const,
					isRequired: false,
					hint: 'These help us move faster, but send what you have. We will not turn you away for a missing paper.'
				},
				{
					fieldKey: 'medical_letter',
					label: 'Medical letter or diagnosis',
					fieldType: 'file_upload' as const,
					isRequired: false
				},
				{
					fieldKey: 'income_evidence',
					label: 'Evidence of income, if you have it',
					fieldType: 'file_upload' as const,
					isRequired: false
				}
			]
		},
		{
			slug: 'application-elder',
			name: 'Elder Care application',
			pillarSlug: 'elder-care',
			title: 'Request elder care support',
			introText: 'For yourself, or for an elder you are worried about.',
			requiresDocuments: false,
			isLowBarrier: false,
			referencePrefix: 'ELD',
			fields: [
				...commonApplicationFields(false),
				{
					fieldKey: 'section_elder',
					label: 'About the elder',
					fieldType: 'heading' as const,
					isRequired: false
				},
				{
					fieldKey: 'elder_name',
					label: "Elder's name",
					fieldType: 'text' as const,
					isRequired: true
				},
				{
					fieldKey: 'elder_age',
					label: 'Approximate age',
					fieldType: 'number' as const,
					isRequired: false,
					validation: { min: 45, max: 120 }
				},
				{
					fieldKey: 'relationship',
					label: 'Your relationship to them',
					fieldType: 'select' as const,
					isRequired: true,
					options: [
						{ value: 'self', label: 'This is about me' },
						{ value: 'family', label: 'Family member' },
						{ value: 'neighbour', label: 'Neighbour' },
						{ value: 'community', label: 'Community member' }
					]
				},
				{
					fieldKey: 'living_situation',
					label: 'Who do they live with?',
					fieldType: 'select' as const,
					isRequired: false,
					options: [
						{ value: 'alone', label: 'Alone' },
						{ value: 'family', label: 'With family' },
						{ value: 'other', label: 'Other' }
					]
				},
				{
					fieldKey: 'needs',
					label: 'What do they need?',
					fieldType: 'multiselect' as const,
					isRequired: true,
					options: [
						{ value: 'daily_care', label: 'Help with daily living' },
						{ value: 'medical', label: 'Medical support' },
						{ value: 'food', label: 'Food' },
						{ value: 'companionship', label: 'Company and regular visits' },
						{ value: 'housing', label: 'Housing' }
					]
				},
				{
					fieldKey: 'situation',
					label: 'Tell us about their situation',
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { minLength: 20, maxLength: 3000 }
				}
			]
		},
		{
			slug: 'application-mental-wellness',
			name: 'Mental Wellness request',
			pillarSlug: 'mental-wellness',
			title: 'Reach out for mental wellness support',
			introText:
				'You do not have to explain yourself, prove anything, or give us your name. Say as much or as little as you want.',
			requiresDocuments: false,
			// The low-barrier flag is enforced by the schema generator: on this
			// form, no contact field and no upload can be made required, whatever
			// anyone later ticks in the form builder.
			isLowBarrier: true,
			referencePrefix: 'MEN',
			fields: [
				...commonApplicationFields(true),
				{
					fieldKey: 'what_is_happening',
					label: 'What is going on for you?',
					hint: 'One sentence is enough.',
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { minLength: 5, maxLength: 3000 }
				},
				{
					fieldKey: 'contact_preference',
					label: 'How would you like us to reach you?',
					fieldType: 'select' as const,
					isRequired: false,
					options: [
						{ value: 'phone', label: 'Phone call' },
						{ value: 'sms', label: 'Text message' },
						{ value: 'telegram', label: 'Telegram' },
						{ value: 'email', label: 'Email' },
						{
							value: 'no_contact',
							label: 'Please do not contact me. I just wanted to write this down'
						}
					]
				},
				{
					fieldKey: 'urgency',
					label: 'How urgent does this feel?',
					fieldType: 'select' as const,
					isRequired: false,
					options: [
						{ value: 'immediate', label: 'I need to speak to someone today' },
						{ value: 'soon', label: 'Within the next few days' },
						{ value: 'no_rush', label: 'No rush' }
					]
				}
			]
		},
		{
			slug: 'application-youth',
			name: 'Youth & Education application',
			pillarSlug: 'youth-education',
			title: 'Apply for education support',
			introText: 'For students, and for parents applying on behalf of a student.',
			requiresDocuments: true,
			isLowBarrier: false,
			referencePrefix: 'YTH',
			fields: [
				...commonApplicationFields(false),
				{
					fieldKey: 'section_student',
					label: 'About the student',
					fieldType: 'heading' as const,
					isRequired: false
				},
				{
					fieldKey: 'student_name',
					label: "Student's full name",
					fieldType: 'text' as const,
					isRequired: true
				},
				{
					fieldKey: 'student_age',
					label: "Student's age",
					fieldType: 'number' as const,
					isRequired: true,
					validation: { min: 4, max: 30 }
				},
				{
					fieldKey: 'school_name',
					label: 'School or institution',
					fieldType: 'text' as const,
					isRequired: true
				},
				{
					fieldKey: 'grade_level',
					label: 'Grade or year',
					fieldType: 'select' as const,
					isRequired: true,
					options: [
						{ value: 'primary', label: 'Primary (1–8)' },
						{ value: 'secondary', label: 'Secondary (9–10)' },
						{ value: 'preparatory', label: 'Preparatory (11–12)' },
						{ value: 'tvet', label: 'TVET' },
						{ value: 'university', label: 'University' }
					]
				},
				{
					fieldKey: 'support_needed',
					label: 'What is needed?',
					fieldType: 'multiselect' as const,
					isRequired: true,
					options: [
						{ value: 'tuition', label: 'Tuition or fees' },
						{ value: 'supplies', label: 'Books and school supplies' },
						{ value: 'uniform', label: 'Uniform' },
						{ value: 'transport', label: 'Transport' },
						{ value: 'mentorship', label: 'Mentorship' }
					]
				},
				{
					fieldKey: 'circumstances',
					label: 'Tell us about the circumstances',
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { minLength: 20, maxLength: 3000 }
				},
				{
					fieldKey: 'school_record',
					label: 'Most recent school report, if you have one',
					fieldType: 'file_upload' as const,
					isRequired: false
				}
			]
		},
		{
			slug: 'volunteer-application',
			name: 'Volunteer application',
			pillarSlug: null,
			title: 'Volunteer with us',
			introText:
				'Because our volunteers meet people at vulnerable moments, every application goes through a safeguarding review before placement.',
			requiresDocuments: false,
			isLowBarrier: false,
			referencePrefix: 'VOL',
			statusContext: 'volunteer' as const,
			fields: [
				{
					fieldKey: 'full_name',
					label: 'Your full name',
					fieldType: 'text' as const,
					isRequired: true,
					mapsTo: 'name' as const
				},
				{
					fieldKey: 'phone',
					label: 'Phone number',
					fieldType: 'phone' as const,
					isRequired: true,
					mapsTo: 'phone' as const
				},
				{
					fieldKey: 'email',
					label: 'Email address',
					fieldType: 'email' as const,
					isRequired: true,
					mapsTo: 'email' as const
				},
				{
					fieldKey: 'areas_of_interest',
					label: 'Which programmes interest you?',
					fieldType: 'multiselect' as const,
					isRequired: true,
					options: PILLARS.map((pillar) => ({ value: pillar.slug, label: pillar.name }))
				},
				{
					fieldKey: 'skills',
					label: 'What skills or experience do you bring?',
					fieldType: 'textarea' as const,
					isRequired: false,
					validation: { maxLength: 1500 }
				},
				{
					fieldKey: 'availability',
					label: 'When are you available?',
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { maxLength: 600 }
				},
				{
					fieldKey: 'is_professional',
					label: 'Are you a licensed medical or mental health professional?',
					fieldType: 'select' as const,
					isRequired: true,
					options: [
						{ value: 'no', label: 'No' },
						{ value: 'yes', label: 'Yes' }
					]
				},
				{
					fieldKey: 'professional_credentials',
					label: 'Your credentials and licence number',
					hint: 'We verify these before any placement involving direct care.',
					fieldType: 'textarea' as const,
					isRequired: false,
					showWhenFieldKey: 'is_professional',
					showWhenValue: 'yes'
				},
				{
					fieldKey: 'references',
					label: 'Two references: name, relationship, and how to reach them',
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { minLength: 20, maxLength: 1500 }
				}
			]
		},
		{
			slug: 'contact-form',
			name: 'Contact form',
			pillarSlug: null,
			title: 'Get in touch',
			introText: 'Questions, partnerships, press, or anything else.',
			requiresDocuments: false,
			isLowBarrier: false,
			referencePrefix: 'MSG',
			fields: [
				{
					fieldKey: 'name',
					label: 'Your name',
					fieldType: 'text' as const,
					isRequired: true,
					mapsTo: 'name' as const
				},
				{
					fieldKey: 'email',
					label: 'Email address',
					fieldType: 'email' as const,
					isRequired: true,
					mapsTo: 'email' as const
				},
				{
					fieldKey: 'phone',
					label: 'Phone number',
					fieldType: 'phone' as const,
					isRequired: false,
					mapsTo: 'phone' as const
				},
				{
					fieldKey: 'subject',
					label: 'What is this about?',
					fieldType: 'select' as const,
					isRequired: true,
					options: [
						{ value: 'general', label: 'General question' },
						{ value: 'donate', label: 'Donating or fundraising' },
						{ value: 'partner', label: 'Partnership' },
						{ value: 'press', label: 'Press' },
						{ value: 'other', label: 'Something else' }
					]
				},
				{
					fieldKey: 'message',
					label: 'Your message',
					hint: 'A sentence or two is plenty. We will reply and take it from there.',
					fieldType: 'textarea' as const,
					isRequired: true,
					// Matches `MAX_CONTACT_MESSAGE` on the hand-written `/contact`
					// route. An enquiry is routed and answered, not read in full
					// here; the long story belongs on an application form, which is
					// why the four above keep their 3000.
					validation: { minLength: 10, maxLength: 250 }
				}
			]
		}
	];

	for (const [formIndex, form] of forms.entries()) {
		const pillar = form.pillarSlug ? bySlug.get(form.pillarSlug) : null;

		const [existing] = await db
			.select({ id: schema.formDefinitions.id })
			.from(schema.formDefinitions)
			.where(eq(schema.formDefinitions.slug, form.slug))
			.limit(1);

		let formId = existing?.id;

		if (!formId) {
			const [created] = await db
				.insert(schema.formDefinitions)
				.values({
					slug: form.slug,
					name: form.name,
					pillarId: pillar?.id ?? null,
					title: form.title,
					introText: form.introText,
					successMessage:
						'We have your request. Someone will look at it and be in touch. Please keep your reference number.',
					requiresDocuments: form.requiresDocuments,
					isLowBarrier: form.isLowBarrier,
					/**
					 * Off for a low-barrier form, and that is safeguarding rather
					 * than preference: Mental Wellness is designed so that asking
					 * for help costs as little as possible, and an unexpected email
					 * headed with the Foundation's name arriving on a shared device
					 * or a family address is a cost. Staff can turn it on per form
					 * from Configuration → Forms.
					 */
					acknowledgeSubmitter: !form.isLowBarrier,
					referencePrefix: form.referencePrefix,
					statusContext: 'statusContext' in form ? form.statusContext! : 'application',
					sortOrder: formIndex,
					createdAt: now(),
					updatedAt: now()
				})
				.returning({ id: schema.formDefinitions.id });
			formId = created.id;
		}

		for (const [fieldIndex, field] of form.fields.entries()) {
			await db
				.insert(schema.formFields)
				.values({
					formDefinitionId: formId,
					fieldKey: field.fieldKey,
					label: field.label,
					hint: 'hint' in field ? (field.hint as string) : null,
					fieldType: field.fieldType,
					options: 'options' in field ? (field.options as never) : null,
					isRequired: field.isRequired,
					validation: 'validation' in field ? (field.validation as never) : null,
					showWhenFieldKey: 'showWhenFieldKey' in field ? (field.showWhenFieldKey as string) : null,
					showWhenValue: 'showWhenValue' in field ? (field.showWhenValue as string) : null,
					mapsTo: 'mapsTo' in field ? (field.mapsTo as never) : null,
					sortOrder: fieldIndex
				})
				.onConflictDoNothing();
		}
	}

	console.log(`✓ ${forms.length} form definitions`);
}

/* ==========================================================================
   Pages, blocks and navigation
   ========================================================================== */

/**
 * One-time content migration: Mission & Vision stopped being its own page and
 * became a section of About, alongside a new In Memoriam tribute.
 *
 * Every block this touches is still the placeholder copy this file wrote in
 * the first place — see the note at the top of this file — so there is
 * nothing staff-authored to lose by resetting `content_blocks` and
 * `navigation_items` and letting the (now corrected) `seedPages` below
 * recreate them in the merged shape. Guarded on the `mission` page still
 * existing, so this runs exactly once against a database seeded before this
 * change and is a no-op ever after.
 */
async function migrateMissionIntoAbout() {
	const [missionPage] = await db
		.select({ id: schema.pages.id })
		.from(schema.pages)
		.where(eq(schema.pages.slug, 'mission'))
		.limit(1);

	if (!missionPage) return;

	await db.delete(schema.contentBlocks);
	await db.delete(schema.navigationItems);
	await db.delete(schema.pages).where(eq(schema.pages.slug, 'mission'));

	console.log('✓ merged the Mission page into About (content blocks reset for a clean re-seed)');
}

/**
 * One-time content migration: About stopped being a `content_blocks` page
 * and became a hand-built route (`/about`) backed by `about_content` and
 * `about_gallery_images` — see the note at the top of `schema.ts`.
 *
 * Deleting the `pages` row cascades its old `content_blocks` rows and the
 * old pageId-linked nav item along with it; `seedPages` below then recreates
 * the "About" nav item as a raw `/about` URL, and `seedAboutPage` fills in
 * the new tables. Guarded the same way as `migrateMissionIntoAbout`: a no-op
 * once the `about` page row is gone.
 */
async function migrateAboutToHardcodedRoute() {
	const [aboutPage] = await db
		.select({ id: schema.pages.id })
		.from(schema.pages)
		.where(eq(schema.pages.slug, 'about'))
		.limit(1);

	if (!aboutPage) return;

	await db.delete(schema.pages).where(eq(schema.pages.slug, 'about'));

	console.log('✓ about page: converted to a hand-built route (old content_blocks removed)');
}

async function seedPages() {
	const pages = [
		{
			slug: 'home',
			title: 'Home',
			metaDescription: 'Hope, compassion and opportunity for families in Addis Ababa.',
			sortOrder: 0
		},
		{
			slug: 'programs',
			title: 'Programs',
			metaDescription:
				'Four pillars: medical hardship, elder care, mental wellness, and youth education.',
			sortOrder: 1
		},
		{
			slug: 'donate',
			title: 'Donate',
			metaDescription: 'Give once or monthly, to a programme or where it is needed most.',
			sortOrder: 2
		},
		{
			slug: 'apply',
			title: 'Apply for support',
			metaDescription:
				'Ask for help, for yourself or for someone you are looking out for. Write in whatever language you are comfortable in.',
			sortOrder: 3
		},
		{
			slug: 'volunteer',
			title: 'Volunteer',
			metaDescription: 'Give your time, skills and presence.',
			sortOrder: 4
		},
		{
			slug: 'contact',
			title: 'Contact',
			metaDescription: 'Get in touch with the Foundation.',
			sortOrder: 4
		},
		// The two legal pages are ordinary `pages` rows, so they render through
		// the catch-all route and are edited from Pages & content like any
		// other page. Neither needs a route or a dashboard screen of its own.
		{
			slug: 'privacy',
			title: 'Privacy Policy',
			metaDescription:
				'How the Shimelesabera Foundation collects, uses, retains and protects personal information.',
			sortOrder: 90
		},
		{
			slug: 'terms',
			title: 'Terms & Conditions',
			metaDescription:
				'The terms governing use of the Shimelesabera Foundation website, donations and applications.',
			sortOrder: 91
		}
	];

	for (const page of pages) {
		await db.insert(schema.pages).values(page).onConflictDoNothing({ target: schema.pages.slug });
	}

	const pageRows = await db.select().from(schema.pages);
	const byPage = new Map(pageRows.map((row) => [row.slug, row.id]));

	/**
	 * The short excerpt on Home. The full tribute lives in `about_content` now
	 * (see `seedAboutPage`) rather than as a `content_blocks` row — About
	 * stopped being block-driven.
	 */
	const HOME_MEMORIAM_BODY =
		'<p>Every programme on this site carries forward the life of the man whose name the Foundation bears: a life marked by integrity, humility, and quiet service to others.</p>' +
		'<p><em>May his soul rest in eternal peace.</em></p>';

	/**
	 * Seed blocks. Every one of these is editable, reorderable and deletable
	 * from the dashboard — none of this copy lives in a component.
	 *
	 * Grouped by page, and given a sort order scoped to that page (see the
	 * insert loop below) — two pages both starting at 0 rather than one long
	 * running count across the whole site.
	 */
	const blocks: {
		page: string;
		blockType: (typeof schema.contentBlocks.$inferInsert)['blockType'];
		heading?: string;
		content: Record<string, unknown>;
	}[] = [
		{
			page: 'home',
			blockType: 'rich_text',
			content: {
				body: "<p>The Shimeles Abera Foundation was started by a family and their friends, after watching what happens to ordinary people in Addis Ababa when one bad month arrives and there is no margin left.</p><p>We work in four places where that margin runs out fastest: a medical crisis, old age, mental strain, and a child's education.</p>"
			}
		},
		{
			page: 'home',
			blockType: 'pillar_grid',
			heading: 'What we do',
			content: { show_apply_links: true }
		},
		{
			page: 'home',
			blockType: 'stat_counter',
			heading: 'Where we are so far',
			content: {
				stats: [
					{ metric: 'families_supported', label: 'Families supported' },
					{ metric: 'students_sponsored', label: 'Students sponsored' },
					{ metric: 'elders_cared_for', label: 'Elders cared for' },
					// No `is_money` here: currency formatting follows from the metric
					// (see `$lib/metrics.ts`), so it cannot be forgotten.
					{ metric: 'funds_raised', label: 'Raised and disbursed' }
				]
			}
		},
		{
			page: 'home',
			blockType: 'values_list',
			heading: 'What we hold to',
			content: {
				values: [
					{
						icon: 'Sun',
						title: 'Hope',
						body: 'We start from the assumption that this situation can change, because most of the time it can.'
					},
					{
						icon: 'HandHeart',
						title: 'Compassion',
						body: 'Nobody has to earn our help by proving how bad it has got.'
					},
					{
						icon: 'Sprout',
						title: 'Opportunity',
						body: 'Relief is the beginning. What we are actually after is a door that stays open.'
					}
				]
			}
		},
		{
			page: 'home',
			blockType: 'cta_button',
			content: {
				label: 'Give to the Foundation',
				url: '/donate',
				variant: 'default',
				note: 'Every birr is accounted for and reported back.'
			}
		},
		{
			page: 'home',
			blockType: 'testimonial_slider',
			heading: 'In their own words',
			// The quotes are not in `content` — the block renders whatever is
			// flagged `is_featured` in `testimonials`, so changing what the front
			// page says is a checkbox rather than a page edit.
			content: { show_all_href: '/testimonials' }
		},
		{
			page: 'home',
			blockType: 'memoriam',
			heading: 'In Memoriam',
			content: {
				name: 'Shimeles Abera',
				body: HOME_MEMORIAM_BODY,
				linkHref: '/about#in-memoriam',
				linkLabel: 'Read his full story'
			}
		},
		{
			page: 'programs',
			blockType: 'rich_text',
			content: {
				body: '<p>Four pillars. Each has its own application form, and each is run by people who know that programme rather than a general queue.</p>'
			}
		},
		{ page: 'programs', blockType: 'pillar_grid', content: { show_apply_links: true } },
		{
			page: 'donate',
			blockType: 'rich_text',
			content: {
				body: '<p>You can give once, or commit to a monthly gift. You can send it where it is needed most, or name the programme it should go to.</p><p>Bank transfers in Ethiopia cannot be charged automatically, so a monthly gift here means we send you a reminder and you make the transfer. It is a promise rather than a direct debit.</p>'
			}
		},
		{ page: 'donate', blockType: 'donation_details', heading: 'Where to send it', content: {} },
		{
			page: 'apply',
			blockType: 'rich_text',
			content: {
				body:
					'<p>If you need help, or you are asking on behalf of someone who does, this is the form. It takes about ten minutes and most of it is optional. Tell us what you know and we will ask the rest when we speak.</p>' +
					'<p>Asking costs you nothing and is not a commitment. We read every application, and we will tell you either way.</p>'
			}
		},
		{
			page: 'volunteer',
			blockType: 'rich_text',
			content: {
				body: '<p>Volunteers do the work this foundation actually runs on: sitting with someone through a hospital night, visiting an elder every week, tutoring a student who is nearly there.</p><p>Because that work puts you next to people at vulnerable moments, every volunteer goes through a safeguarding review before placement. It takes a little longer. It is not negotiable.</p>'
			}
		},
		{
			page: 'volunteer',
			blockType: 'form_embed',
			content: {
				slug: 'volunteer-application',
				label: 'Ready to start? The form takes about ten minutes.'
			}
		},
		{
			page: 'contact',
			blockType: 'rich_text',
			content: {
				body: '<p>If this is about an application you have already made, please quote your reference number. It is the fastest way for us to find you.</p>'
			}
		},
		{
			page: 'contact',
			blockType: 'form_embed',
			content: { slug: 'contact-form', label: 'Send us a message' }
		},
		// One long rich-text block each. Seeded once and never updated after
		// that, like every other body of copy here — a lawyer's revisions must
		// survive a re-run of this script.
		// `lede: false` turns off the drop cap — see `isLede` in `BlockRenderer`.
		// These documents open with a dated label, not with prose.
		{
			page: 'privacy',
			blockType: 'rich_text',
			content: { body: PRIVACY_POLICY_BODY, lede: false }
		},
		{
			page: 'terms',
			blockType: 'rich_text',
			content: { body: TERMS_AND_CONDITIONS_BODY, lede: false }
		}
	];

	// Position within its own page, not within this flat array — two pages
	// both start counting from 0 rather than sharing one running total.
	const pageBlockIndex = new Map<string, number>();

	for (const block of blocks) {
		const pageId = byPage.get(block.page);
		if (!pageId) continue;

		const index = pageBlockIndex.get(block.page) ?? 0;
		pageBlockIndex.set(block.page, index + 1);

		// Keyed on page + type + position, so a re-run does not duplicate blocks
		// but also does not overwrite copy that has since been edited.
		const existing = await db
			.select({ id: schema.contentBlocks.id })
			.from(schema.contentBlocks)
			.where(
				sql`${schema.contentBlocks.pageId} = ${pageId} and ${schema.contentBlocks.blockType} = ${block.blockType} and ${schema.contentBlocks.sortOrder} = ${index}`
			)
			.limit(1);

		if (existing.length) continue;

		await db.insert(schema.contentBlocks).values({
			pageId,
			blockType: block.blockType,
			heading: block.heading ?? null,
			sortOrder: index,
			content: block.content
		});
	}

	// `About` is a raw URL, not a `pageSlug` — `/about` is a hand-built route
	// with no `pages` row behind it (see the note at the top of `schema.ts`).
	const nav: {
		label: string;
		pageSlug?: string;
		url?: string;
		placement: 'both' | 'header' | 'footer';
		isCta?: boolean;
	}[] = [
		{ label: 'About', url: '/about', placement: 'both' },
		{ label: 'Programs', pageSlug: 'programs', placement: 'both' },
		// Same as About: `/blog` is a hand-built route, so it is a raw URL.
		{ label: 'Blog', url: '/blog', placement: 'both' },
		// Also a hand-built route, so a raw URL like About and Blog.
		{ label: 'Testimonials', url: '/testimonials', placement: 'footer' },
		{ label: 'Privacy Policy', pageSlug: 'privacy', placement: 'footer' },
		{ label: 'Terms & Conditions', pageSlug: 'terms', placement: 'footer' },
		{ label: 'Apply for support', pageSlug: 'apply', placement: 'both' },
		{ label: 'Volunteer', pageSlug: 'volunteer', placement: 'both' },
		{ label: 'Contact', pageSlug: 'contact', placement: 'both' },
		{
			label: 'Donate',
			pageSlug: 'donate',
			placement: 'header',
			isCta: true
		}
	];

	for (const [index, item] of nav.entries()) {
		const pageId = item.pageSlug ? byPage.get(item.pageSlug) : null;
		if (item.pageSlug && !pageId) continue;

		// Keyed on label — a page-linked item and a raw-URL item both need a
		// stable identity, and the label is the one thing every kind of nav
		// item always has.
		const existing = await db
			.select({ id: schema.navigationItems.id })
			.from(schema.navigationItems)
			.where(eq(schema.navigationItems.label, item.label))
			.limit(1);
		if (existing.length) continue;

		await db.insert(schema.navigationItems).values({
			label: item.label,
			pageId: pageId ?? null,
			url: item.url ?? null,
			placement: item.placement,
			isCta: item.isCta ?? false,
			sortOrder: index
		});
	}

	console.log('✓ pages, content blocks and navigation');
}

/* ==========================================================================
   Payment methods
   ========================================================================== */

async function seedPayments() {
	const methods = [
		{
			slug: 'cbe-transfer',
			name: 'CBE bank transfer',
			kind: 'bank_transfer' as const,
			instructions:
				'Transfer to the account below and include your reference code so we can match your gift.',
			accounts: [
				{
					accountName: 'Shimeles Abera Foundation',
					accountNumber: '1000000000000',
					bankName: 'Commercial Bank of Ethiopia',
					branch: 'Addis Ababa',
					currency: 'ETB',
					isForDiaspora: false
				}
			]
		},
		{
			slug: 'telebirr',
			name: 'Telebirr',
			kind: 'mobile_money' as const,
			instructions: 'Send to the number below and include your reference code in the note.',
			accounts: [
				{
					accountName: 'Shimeles Abera Foundation',
					accountNumber: '0900000000',
					bankName: null,
					branch: null,
					currency: 'ETB',
					isForDiaspora: false
				}
			]
		},
		{
			slug: 'international-transfer',
			name: 'International transfer',
			kind: 'bank_transfer' as const,
			instructions:
				'For gifts from outside Ethiopia. Include your reference code on the transfer so we can match it.',
			accounts: [
				{
					accountName: 'Shimeles Abera Foundation',
					accountNumber: '2000000000000',
					bankName: 'Commercial Bank of Ethiopia',
					branch: 'Addis Ababa',
					swiftCode: 'CBETETAA',
					currency: 'USD',
					isForDiaspora: true
				}
			]
		}
	];

	for (const [index, method] of methods.entries()) {
		const [existing] = await db
			.select({ id: schema.paymentMethods.id })
			.from(schema.paymentMethods)
			.where(eq(schema.paymentMethods.slug, method.slug))
			.limit(1);

		let methodId = existing?.id;
		if (!methodId) {
			const [created] = await db
				.insert(schema.paymentMethods)
				.values({
					slug: method.slug,
					name: method.name,
					kind: method.kind,
					instructions: method.instructions,
					sortOrder: index
				})
				.returning({ id: schema.paymentMethods.id });
			methodId = created.id;
		}

		for (const [accountIndex, account] of method.accounts.entries()) {
			const found = await db
				.select({ id: schema.paymentAccounts.id })
				.from(schema.paymentAccounts)
				.where(eq(schema.paymentAccounts.accountNumber, account.accountNumber))
				.limit(1);
			if (found.length) continue;

			await db.insert(schema.paymentAccounts).values({
				paymentMethodId: methodId,
				accountName: account.accountName,
				accountNumber: account.accountNumber,
				bankName: account.bankName ?? null,
				branch: account.branch ?? null,
				swiftCode: 'swiftCode' in account ? (account.swiftCode as string) : null,
				currency: account.currency,
				isForDiaspora: account.isForDiaspora,
				sortOrder: accountIndex
			});
		}
	}

	console.log('✓ payment methods and accounts');
}

/* ==========================================================================
   External giving platforms
   ========================================================================== */

async function seedDonationCampaigns() {
	const campaigns = [
		{
			slug: 'paypal-general',
			name: 'Give with PayPal',
			description:
				'Card or PayPal balance, in USD. PayPal handles the payment and emails you a receipt.',
			companyName: 'PayPal',
			// An absolute URL rather than an upload: `assetUrl` passes these through,
			// so a platform's own hosted logo needs no file in `FILES_DIR`.
			companyLogo: 'https://www.paypalobjects.com/webstatic/mktg/Logo/pp-logo-200px.png',
			// The whole configuration is this link. `campaign_id` is parsed out of it
			// at render time — see `$lib/donations`.
			url: 'https://www.paypal.com/donate?campaign_id=994BYMK57DRRY',
			isPaypal: true,
			audience: 'diaspora' as const,
			currency: 'USD',
			buttonLabel: 'Donate with PayPal',
			isFeatured: true,
			sortOrder: 0
		},
		{
			slug: 'zeffy-donate-to-change-lives',
			name: 'Donate to change lives',
			description: 'Our Zeffy campaign page, with one-time and monthly options.',
			companyName: 'Zeffy',
			companyLogo: null,
			url: 'https://www.zeffy.com/en-US/donation-form/donate-to-change-lives-20492',
			isPaypal: false,
			audience: 'diaspora' as const,
			currency: 'USD',
			buttonLabel: 'Give through Zeffy',
			note: 'Zeffy charges nonprofits no platform fee, so more of your gift reaches the work.',
			isFeatured: false,
			sortOrder: 1
		}
	];

	for (const campaign of campaigns) {
		await db
			.insert(schema.donationCampaigns)
			.values(campaign)
			.onConflictDoNothing({ target: schema.donationCampaigns.slug });
	}

	console.log(`✓ ${campaigns.length} external giving platforms`);
}

/* ==========================================================================
   Safeguarding checklist
   ========================================================================== */

async function seedSafeguarding() {
	const items = [
		{ label: 'Identity document seen and recorded', professionalOnly: false },
		{ label: 'Two references contacted and satisfactory', professionalOnly: false },
		{ label: 'Safeguarding policy read and signed', professionalOnly: false },
		{ label: 'Code of conduct signed', professionalOnly: false },
		{ label: 'Induction and safeguarding briefing completed', professionalOnly: false },
		{ label: 'Police clearance certificate seen', professionalOnly: false },
		{
			label: 'Professional licence verified with the issuing body',
			professionalOnly: true,
			description:
				'Required only where a volunteer claims medical or mental-health credentials, and required before any placement involving direct care.'
		}
	];

	for (const [index, item] of items.entries()) {
		const existing = await db
			.select({ id: schema.volunteerSafeguardingChecklistItems.id })
			.from(schema.volunteerSafeguardingChecklistItems)
			.where(eq(schema.volunteerSafeguardingChecklistItems.label, item.label))
			.limit(1);
		if (existing.length) continue;

		await db.insert(schema.volunteerSafeguardingChecklistItems).values({
			label: item.label,
			description: 'description' in item ? item.description! : null,
			professionalOnly: item.professionalOnly,
			sortOrder: index
		});
	}

	console.log('✓ safeguarding checklist');
}

/* ==========================================================================
   Volunteer catalogues — skills, time slots, professions
   ========================================================================== */

/**
 * The vocabulary the volunteer form offers.
 *
 * These are the rows that keep `/volunteer` from needing a deploy every time
 * the Foundation starts doing something new: a skill, a shift or a profession
 * added from Configuration appears on the public form on the next request.
 * Seeded once, keyed on slug, and never updated afterwards — a coordinator who
 * renames "Saturday distribution" must not have it renamed back.
 */
async function seedVolunteerCatalog() {
	const categories = [
		{
			slug: 'care-and-companionship',
			name: 'Care and companionship',
			icon: 'HeartHandshake',
			description: 'Being with people. Most of what we actually ask for.'
		},
		{
			slug: 'health',
			name: 'Health',
			icon: 'Stethoscope',
			description: 'Clinical and health-adjacent work. Some of this needs a licence.'
		},
		{
			slug: 'education',
			name: 'Education and mentoring',
			icon: 'GraduationCap'
		},
		{
			slug: 'practical',
			name: 'Practical and logistics',
			icon: 'Truck'
		},
		{
			slug: 'professional-services',
			name: 'Professional services',
			icon: 'Briefcase',
			description: 'Skills you would normally be paid for.'
		},
		{ slug: 'languages', name: 'Languages and communication', icon: 'Languages' }
	];

	for (const [index, category] of categories.entries()) {
		await db
			.insert(schema.volunteerSkillCategories)
			.values({ ...category, sortOrder: index })
			.onConflictDoNothing({ target: schema.volunteerSkillCategories.slug });
	}

	const categoryIds = new Map(
		(
			await db
				.select({
					id: schema.volunteerSkillCategories.id,
					slug: schema.volunteerSkillCategories.slug
				})
				.from(schema.volunteerSkillCategories)
		).map((row) => [row.slug, row.id])
	);

	const skills: {
		slug: string;
		name: string;
		category: string;
		hint?: string;
		requiresCredential?: boolean;
	}[] = [
		// Care and companionship
		{ slug: 'elder-visiting', name: 'Visiting elders', category: 'care-and-companionship' },
		{
			slug: 'hospital-companionship',
			name: 'Sitting with patients',
			category: 'care-and-companionship',
			hint: 'Company during long hospital stays, including overnight.'
		},
		{
			slug: 'bereavement-support',
			name: 'Bereavement support',
			category: 'care-and-companionship'
		},
		{
			slug: 'home-visits',
			name: 'Home visits and welfare checks',
			category: 'care-and-companionship'
		},
		{
			slug: 'child-befriending',
			name: 'Working with children',
			category: 'care-and-companionship'
		},

		// Health
		{
			slug: 'nursing-care',
			name: 'Nursing care',
			category: 'health',
			requiresCredential: true,
			hint: 'Wound care, medication, observations.'
		},
		{
			slug: 'clinical-consultation',
			name: 'Medical consultation',
			category: 'health',
			requiresCredential: true
		},
		{
			slug: 'counselling',
			name: 'Counselling and talk therapy',
			category: 'health',
			requiresCredential: true,
			hint: 'Structured therapeutic work, not a friendly ear.'
		},
		{
			slug: 'psychiatric-support',
			name: 'Psychiatric assessment',
			category: 'health',
			requiresCredential: true
		},
		{
			slug: 'physiotherapy',
			name: 'Physiotherapy',
			category: 'health',
			requiresCredential: true
		},
		{
			slug: 'first-aid',
			name: 'First aid',
			category: 'health',
			hint: 'Certificate, not a licence.'
		},
		{ slug: 'health-education', name: 'Health awareness sessions', category: 'health' },

		// Education
		{ slug: 'tutoring-primary', name: 'Tutoring, primary', category: 'education' },
		{ slug: 'tutoring-secondary', name: 'Tutoring, secondary', category: 'education' },
		{ slug: 'exam-preparation', name: 'Exam preparation', category: 'education' },
		{ slug: 'mentoring', name: 'Mentoring a young person', category: 'education' },
		{ slug: 'literacy', name: 'Adult literacy', category: 'education' },
		{ slug: 'computer-skills', name: 'Teaching computer skills', category: 'education' },

		// Practical
		{
			slug: 'driving',
			name: 'Driving',
			category: 'practical',
			hint: 'You will be asked for a licence.'
		},
		{ slug: 'distribution', name: 'Distribution days', category: 'practical' },
		{ slug: 'packing', name: 'Packing and sorting', category: 'practical' },
		{ slug: 'cooking', name: 'Cooking for events', category: 'practical' },
		{ slug: 'event-setup', name: 'Event setup', category: 'practical' },
		{ slug: 'home-repairs', name: 'Repairs and maintenance', category: 'practical' },

		// Professional services
		{ slug: 'accounting', name: 'Accounting and bookkeeping', category: 'professional-services' },
		{
			slug: 'legal-advice',
			name: 'Legal advice',
			category: 'professional-services',
			requiresCredential: true
		},
		{ slug: 'photography', name: 'Photography and video', category: 'professional-services' },
		{ slug: 'graphic-design', name: 'Design', category: 'professional-services' },
		{ slug: 'web-development', name: 'Web and software', category: 'professional-services' },
		{ slug: 'social-media', name: 'Social media', category: 'professional-services' },
		{ slug: 'fundraising', name: 'Fundraising', category: 'professional-services' },
		{ slug: 'grant-writing', name: 'Grant writing', category: 'professional-services' },
		{ slug: 'admin-support', name: 'Office and admin support', category: 'professional-services' },

		// Languages
		{ slug: 'amharic', name: 'Amharic', category: 'languages' },
		{ slug: 'afaan-oromo', name: 'Afaan Oromo', category: 'languages' },
		{ slug: 'tigrinya', name: 'Tigrinya', category: 'languages' },
		{ slug: 'somali', name: 'Somali', category: 'languages' },
		{ slug: 'english', name: 'English', category: 'languages' },
		{ slug: 'arabic', name: 'Arabic', category: 'languages' },
		{ slug: 'sign-language', name: 'Ethiopian sign language', category: 'languages' },
		{ slug: 'translation', name: 'Translation and interpreting', category: 'languages' }
	];

	for (const [index, skill] of skills.entries()) {
		await db
			.insert(schema.volunteerSkills)
			.values({
				slug: skill.slug,
				name: skill.name,
				hint: skill.hint ?? null,
				requiresCredential: skill.requiresCredential ?? false,
				categoryId: categoryIds.get(skill.category) ?? null,
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.volunteerSkills.slug });
	}

	// A weekday-morning / afternoon / evening grid plus the weekend, which is
	// when most of the work actually happens. `dayOfWeek` is 0 = Sunday.
	const DAYS = [
		{ index: 1, name: 'Monday' },
		{ index: 2, name: 'Tuesday' },
		{ index: 3, name: 'Wednesday' },
		{ index: 4, name: 'Thursday' },
		{ index: 5, name: 'Friday' },
		{ index: 6, name: 'Saturday' },
		{ index: 0, name: 'Sunday' }
	];

	const PARTS = [
		{ key: 'morning', label: 'Morning', start: '08:00', end: '12:00' },
		{ key: 'afternoon', label: 'Afternoon', start: '12:00', end: '17:00' },
		{ key: 'evening', label: 'Evening', start: '17:00', end: '20:00' }
	];

	const slots = DAYS.flatMap((day) =>
		PARTS.map((part) => ({
			slug: `${day.name.toLowerCase()}-${part.key}`,
			label: part.label,
			dayOfWeek: day.index,
			startTime: part.start,
			endTime: part.end,
			description: null as string | null
		}))
	);

	// Two dayless slots, for the volunteers whose usefulness is not a weekday.
	slots.push(
		{
			slug: 'on-call',
			label: 'On call',
			dayOfWeek: null as never,
			startTime: null as never,
			endTime: null as never,
			description: 'Ring me when something comes up and I will come if I can.'
		},
		{
			slug: 'flexible',
			label: 'Flexible',
			dayOfWeek: null as never,
			startTime: null as never,
			endTime: null as never,
			description: 'My hours move around; ask me.'
		}
	);

	for (const [index, slot] of slots.entries()) {
		await db
			.insert(schema.volunteerTimeSlots)
			.values({ ...slot, sortOrder: index })
			.onConflictDoNothing({ target: schema.volunteerTimeSlots.slug });
	}

	const HEALTH_AUTHORITY = 'Ethiopian Food and Drug Authority';
	const professions = [
		{ slug: 'general-practitioner', name: 'General practitioner', category: 'medical' as const },
		{ slug: 'specialist-physician', name: 'Specialist physician', category: 'medical' as const },
		{ slug: 'surgeon', name: 'Surgeon', category: 'medical' as const },
		{ slug: 'paediatrician', name: 'Paediatrician', category: 'medical' as const },
		{ slug: 'nurse', name: 'Nurse', category: 'medical' as const },
		{ slug: 'midwife', name: 'Midwife', category: 'medical' as const },
		{ slug: 'pharmacist', name: 'Pharmacist', category: 'medical' as const },
		{ slug: 'dentist', name: 'Dentist', category: 'medical' as const },
		{ slug: 'optometrist', name: 'Optometrist', category: 'medical' as const },
		{ slug: 'psychiatrist', name: 'Psychiatrist', category: 'mental_health' as const },
		{
			slug: 'clinical-psychologist',
			name: 'Clinical psychologist',
			category: 'mental_health' as const
		},
		{ slug: 'counsellor', name: 'Counsellor', category: 'mental_health' as const },
		{ slug: 'psychiatric-nurse', name: 'Psychiatric nurse', category: 'mental_health' as const },
		{ slug: 'social-worker', name: 'Social worker', category: 'mental_health' as const },
		{ slug: 'physiotherapist', name: 'Physiotherapist', category: 'allied_health' as const },
		{
			slug: 'occupational-therapist',
			name: 'Occupational therapist',
			category: 'allied_health' as const
		},
		{ slug: 'nutritionist', name: 'Nutritionist or dietitian', category: 'allied_health' as const },
		{
			slug: 'laboratory-technologist',
			name: 'Laboratory technologist',
			category: 'allied_health' as const
		},
		{ slug: 'radiographer', name: 'Radiographer', category: 'allied_health' as const },
		{
			slug: 'health-officer',
			name: 'Health officer',
			category: 'public_health' as const
		},
		{
			slug: 'community-health-worker',
			name: 'Community health worker',
			category: 'public_health' as const,
			// Trained, but not licensed — the one row where the licence fields
			// are genuinely optional.
			requiresLicense: false
		},
		{
			slug: 'lawyer',
			name: 'Lawyer',
			category: 'other' as const,
			licensingBody: 'Federal Ministry of Justice'
		}
	];

	for (const [index, profession] of professions.entries()) {
		await db
			.insert(schema.volunteerProfessions)
			.values({
				slug: profession.slug,
				name: profession.name,
				category: profession.category,
				requiresLicense: 'requiresLicense' in profession ? profession.requiresLicense! : true,
				defaultLicensingBody:
					'licensingBody' in profession ? profession.licensingBody! : HEALTH_AUTHORITY,
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.volunteerProfessions.slug });
	}

	console.log(
		`✓ volunteer catalogue: ${skills.length} skills, ${slots.length} time slots, ${professions.length} professions`
	);
}

/* ==========================================================================
   Apply — languages and the kinds of help people ask for
   ========================================================================== */

/**
 * The vocabulary behind `/apply`.
 *
 * `languages` is what an applicant's own words are written in, not a UI
 * language — v1 renders in English only. It exists so someone told to write in
 * whatever language they are comfortable in does not then land with a
 * caseworker who cannot read it.
 *
 * The needs list is what makes "how many families are asking for school fees
 * this term" a query. Each need can name the pillar it routes to, so an
 * applicant never has to work out which of four programmes owns their problem.
 */
async function seedApply() {
	const languageRows = [
		{ slug: 'amharic', name: 'Amharic', nativeName: 'አማርኛ' },
		{ slug: 'afaan-oromo', name: 'Afaan Oromo', nativeName: 'Afaan Oromoo' },
		{ slug: 'tigrinya', name: 'Tigrinya', nativeName: 'ትግርኛ' },
		{ slug: 'somali', name: 'Somali', nativeName: 'Soomaali' },
		{ slug: 'afar', name: 'Afar', nativeName: 'Qafar af' },
		{ slug: 'sidamo', name: 'Sidamo', nativeName: 'Sidaamu afoo' },
		{ slug: 'wolaytta', name: 'Wolaytta', nativeName: 'Wolaittattuwa' },
		{ slug: 'english', name: 'English', nativeName: 'English' },
		{ slug: 'arabic', name: 'Arabic', nativeName: 'العربية' }
	];

	for (const [index, language] of languageRows.entries()) {
		await db
			.insert(schema.languages)
			.values({ ...language, sortOrder: index })
			.onConflictDoNothing({ target: schema.languages.slug });
	}

	const categories = [
		{
			slug: 'health',
			name: 'Health and medical',
			icon: 'Stethoscope',
			description: 'Treatment, medicine, and getting to it.'
		},
		{ slug: 'daily-living', name: 'Daily living', icon: 'Home' },
		{ slug: 'education', name: 'School and learning', icon: 'GraduationCap' },
		{ slug: 'wellbeing', name: 'Mental health and wellbeing', icon: 'HeartPulse' },
		{ slug: 'elder', name: 'Care for an older person', icon: 'HandHeart' }
	];

	for (const [index, category] of categories.entries()) {
		await db
			.insert(schema.assistanceNeedCategories)
			.values({ ...category, sortOrder: index })
			.onConflictDoNothing({ target: schema.assistanceNeedCategories.slug });
	}

	const categoryIds = new Map(
		(
			await db
				.select({
					id: schema.assistanceNeedCategories.id,
					slug: schema.assistanceNeedCategories.slug
				})
				.from(schema.assistanceNeedCategories)
		).map((row) => [row.slug, row.id])
	);

	const pillarIds = new Map(
		(
			await db.select({ id: schema.pillars.id, slug: schema.pillars.slug }).from(schema.pillars)
		).map((row) => [row.slug, row.id])
	);

	const needs: {
		slug: string;
		name: string;
		category: string;
		pillar?: string;
		description?: string;
		evidenceHint?: string;
	}[] = [
		// Health
		{
			slug: 'medicine',
			name: 'Medicine or prescriptions',
			category: 'health',
			pillar: 'medical-hardship',
			evidenceHint: 'A prescription or a photograph of one'
		},
		{
			slug: 'hospital-bill',
			name: 'A hospital bill',
			category: 'health',
			pillar: 'medical-hardship',
			evidenceHint: 'The bill or estimate from the hospital'
		},
		{
			slug: 'surgery',
			name: 'Surgery or a procedure',
			category: 'health',
			pillar: 'medical-hardship',
			evidenceHint: 'A letter from the doctor saying what is needed'
		},
		{
			slug: 'diagnostics',
			name: 'Tests or scans',
			category: 'health',
			pillar: 'medical-hardship'
		},
		{
			slug: 'chronic-care',
			name: 'Ongoing treatment for a long-term illness',
			category: 'health',
			pillar: 'medical-hardship'
		},
		{
			slug: 'medical-equipment',
			name: 'Equipment: a wheelchair, crutches, glasses',
			category: 'health',
			pillar: 'medical-hardship'
		},
		{
			slug: 'transport-to-treatment',
			name: 'Getting to treatment',
			category: 'health',
			pillar: 'medical-hardship',
			description: 'Transport to a hospital or clinic, including from outside Addis.'
		},

		// Daily living
		{ slug: 'food', name: 'Food', category: 'daily-living' },
		{ slug: 'rent', name: 'Rent or somewhere to stay', category: 'daily-living' },
		{ slug: 'utilities', name: 'Water or electricity', category: 'daily-living' },
		{ slug: 'clothing', name: 'Clothes or bedding', category: 'daily-living' },
		{
			slug: 'funeral',
			name: 'Funeral costs',
			category: 'daily-living'
		},

		// Education
		{
			slug: 'school-fees',
			name: 'School fees',
			category: 'education',
			pillar: 'youth-education',
			evidenceHint: 'A fee statement or letter from the school'
		},
		{
			slug: 'school-materials',
			name: 'Books, uniform or materials',
			category: 'education',
			pillar: 'youth-education'
		},
		{
			slug: 'exam-fees',
			name: 'Exam or registration fees',
			category: 'education',
			pillar: 'youth-education'
		},
		{
			slug: 'tutoring',
			name: 'Tutoring or extra help with study',
			category: 'education',
			pillar: 'youth-education'
		},
		{
			slug: 'university-support',
			name: 'University or college costs',
			category: 'education',
			pillar: 'youth-education'
		},

		// Wellbeing
		{
			slug: 'counselling',
			name: 'Someone to talk to',
			category: 'wellbeing',
			pillar: 'mental-wellness',
			description: 'Counselling or ongoing support. You do not have to explain why here.'
		},
		{
			slug: 'psychiatric-care',
			name: 'Psychiatric care or medication',
			category: 'wellbeing',
			pillar: 'mental-wellness'
		},
		{
			slug: 'bereavement',
			name: 'Support after losing someone',
			category: 'wellbeing',
			pillar: 'mental-wellness'
		},

		// Elder
		{
			slug: 'elder-visits',
			name: 'Someone to visit regularly',
			category: 'elder',
			pillar: 'elder-care'
		},
		{
			slug: 'elder-home-help',
			name: 'Help around the house',
			category: 'elder',
			pillar: 'elder-care'
		},
		{
			slug: 'elder-essentials',
			name: 'Food or essentials for an older person',
			category: 'elder',
			pillar: 'elder-care'
		}
	];

	for (const [index, need] of needs.entries()) {
		await db
			.insert(schema.assistanceNeeds)
			.values({
				slug: need.slug,
				name: need.name,
				description: need.description ?? null,
				evidenceHint: need.evidenceHint ?? null,
				categoryId: categoryIds.get(need.category) ?? null,
				pillarId: need.pillar ? (pillarIds.get(need.pillar) ?? null) : null,
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.assistanceNeeds.slug });
	}

	// The form definition an application with no pillar lands against. It is a
	// real `form_definitions` row because `form_submissions.form_definition_id`
	// is NOT NULL and the case screens join through it — but it carries no
	// fields, because `/apply` asks the questions itself.
	await db
		.insert(schema.formDefinitions)
		.values({
			slug: 'assistance-application',
			name: 'Assistance application',
			pillarId: null,
			title: 'Apply for support',
			introText: 'For yourself, or for someone you are looking out for.',
			successMessage:
				'We have your application. Someone will read it and be in touch. Please keep your reference number.',
			requiresDocuments: false,
			isLowBarrier: true,
			// `/apply` sends its own, more specific acknowledgement from its own
			// route, so this must stay off or an applicant gets two emails.
			acknowledgeSubmitter: false,
			referencePrefix: 'APP',
			statusContext: 'application',
			sortOrder: 0
		})
		.onConflictDoNothing({ target: schema.formDefinitions.slug });

	console.log(`✓ apply: ${languageRows.length} languages, ${needs.length} kinds of help`);
}

/* ==========================================================================
   In-kind giving — the catalogue of goods the Foundation will take
   ========================================================================== */

/**
 * What somebody may offer on the donate page, and the extra questions each
 * kind of thing brings with it.
 *
 * The `requires*` flags are the point: food asks for a use-by date, clothing
 * asks for sizes, furniture warns that a collection needs a vehicle. Adding a
 * category tomorrow adds its questions with it, with no change to the form.
 * Seeded once, keyed on slug, so a staff member's edits survive a re-run.
 */
async function seedInKindCategories() {
	const pillarIds = new Map(
		(
			await db.select({ id: schema.pillars.id, slug: schema.pillars.slug }).from(schema.pillars)
		).map((row) => [row.slug, row.id])
	);

	const categories: {
		slug: string;
		name: string;
		icon: string;
		description?: string;
		pillar?: string;
		defaultUnit?: string;
		requiresExpiry?: boolean;
		requiresSizing?: boolean;
		requiresTransport?: boolean;
		acceptanceNote?: string;
	}[] = [
		{
			slug: 'clothing',
			name: 'Clothing',
			icon: 'Shirt',
			description: 'Coats, jumpers, trousers, dresses, school-age and adult.',
			defaultUnit: 'bags',
			requiresSizing: true,
			acceptanceNote: 'Clean and wearable, please. Anything torn or stained we cannot pass on.'
		},
		{
			slug: 'shoes',
			name: 'Shoes and sandals',
			icon: 'Footprints',
			defaultUnit: 'pairs',
			requiresSizing: true,
			acceptanceNote: 'Pairs with sound soles. Odd shoes cannot be given to anybody.'
		},
		{
			slug: 'bedding',
			name: 'Blankets and bedding',
			icon: 'BedDouble',
			description: 'Blankets, sheets, mosquito nets, mattresses.',
			defaultUnit: 'items',
			requiresTransport: true
		},
		{
			slug: 'baby-supplies',
			name: 'Baby and infant supplies',
			icon: 'Baby',
			description: 'Nappies, formula, baby clothes, carriers.',
			defaultUnit: 'packs',
			requiresExpiry: true,
			requiresSizing: true,
			acceptanceNote:
				'Formula must be sealed and in date. Second-hand cots and car seats we cannot accept.'
		},
		{
			slug: 'dry-food',
			name: 'Food, dry and packaged',
			icon: 'Wheat',
			description: 'Teff, rice, oil, pulses, tinned and packaged food.',
			defaultUnit: 'sacks',
			requiresExpiry: true,
			acceptanceNote: 'Sealed, with at least three months before the use-by date.'
		},
		{
			slug: 'fresh-food',
			name: 'Food, fresh and prepared',
			icon: 'Apple',
			description: 'Vegetables, fruit, dairy, cooked meals for an event.',
			defaultUnit: 'kg',
			requiresExpiry: true,
			acceptanceNote:
				'Collected the same day and distributed immediately. Tell us when it is ready.'
		},
		{
			slug: 'hygiene',
			name: 'Hygiene and sanitary supplies',
			icon: 'Droplets',
			description: 'Soap, detergent, sanitary pads, toothpaste, nappies.',
			defaultUnit: 'boxes',
			requiresExpiry: true
		},
		{
			slug: 'school-supplies',
			name: 'School supplies',
			icon: 'GraduationCap',
			description: 'Exercise books, pens, bags, uniforms, calculators.',
			pillar: 'youth-education',
			defaultUnit: 'boxes',
			requiresSizing: true
		},
		{
			slug: 'books',
			name: 'Books and learning materials',
			icon: 'BookOpen',
			pillar: 'youth-education',
			defaultUnit: 'boxes'
		},
		{
			slug: 'electronics',
			name: 'Computers and electronics',
			icon: 'Laptop',
			description: 'Laptops, tablets, printers, projectors.',
			pillar: 'youth-education',
			defaultUnit: 'items',
			acceptanceNote: 'Working, with a charger. Please wipe personal data before handing it over.'
		},
		{
			slug: 'phones',
			name: 'Phones and accessories',
			icon: 'Smartphone',
			defaultUnit: 'items',
			acceptanceNote: 'Unlocked and factory reset, please.'
		},
		{
			slug: 'furniture',
			name: 'Furniture',
			icon: 'Armchair',
			description: 'Chairs, tables, desks, shelving, wardrobes.',
			defaultUnit: 'items',
			requiresTransport: true,
			acceptanceNote: 'We collect furniture ourselves. Tell us about stairs and access.'
		},
		{
			slug: 'appliances',
			name: 'Appliances',
			icon: 'Refrigerator',
			description: 'Fridges, stoves, fans, water heaters.',
			defaultUnit: 'items',
			requiresTransport: true,
			acceptanceNote: 'In working order. We cannot take anything that needs a repair first.'
		},
		{
			slug: 'kitchenware',
			name: 'Kitchen and household goods',
			icon: 'CookingPot',
			description: 'Pots, plates, jerrycans, cleaning equipment.',
			defaultUnit: 'boxes'
		},
		{
			slug: 'medical-supplies',
			name: 'Medical supplies',
			icon: 'Stethoscope',
			description: 'Dressings, gloves, thermometers, diagnostic equipment.',
			pillar: 'medical-hardship',
			defaultUnit: 'boxes',
			requiresExpiry: true,
			acceptanceNote:
				'Sealed and in date. Prescription medicine can only be accepted from a licensed supplier.'
		},
		{
			slug: 'mobility-aids',
			name: 'Mobility and assistive devices',
			icon: 'Accessibility',
			description: 'Wheelchairs, crutches, walking frames, hearing aids, glasses.',
			pillar: 'elder-care',
			defaultUnit: 'items',
			requiresTransport: true
		},
		{
			slug: 'elder-comfort',
			name: 'Comfort items for elders',
			icon: 'HandHeart',
			description: 'Warm clothing, shawls, heaters, easy-chairs.',
			pillar: 'elder-care',
			defaultUnit: 'items'
		},
		{
			slug: 'toys-play',
			name: 'Toys, games and sports equipment',
			icon: 'ToyBrick',
			defaultUnit: 'boxes',
			acceptanceNote:
				'Complete sets, please. A puzzle with pieces missing disappoints a child twice.'
		},
		{
			slug: 'building-materials',
			name: 'Building and repair materials',
			icon: 'Hammer',
			description: 'Corrugated sheets, cement, timber, paint, tools.',
			defaultUnit: 'items',
			requiresTransport: true
		},
		{
			slug: 'agricultural',
			name: 'Seeds, tools and livestock feed',
			icon: 'Sprout',
			defaultUnit: 'sacks',
			requiresExpiry: true
		},
		{
			slug: 'fuel-transport',
			name: 'Fuel, transport and vehicle use',
			icon: 'Truck',
			description: 'A vehicle for a collection day, fuel vouchers, a driver.',
			defaultUnit: 'days'
		},
		{
			slug: 'venue-space',
			name: 'Space and venue',
			icon: 'Warehouse',
			description: 'Storage, a hall for a session, an office desk.',
			defaultUnit: 'days'
		},
		{
			slug: 'professional-services',
			name: 'Professional services, given free',
			icon: 'BriefcaseBusiness',
			description: 'Legal, medical, counselling, accounting, translation, training.',
			defaultUnit: 'hours',
			acceptanceNote:
				'Clinical and counselling work goes through the same safeguarding checks as volunteering.'
		},
		{
			slug: 'printing-media',
			name: 'Printing, design and media',
			icon: 'Printer',
			description: 'Printing a run of leaflets, photography, a website, translation.',
			defaultUnit: 'jobs'
		},
		{
			slug: 'event-support',
			name: 'Event support',
			icon: 'PartyPopper',
			description: 'Catering, tents and chairs, sound equipment for a community day.',
			defaultUnit: 'events'
		},
		{
			slug: 'land',
			name: 'Land and property',
			icon: 'LandPlot',
			description: 'A plot, a building, or a long lease given to the Foundation.',
			defaultUnit: 'plots',
			requiresTransport: false,
			acceptanceNote:
				'A gift of land or property is handled by the Foundation directly rather than ' +
				'through a collection. Register it here and a coordinator will call to go through ' +
				'title, transfer and the legal work before anything is agreed.'
		},
		{
			slug: 'machinery',
			name: 'Machinery and heavy equipment',
			icon: 'Tractor',
			description: 'Generators, pumps, workshop and farm machinery, vehicles.',
			defaultUnit: 'units',
			requiresTransport: true,
			acceptanceNote:
				'Tell us the make, model and working condition. Anything powered is inspected ' +
				'before it is accepted, and moving it needs a vehicle we have to book.'
		},
		{
			slug: 'other-goods',
			name: 'Something else',
			icon: 'Package',
			description: 'Not on this list? Describe it and we will tell you if we can use it.',
			defaultUnit: 'items'
		}
	];

	for (const [index, category] of categories.entries()) {
		await db
			.insert(schema.inKindCategories)
			.values({
				slug: category.slug,
				name: category.name,
				description: category.description ?? null,
				icon: category.icon,
				pillarId: category.pillar ? (pillarIds.get(category.pillar) ?? null) : null,
				defaultUnit: category.defaultUnit ?? 'items',
				requiresExpiry: category.requiresExpiry ?? false,
				requiresSizing: category.requiresSizing ?? false,
				requiresTransport: category.requiresTransport ?? false,
				acceptanceNote: category.acceptanceNote ?? null,
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.inKindCategories.slug });
	}

	console.log(`✓ in-kind: ${categories.length} kinds of gift`);
}

/* ==========================================================================
   Contact — enquiry topics and offices
   ========================================================================== */

/**
 * The topics `/contact` offers and the address beside the form.
 *
 * Each topic carries its own routing, so redirecting press enquiries to the
 * communications lead is an edit on the Enquiry topics screen rather than a
 * code change. Seeded once, keyed on slug; a staff member's edits survive a
 * re-run like every other catalogue here.
 */
async function seedContact() {
	const bySlug = new Map(
		(
			await db.select({ id: schema.pillars.id, slug: schema.pillars.slug }).from(schema.pillars)
		).map((row) => [row.slug, row.id])
	);

	const subjects: {
		slug: string;
		name: string;
		description?: string;
		icon?: string;
		targetResponseHours?: number;
		publicResponseNote?: string;
		suggestedPillarSlug?: string;
	}[] = [
		{
			slug: 'general',
			name: 'General question',
			icon: 'MessageSquare',
			targetResponseHours: 72,
			publicResponseNote: 'We usually reply within three working days.'
		},
		{
			slug: 'support',
			name: 'I need help',
			description:
				'If you are asking for assistance for yourself or someone you know, the application form reaches the team that can act on it.',
			icon: 'HandHeart',
			targetResponseHours: 24,
			publicResponseNote:
				'We treat these as urgent and will come back to you within a working day.',
			// The Foundation's front door for hardship. Deliberately pointed at
			// rather than silently converted into an application.
			suggestedPillarSlug: 'medical-hardship'
		},
		{
			slug: 'donating',
			name: 'Donating or fundraising',
			icon: 'HeartHandshake',
			targetResponseHours: 48
		},
		{
			slug: 'volunteering',
			name: 'Volunteering',
			description: 'Questions about volunteering. To apply, use the volunteer form.',
			icon: 'Users',
			targetResponseHours: 72
		},
		{
			slug: 'partnership',
			name: 'Partnership',
			icon: 'Handshake',
			targetResponseHours: 72
		},
		{ slug: 'press', name: 'Press and media', icon: 'Newspaper', targetResponseHours: 24 },
		{
			slug: 'safeguarding',
			name: 'A safeguarding concern',
			description:
				'Anything about the conduct of someone connected to the Foundation. Read by a senior staff member, not the general inbox.',
			icon: 'ShieldAlert',
			targetResponseHours: 24,
			publicResponseNote: 'This goes straight to a senior staff member and is treated as urgent.'
		},
		{ slug: 'other', name: 'Something else', icon: 'CircleEllipsis' }
	];

	for (const [index, subject] of subjects.entries()) {
		await db
			.insert(schema.contactSubjects)
			.values({
				slug: subject.slug,
				name: subject.name,
				description: subject.description ?? null,
				icon: subject.icon ?? null,
				targetResponseHours: subject.targetResponseHours ?? null,
				publicResponseNote: subject.publicResponseNote ?? null,
				suggestedPillarId: subject.suggestedPillarSlug
					? (bySlug.get(subject.suggestedPillarSlug) ?? null)
					: null,
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.contactSubjects.slug });
	}

	// One office, built from the `contact.*` settings so a fresh install shows
	// the same address on the page whichever of the two it reads.
	const [defaultRegion] = await db
		.select({ id: schema.regions.id })
		.from(schema.regions)
		.where(eq(schema.regions.isDefault, true))
		.limit(1);

	await db
		.insert(schema.contactOffices)
		.values({
			slug: 'head-office',
			name: 'Head office',
			addressLine: 'Bole',
			city: 'Addis Ababa',
			regionId: defaultRegion?.id ?? null,
			phone: '+251 91 234 5678',
			email: 'hello@saf.org',
			openingHours: 'Monday to Friday, 9am to 5pm',
			isPrimary: true,
			sortOrder: 0
		})
		.onConflictDoNothing({ target: schema.contactOffices.slug });

	// Messages carried over from `form_submissions` by migration 0012 arrive
	// with no status, because the status they had belonged to the application
	// vocabulary. Give them the default contact status now that one exists.
	const [defaultContactStatus] = await db
		.select({ id: schema.statusOptions.id })
		.from(schema.statusOptions)
		.where(
			sql`${schema.statusOptions.context} = 'contact' and ${schema.statusOptions.isDefault} = 1`
		)
		.limit(1);

	if (defaultContactStatus) {
		await db
			.update(schema.contactMessages)
			.set({ statusId: defaultContactStatus.id })
			.where(sql`${schema.contactMessages.statusId} is null`);
	}

	// Best-effort topic matching for those same migrated rows: the old form
	// stored a slug like "partner" in `subject_other`, and most of them line up
	// with a topic here. Anything that does not match keeps its free text.
	const legacy: Record<string, string> = {
		general: 'general',
		donate: 'donating',
		partner: 'partnership',
		press: 'press',
		other: 'other'
	};

	for (const [oldValue, newSlug] of Object.entries(legacy)) {
		const [subject] = await db
			.select({ id: schema.contactSubjects.id })
			.from(schema.contactSubjects)
			.where(eq(schema.contactSubjects.slug, newSlug))
			.limit(1);
		if (!subject) continue;

		await db
			.update(schema.contactMessages)
			.set({ subjectId: subject.id, subjectOther: null })
			.where(
				sql`${schema.contactMessages.subjectId} is null and ${schema.contactMessages.subjectOther} = ${oldValue}`
			);
	}

	console.log(`✓ contact: ${subjects.length} enquiry topics, 1 office`);
}

/* ==========================================================================
   Translations
   ========================================================================== */

async function seedTranslations() {
	const strings: { key: string; en: string; am?: string; group: string }[] = [
		{ key: 'form.submit', en: 'Submit', group: 'form' },
		{ key: 'form.sending', en: 'Sending', group: 'form' },
		{ key: 'form.your_name', en: 'Your name', group: 'form' },
		{ key: 'form.your_phone', en: 'Phone', group: 'form' },
		{ key: 'form.your_email', en: 'Email', group: 'form' },
		{ key: 'form.programme', en: 'Programme', group: 'form' },
		{
			key: 'form.thank_you',
			en: 'Thank you, we have your request',
			group: 'form'
		},
		{ key: 'form.your_reference', en: 'Your reference number', group: 'form' },
		{ key: 'form.reference_copied', en: 'Reference copied', group: 'form' },
		{
			key: 'form.reference_hint',
			en: 'Keep this number. Quote it when you contact us about this request.',
			group: 'form'
		},
		{
			key: 'form.low_barrier_title',
			en: 'No proof of need required',
			group: 'form'
		},
		{
			key: 'form.low_barrier_body',
			en: 'You do not have to upload documents or share contact details you would rather keep private. Tell us as much or as little as you want to.',
			group: 'form'
		},

		{ key: 'donate.title', en: 'Give', group: 'donate' },
		{ key: 'donate.form_title', en: 'Make a gift', group: 'donate' },
		{ key: 'donate.once', en: 'One-time', group: 'donate' },
		{ key: 'donate.monthly', en: 'Monthly', group: 'donate' },
		{
			key: 'donate.monthly_note',
			en: 'We will remind you each month. Bank transfers in Ethiopia cannot be charged automatically.',
			group: 'donate'
		},
		{ key: 'donate.amount', en: 'Amount', group: 'donate' },
		{ key: 'donate.designation', en: 'Where should it go?', group: 'donate' },
		{
			key: 'donate.general_fund',
			en: 'Where most needed',
			group: 'donate'
		},
		{ key: 'donate.method', en: 'How will you send it?', group: 'donate' },
		{ key: 'donate.name', en: 'Your name', group: 'donate' },
		{ key: 'donate.email', en: 'Email', group: 'donate' },
		{ key: 'donate.phone', en: 'Phone', group: 'donate' },
		{ key: 'donate.message', en: 'A message, if you would like', group: 'donate' },
		{
			key: 'donate.organisation',
			en: 'Organisation, if you are giving on its behalf',
			group: 'donate'
		},
		{
			key: 'donate.organisation_hint',
			en: 'A company, school, church or group',
			group: 'donate'
		},
		{ key: 'donate.is_diaspora', en: 'I am giving from outside Ethiopia', group: 'donate' },
		{ key: 'donate.country', en: 'Which country are you giving from?', group: 'donate' },
		{
			key: 'donate.anonymous',
			en: 'Keep my gift anonymous',
			group: 'donate'
		},
		{ key: 'donate.newsletter', en: 'Send me occasional updates', group: 'donate' },
		{ key: 'donate.submit', en: 'Give', group: 'donate' },

		// The help panel is the one place a visitor switches language, so these
		// three carry their Amharic. Everything above still renders `en`.
		{
			key: 'help.button',
			en: 'Not sure how this works?',
			am: 'እንዴት እንደሚሠራ አልገባዎትም?',
			group: 'help'
		},
		{ key: 'help.title', en: 'Questions people ask us', am: 'ሰዎች የሚጠይቁን ጥያቄዎች', group: 'help' },
		{
			key: 'help.footer',
			en: 'Still stuck? Write to us and a person will answer.',
			am: 'አሁንም ችግር አለ? ይጻፉልን፤ ሰው ይመልስልዎታል።',
			group: 'help'
		},
		{ key: 'donate.sending', en: 'Recording your gift', group: 'donate' },

		{ key: 'status.submitted', en: 'Submitted', group: 'status' },
		{ key: 'status.under_review', en: 'Under review', group: 'status' },
		{ key: 'status.approved', en: 'Approved', group: 'status' },

		{ key: 'nav.apply', en: 'Apply for support', group: 'nav' },
		{ key: 'nav.learn_more', en: 'Learn more', group: 'nav' }
	];

	for (const string of strings) {
		await db
			.insert(schema.translations)
			.values({ key: string.key, en: string.en, am: string.am ?? null, group: string.group })
			.onConflictDoNothing({ target: schema.translations.key });
	}

	console.log(`✓ ${strings.length} translations`);
}

/* ==========================================================================
   Media

   Registers the stock photography already sitting in `FILES_DIR` (see
   `.tempFiles/`) as public `files` rows, then hangs them off the pillars,
   future initiatives, pages and hero setting that currently render with no
   picture at all. Two of the source images carried a visible third-party
   watermark (Getty, and a GPE/Kelley Lynch photo credit) and are deliberately
   left out — a charity site cannot publish those without a licence.

   Every placement below only writes when the target column is still empty,
   the same "seed once, never clobber a staff edit" rule the rest of this file
   follows.
   ========================================================================== */

const FILES_DIR = process.env.FILES_DIR ?? '.tempFiles';

/* ==========================================================================
   Help panel

   The questions the donate page kept being asked out loud. Seeded rather than
   written into the component so a fundraiser can rewrite an answer the same
   afternoon somebody misreads it (§0).

   The Amharic here is a first draft and should be read by a native speaker
   before anyone treats it as final — but a blank column shows nobody the
   language switch at all, and these are the sentences a confused donor is most
   likely to need in their own language.
   ========================================================================== */

async function seedHelpTopics() {
	const topics: {
		question: string;
		questionAm: string;
		answer: string;
		answerAm: string;
	}[] = [
		{
			question: 'Does this page take my money now?',
			questionAm: 'ገንዘቤ አሁን በዚህ ገጽ ላይ ይከፈላል?',
			answer:
				'No. The form records your gift and gives you a reference number. You then make the ' +
				'transfer yourself, at the bank or from your phone, using that reference.',
			answerAm:
				'አይደለም። ቅጹ ስጦታዎን መዝግቦ የማመሳከሪያ ቁጥር ይሰጥዎታል። ከዚያ ዝውውሩን እርስዎ ራስዎ በባንክ ወይም በስልክዎ ' +
				'ያንን ማመሳከሪያ ቁጥር ተጠቅመው ያደርጋሉ።'
		},
		{
			question: 'What is the reference number for?',
			questionAm: 'የማመሳከሪያ ቁጥሩ ለምንድን ነው?',
			answer:
				'It is how we match your transfer to your name. Write it in the reason or note field ' +
				'when you transfer. Without it your gift still arrives, but it may take us longer to ' +
				'thank you for it.',
			answerAm:
				'ዝውውርዎን ከስምዎ ጋር የምናገናኝበት ነው። ገንዘብ ሲልኩ በምክንያት ወይም በማስታወሻ ሳጥኑ ውስጥ ይጻፉት። ' +
				'ባይኖርም ስጦታዎ ይደርሳል፤ ነገር ግን ልናመሰግንዎት ረዘም ያለ ጊዜ ሊወስድብን ይችላል።'
		},
		{
			question: 'I chose monthly. Will I be charged automatically?',
			questionAm: 'በየወሩ የሚል መርጫለሁ። በራሱ ይቆረጣል?',
			answer:
				'No. Bank transfers in Ethiopia cannot be charged automatically. Monthly means we send ' +
				'you a reminder each month, and each transfer stays your own decision.',
			answerAm:
				'አይቆረጥም። በኢትዮጵያ የባንክ ዝውውር በራሱ ሊቆረጥ አይችልም። በየወሩ ማለት በየወሩ ማስታወሻ እንልክልዎታለን ማለት ነው፤ ' +
				'እያንዳንዱ ዝውውር የእርስዎው ውሳኔ ሆኖ ይቀጥላል።'
		},
		{
			question: 'I closed the page before transferring. Is my reference lost?',
			questionAm: 'ሳልልክ ገጹን ዘጋሁት። ማመሳከሪያዬ ጠፍቷል?',
			answer:
				'No. Reopen this page on the same device within a week and your last reference comes ' +
				'back at the top. If it does not, write to us and we will find it.',
			answerAm:
				'አልጠፋም። በተመሳሳይ መሣሪያ በአንድ ሳምንት ውስጥ ይህን ገጽ እንደገና ሲከፍቱ የመጨረሻው ማመሳከሪያዎ ከላይ ይመለሳል። ' +
				'ካልተመለሰ ይጻፉልን፤ እኛ እናገኘዋለን።'
		},
		{
			question: 'Can I give clothes, food or medicine instead of money?',
			questionAm: 'ከገንዘብ ይልቅ ልብስ፣ ምግብ ወይም መድኃኒት መስጠት እችላለሁ?',
			answer:
				'Yes. Choose "Give goods" at the top of this page and tell us what you have. We will ' +
				'arrange collection or a drop-off with you.',
			answerAm:
				'ይችላሉ። ከዚህ ገጽ ላይኛው ክፍል «እቃ ስጡ» የሚለውን ይምረጡና ያለዎትን ይንገሩን። አሰባሰቡን ወይም ' +
				'የማስረከቢያ ቦታውን ከእርስዎ ጋር እናዘጋጃለን።'
		},
		{
			question: 'Will my name be published?',
			questionAm: 'ስሜ ይፋ ይሆናል?',
			answer:
				'Only if you allow it. Tick "Keep my gift anonymous" and your name stays inside the ' +
				'Foundation, on the record that says the gift arrived.',
			answerAm:
				'እርስዎ ሲፈቅዱ ብቻ ነው። «ስጦታዬ ስም አልባ ይሁን» የሚለውን ምልክት ካደረጉ ስምዎ ስጦታው መድረሱን ' +
				'ከሚያሳየው መዝገብ ላይ በፋውንዴሽኑ ውስጥ ብቻ ይቆያል።'
		}
	];

	let created = 0;
	for (const [index, topic] of topics.entries()) {
		const existing = await db
			.select({ id: schema.helpTopics.id })
			.from(schema.helpTopics)
			.where(
				and(eq(schema.helpTopics.context, 'donate'), eq(schema.helpTopics.question, topic.question))
			)
			.limit(1);
		if (existing.length) continue;

		await db.insert(schema.helpTopics).values({
			context: 'donate',
			question: topic.question,
			questionAm: topic.questionAm,
			answer: topic.answer,
			answerAm: topic.answerAm,
			sortOrder: (index + 1) * 10
		});
		created += 1;
	}

	console.log(`✓ ${created} help topics`);
}

async function seedMedia() {
	const filenames = [
		'image1.webp',
		'image2.webp',
		'image3.webp',
		'image4.webp',
		'image5.webp',
		'image7.webp',
		'image8.webp',
		'image9.webp',
		'image10.webp',
		'image12.webp',
		'image13.webp',
		'image14.webp',
		'image15.webp',
		'image16.webp',
		'image17.webp',
		'image18.webp',
		'image19.webp',
		'image20.webp',
		'image21.webp',
		'memorium.webp',
		'memoriumGallery1.webp',
		'memoriumGallery2.webp',
		'memoriumGallery3.webp'
	];

	for (const filename of filenames) {
		const target = path.join(FILES_DIR, filename);
		if (!fs.existsSync(target)) continue;
		const stat = fs.statSync(target);

		await db
			.insert(schema.files)
			.values({
				originalFilename: filename,
				storagePath: filename,
				mimeType: 'image/webp',
				sizeBytes: stat.size,
				isPublic: true,
				pillarId: null,
				uploadedBy: null,
				createdAt: now()
			})
			.onConflictDoNothing({ target: schema.files.storagePath });
	}

	// Pillars — one photo apiece.
	const pillarImages: Record<string, string> = {
		'medical-hardship': 'image7.webp',
		'elder-care': 'image21.webp',
		'mental-wellness': 'image18.webp',
		'youth-education': 'image1.webp'
	};
	for (const [slug, image] of Object.entries(pillarImages)) {
		await db
			.update(schema.pillars)
			.set({ image })
			.where(sql`${schema.pillars.slug} = ${slug} and ${schema.pillars.image} is null`);
	}

	// Future initiatives.
	const initiativeImages: Record<string, string> = {
		'free-hospital': 'image16.webp',
		'boarding-schools': 'image8.webp',
		'senior-centers': 'image19.webp'
	};
	for (const [slug, image] of Object.entries(initiativeImages)) {
		await db
			.update(schema.futureInitiatives)
			.set({ image })
			.where(
				sql`${schema.futureInitiatives.slug} = ${slug} and ${schema.futureInitiatives.image} is null`
			);
	}

	// Homepage hero.
	await db
		.update(schema.siteSettings)
		.set({ value: 'image3.webp' })
		.where(sql`${schema.siteSettings.key} = 'hero.image' and ${schema.siteSettings.value} is null`);

	// Share images, one per public page.
	const pageShareImages: Record<string, string> = {
		home: 'image3.webp',
		programs: 'image10.webp',
		donate: 'image5.webp',
		volunteer: 'image13.webp',
		contact: 'image9.webp'
	};
	for (const [slug, image] of Object.entries(pageShareImages)) {
		await db
			.update(schema.pages)
			.set({ shareImage: image })
			.where(sql`${schema.pages.slug} = ${slug} and ${schema.pages.shareImage} is null`);
	}

	// A handful of `image` content blocks, so the pages that are mostly prose
	// get a picture in the body too, not just a share-card thumbnail.
	const imageBlocks: {
		page: string;
		src: string;
		alt: string;
		caption?: string;
	}[] = [
		{
			page: 'volunteer',
			src: 'image4.webp',
			alt: 'A volunteer mentor talking with a student over an open notebook',
			caption: 'Mentorship that lasts past the first term is most of what we ask of a volunteer.'
		},
		{
			page: 'home',
			src: 'image20.webp',
			alt: 'Three schoolchildren walking home together at sunset',
			caption: 'Every programme is ultimately about a family getting through the week.'
		},
		{
			page: 'programs',
			src: 'image15.webp',
			alt: 'A volunteer mentor talking with a student over an open notebook',
			caption: 'Four pillars, one shared way of working: show up, and keep showing up.'
		}
	];

	const pageRows = await db.select().from(schema.pages);
	const pageBySlug = new Map(pageRows.map((row) => [row.slug, row.id]));

	for (const [index, block] of imageBlocks.entries()) {
		const pageId = pageBySlug.get(block.page);
		if (!pageId) continue;

		// Distinct, high sort order so these land after the blocks `seedPages`
		// writes and are idempotent without disturbing that function's own
		// position-based check.
		const sortOrder = 100 + index;
		const existing = await db
			.select({ id: schema.contentBlocks.id })
			.from(schema.contentBlocks)
			.where(
				sql`${schema.contentBlocks.pageId} = ${pageId} and ${schema.contentBlocks.blockType} = 'image' and ${schema.contentBlocks.sortOrder} = ${sortOrder}`
			)
			.limit(1);
		if (existing.length) continue;

		await db.insert(schema.contentBlocks).values({
			pageId,
			blockType: 'image',
			sortOrder,
			content: { src: block.src, alt: block.alt, caption: block.caption ?? '' }
		});
	}

	// The Home page's In Memoriam teaser block gets the family's portrait —
	// only filling it in where a photo hasn't already been set from the
	// dashboard, same "seed once, never clobber an edit" rule as everywhere
	// else in this file. About's own, larger In Memoriam photo is handled by
	// `seedAboutPage`, since it isn't a content block at all any more.
	const memoriamBlocks = await db
		.select({ id: schema.contentBlocks.id, content: schema.contentBlocks.content })
		.from(schema.contentBlocks)
		.where(eq(schema.contentBlocks.blockType, 'memoriam'));

	for (const block of memoriamBlocks) {
		const content = (block.content ?? {}) as Record<string, unknown>;
		if (content.photo) continue;

		await db
			.update(schema.contentBlocks)
			.set({ content: { ...content, photo: 'memorium.webp' } })
			.where(eq(schema.contentBlocks.id, block.id));
	}

	console.log(`✓ ${filenames.length} media files registered and placed`);
}

/* ==========================================================================
   Media
   ========================================================================== */

/**
 * Attaches images or videos to an owner in `media_items`.
 *
 * Keyed on (owner, url), so re-running adds nothing that is already attached
 * and never disturbs an ordering staff have since changed. Images are looked
 * up in `files` so the item carries a file id and deleting it can clean the
 * bytes; a filename with no `files` row is skipped, because `/files/:name`
 * would refuse to serve it anyway.
 */
async function attachMedia(
	ownerType: (typeof schema.MEDIA_OWNERS)[number],
	ownerId: number,
	kind: 'image' | 'video',
	urls: string[],
	captions: Record<string, string> = {}
) {
	const existing = await db
		.select({ url: schema.mediaItems.url })
		.from(schema.mediaItems)
		.where(
			sql`${schema.mediaItems.ownerType} = ${ownerType} and ${schema.mediaItems.ownerId} = ${ownerId} and ${schema.mediaItems.kind} = ${kind}`
		);
	const attached = new Set(existing.map((row) => row.url));

	let sortOrder = existing.length;
	for (const url of urls) {
		if (attached.has(url)) continue;

		let fileId: number | null = null;
		if (kind === 'image') {
			const [file] = await db
				.select({ id: schema.files.id })
				.from(schema.files)
				.where(eq(schema.files.storagePath, url))
				.limit(1);
			if (!file) continue;
			fileId = file.id;
		}

		await db.insert(schema.mediaItems).values({
			ownerType,
			ownerId,
			kind,
			url,
			fileId,
			caption: captions[url] ?? null,
			sortOrder: sortOrder++,
			createdAt: now()
		});
	}
}

/* ==========================================================================
   About page (hand-built route, not content_blocks)
   ========================================================================== */

/**
 * Fills in the singleton `about_content` row and the In Memoriam gallery.
 *
 * Runs after `seedMedia`, which is what registers the photos this reaches
 * for in `files`. The content row is only ever inserted, never updated after
 * that — a program manager's edit through `/dashboard/about` must survive a
 * re-run of this script. The gallery is keyed on `fileId`, so re-running
 * adds nothing once every photo is already attached.
 */
async function seedAboutPage() {
	const [existing] = await db
		.select({ id: schema.aboutContent.id })
		.from(schema.aboutContent)
		.limit(1);

	if (!existing) {
		await db.insert(schema.aboutContent).values({
			metaDescription: 'Who we are, why the Foundation exists, and the man it is named for.',
			heroImage: 'image2.webp',
			storyBody: ABOUT_STORY_BODY,
			missionText:
				'To stand with families in Ethiopia through medical hardship, old age, mental strain and the cost of education, with practical help and with presence.',
			visionText:
				'An Ethiopia where a medical emergency does not bankrupt a family, an elder is not alone, asking for help with your mental health costs nothing socially, and a bright child stays in school regardless of what their family earns.',
			memoriamName: 'Shimeles Abera',
			memoriamHeroImage: 'memorium.webp',
			memoriamBody: ABOUT_MEMORIAM_BODY,
			updatedBy: null,
			updatedAt: now()
		});
		console.log('✓ about page content');
	}

	const galleryFiles = ['memoriumGallery1.webp', 'memoriumGallery2.webp', 'memoriumGallery3.webp'];
	await attachMedia('about', 1, 'image', galleryFiles);

	console.log('✓ about page gallery');
}

/* ==========================================================================
   Blog
   ========================================================================== */

/**
 * Seeds the blog's categories and a first set of posts.
 *
 * Same rule as everywhere else in this file: keyed on the natural key (the
 * slug), insert-only, so re-running never overwrites an article a
 * communications officer has since rewritten. The bodies below are HTML
 * because that is what the dashboard's rich-text editor produces — and, like
 * the rest of the copy here, they are placeholder and meant to be replaced.
 *
 * Runs after `seedMedia`, which registers the photographs the covers and
 * galleries point at.
 */
async function seedBlog() {
	const categories = [
		{
			slug: 'field-notes',
			name: 'Field notes',
			description: 'What a week of case work actually looks like.',
			color: 'olive'
		},
		{
			slug: 'programme-updates',
			name: 'Programme updates',
			description: 'Where each of the four pillars has got to.',
			color: 'clay'
		},
		{
			slug: 'stories',
			name: 'Stories',
			description: 'The families, elders and students behind the numbers.',
			color: 'plum'
		},
		{
			slug: 'volunteering',
			name: 'Volunteering',
			description: 'For the people who give their Saturdays.',
			color: 'sky'
		}
	];

	for (const [index, category] of categories.entries()) {
		await db
			.insert(schema.blogCategories)
			.values({ ...category, sortOrder: index })
			.onConflictDoNothing({ target: schema.blogCategories.slug });
	}

	const categoryRows = await db
		.select({ id: schema.blogCategories.id, slug: schema.blogCategories.slug })
		.from(schema.blogCategories);
	const categoryId = (slug: string) => categoryRows.find((row) => row.slug === slug)?.id ?? null;

	/** Days before today, so a fresh seed never lands a post in the future. */
	const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

	const posts: {
		slug: string;
		title: string;
		excerpt: string;
		body: string;
		category: string;
		coverImage: string;
		authorName: string;
		daysAgo: number;
		isFeatured?: boolean;
		gallery?: string[];
	}[] = [
		{
			slug: 'what-a-medical-case-actually-costs',
			title: 'What a medical case actually costs',
			excerpt:
				'A family arrives with a referral letter and no way to pay for it. Here is where the money goes, line by line, on a case we closed last month.',
			category: 'field-notes',
			coverImage: 'image7.webp',
			authorName: 'Programme team',
			daysAgo: 6,
			isFeatured: true,
			body:
				'<p>The referral letter is usually the first thing we see. It is a single sheet, often folded into quarters, and it names a procedure and a hospital and nothing about how any of it will be paid for.</p>' +
				'<h2>The line items</h2>' +
				'<p>On the case we closed in July, the total came to 41,200 birr. Of that, 28,000 was the procedure itself, 7,400 was four nights on the ward, 3,600 was medication for the eight weeks afterwards, and 2,200 was transport, because the family lives two hours outside the city, and someone had to be with her.</p>' +
				'<p>That last line is the one people are surprised by. It is also the one that quietly decides whether a family follows through on a treatment plan or gives up on it halfway.</p>' +
				'<h2>Why we publish it</h2>' +
				'<p>We pay the hospital directly and we keep the receipt. A nonprofit that says <strong>“we helped a family”</strong> is making a claim. One that can say “we paid this hospital this amount on this date for this case” is showing its work, and that is what earns the next gift.</p>' +
				'<blockquote>Every disbursement in our records names the supplier, the amount and the date. None of it is aggregated away.</blockquote>',
			gallery: ['image8.webp', 'image9.webp', 'image10.webp']
		},
		{
			slug: 'elder-care-first-year',
			title: 'Elder care: the first year, honestly',
			excerpt:
				'Twelve months into the elder care programme, the thing we underestimated was not money. It was loneliness, and how little it costs to interrupt.',
			category: 'programme-updates',
			coverImage: 'image21.webp',
			authorName: 'Programme team',
			daysAgo: 18,
			body:
				'<p>When we set the elder care programme up, we budgeted for medication, for food support, and for the occasional emergency. All of that was right, and all of it turned out to be the smaller half of the problem.</p>' +
				'<h2>What we got wrong</h2>' +
				'<p>The elders on our list are not, for the most part, going hungry. They are sitting alone in a room for most of the day. The volunteer who comes on Thursday afternoon and stays for two hours is doing more measurable good than the food parcel that arrives on Monday, and costs us almost nothing.</p>' +
				'<h2>What changes this year</h2>' +
				'<ul><li>Two scheduled visits a week rather than one, for everyone on the list.</li><li>A phone, and credit for it, for the eleven people who did not have one.</li><li>A standing Thursday gathering, because several of them turned out to live within walking distance of each other and had never met.</li></ul>' +
				'<p>None of that was in the original budget. All of it is in this one.</p>',
			gallery: ['image12.webp', 'image13.webp']
		},
		{
			slug: 'meron-goes-back-to-school',
			title: 'Meron goes back to school',
			excerpt:
				'She left in grade nine because the fees were the difference between school and the family eating. She sat her exams last month.',
			category: 'stories',
			coverImage: 'image1.webp',
			authorName: 'Communications',
			daysAgo: 27,
			body:
				'<p>Meron was seventeen when she stopped going to school, and the reason was arithmetic rather than anything else. Her mother sells vegetables. The school fees, the uniform and the exercise books came to slightly more than the household could carry, and Meron was the one who noticed first and stopped asking.</p>' +
				'<p>She was out for two years. The thing she says about those two years is not that they were hard, because she is matter-of-fact about hard, but that she thought the decision was permanent, because everyone she knew who had left had stayed left.</p>' +
				'<h2>Going back</h2>' +
				'<p>The youth education pillar covers fees, uniform and materials for a full academic year at a time, renewable. It is deliberately not a one-off grant: a child who returns for a term and drops out again is worse off than one who never returned, because now they know exactly what they are missing.</p>' +
				'<p>Meron sat her exams last month. She wants to study accounting, on the grounds that she has been doing the family’s books since she was twelve and may as well be paid for it.</p>',
			gallery: ['image14.webp', 'image15.webp', 'image16.webp']
		},
		{
			slug: 'talking-about-mental-health-in-addis',
			title: 'Talking about mental health in Addis',
			excerpt:
				'The cost of a session is not the barrier we were told it would be. Being seen walking into the building is.',
			category: 'programme-updates',
			coverImage: 'image18.webp',
			authorName: 'Programme team',
			daysAgo: 39,
			body:
				'<p>We started the mental wellness pillar expecting cost to be the obstacle. It is an obstacle. It is not the first one.</p>' +
				'<h2>What people actually said</h2>' +
				'<p>In the intake conversations we ran before the programme opened, the reason people gave for not seeking help was, overwhelmingly, that someone would see them do it. A neighbour, a cousin, someone from church. The session fee came up too, but second, and usually as the reason they gave <em>out loud</em> for not going.</p>' +
				'<h2>What we changed</h2>' +
				'<p>Sessions are held in a building that also houses several other things, so arriving at it says nothing about why you are there. Appointments can be made by phone rather than in person. And referrals go through the same intake process as everything else we do, so being on our list does not identify which pillar you are on it for.</p>' +
				'<p>None of that is clever. All of it doubled uptake in the first quarter.</p>'
		},
		{
			slug: 'a-saturday-with-the-volunteers',
			title: 'A Saturday with the volunteers',
			excerpt:
				'Fourteen people, one distribution, and a system for who carries what that took three months to get right.',
			category: 'volunteering',
			coverImage: 'image19.webp',
			authorName: 'Volunteer coordination',
			daysAgo: 52,
			body:
				'<p>A distribution day looks chaotic from outside and is, from inside, almost entirely a logistics problem that somebody solved in advance.</p>' +
				'<h2>The shape of the day</h2>' +
				'<p>Fourteen volunteers, arriving at seven. Two on the list at the door, four carrying, four handing out, two on the vehicle, two floating. Everyone knows which they are before they arrive, because the alternative is fourteen people standing in a room at seven in the morning deciding.</p>' +
				'<h2>What we ask of a volunteer</h2>' +
				'<ul><li>Safeguarding clearance before any placement that involves children or elders. No exceptions, and no “we will sort it out afterwards”.</li><li>A commitment to a shift pattern rather than to individual days, because the families on the other end need the same faces.</li><li>Turning up. Which sounds obvious and is the whole thing.</li></ul>' +
				'<p>If that sounds like something you have a Saturday for, the volunteer form is on this site.</p>',
			gallery: ['image17.webp', 'image20.webp']
		},
		{
			slug: 'how-we-decide-who-we-help',
			title: 'How we decide who we help',
			excerpt:
				'We cannot fund every application. This is the process that decides, written down, so that nobody has to wonder whether it was arbitrary.',
			category: 'field-notes',
			coverImage: 'image2.webp',
			authorName: 'Programme team',
			daysAgo: 71,
			body:
				'<p>Every application that reaches us gets read. Not every one gets funded, and the honest reason is that the money runs out before the need does.</p>' +
				'<h2>The process</h2>' +
				'<ol><li>An application arrives, through this site, through a partner clinic, or because a neighbour told us.</li><li>A caseworker verifies the circumstances. This means a conversation and, where there is one, a document: a referral letter, a school fee notice, a diagnosis.</li><li>The case goes to a review with the pillar lead, who decides on the amount and the schedule.</li><li>We pay the supplier directly and record it.</li></ol>' +
				'<h2>What we weigh</h2>' +
				'<p>Urgency, first: a treatment with a date on it outranks one without. Then whether our help is decisive: 40,000 birr that completes a treatment plan does more than 40,000 birr against a bill of half a million. Then household circumstances, which is where a caseworker’s judgement does real work and where we accept that judgement is not the same as a formula.</p>' +
				'<p>If we cannot fund a case, we say so, and we say why. A silent no is the worst thing an organisation like this can do to a family that has already had to ask.</p>',
			gallery: ['image3.webp', 'image4.webp', 'image5.webp']
		}
	];

	for (const [index, post] of posts.entries()) {
		await db
			.insert(schema.blogPosts)
			.values({
				slug: post.slug,
				title: post.title,
				excerpt: post.excerpt,
				body: post.body,
				coverImage: post.coverImage,
				categoryId: categoryId(post.category),
				authorName: post.authorName,
				metaDescription: post.excerpt.slice(0, 300),
				// Left at 0 so the public read estimates it from the body — the
				// bodies here will be replaced, and a stale hand-typed number
				// would outlive the text it described.
				readMinutes: 0,
				isFeatured: post.isFeatured ?? false,
				isPublished: true,
				publishedAt: daysAgo(post.daysAgo),
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.blogPosts.slug });
	}

	// Galleries go into `media_items`, keyed on (owner, filename), so re-running
	// adds nothing to a post whose photos are already attached.
	const postRows = await db
		.select({ id: schema.blogPosts.id, slug: schema.blogPosts.slug })
		.from(schema.blogPosts);

	for (const post of posts) {
		if (!post.gallery?.length) continue;
		const row = postRows.find((r) => r.slug === post.slug);
		if (!row) continue;
		await attachMedia('blog_post', row.id, 'image', post.gallery);
	}

	console.log(`✓ ${categories.length} blog categories and ${posts.length} posts`);
}

/* ==========================================================================
   Testimonials
   ========================================================================== */

/**
 * Seeds the testimonials wall and the homepage slider.
 *
 * Insert-only and keyed on slug, like everything else here, so a re-run never
 * overwrites a quote someone has since corrected. Placeholder copy — the real
 * words have to come from the people who said them, with their consent.
 *
 * `showOnSite` puts a quote on `/testimonials`; `isFeatured` also puts it in
 * the homepage slider. Three of the six are featured, which is about the right
 * number for a slider nobody has to sit through.
 */
async function seedTestimonials() {
	const pillarRows = await db
		.select({ id: schema.pillars.id, slug: schema.pillars.slug })
		.from(schema.pillars);
	const pillarId = (slug: string) => pillarRows.find((row) => row.slug === slug)?.id ?? null;

	const rows: {
		slug: string;
		name: string;
		role: string;
		quote: string;
		body?: string;
		pillar: string | null;
		photo: string;
		featured?: boolean;
		gallery?: string[];
	}[] = [
		{
			slug: 'meron-k',
			name: 'Meron',
			role: 'Student, Kolfe',
			quote:
				'I thought leaving school was permanent, because everyone I knew who left stayed left. I sat my exams last month.',
			pillar: 'youth-education',
			photo: 'image1.webp',
			featured: true,
			gallery: ['image14.webp', 'image15.webp']
		},
		{
			slug: 'tigist-a',
			name: 'Tigist',
			role: 'Mother of two, Addis Ababa',
			quote:
				'They paid the hospital directly and showed me the receipt. Nobody had ever handed me a piece of paper like that before.',
			body:
				'<p>My daughter needed a procedure we could not pay for. I had the referral letter for three weeks before I found anyone who would even read it.</p>' +
				'<p>What I remember is not the money. It is that someone sat down and went through it with me, line by line, and then told me exactly what would happen next, and then that is what happened.</p>',
			pillar: 'medical-hardship',
			photo: 'image7.webp',
			featured: true,
			gallery: ['image8.webp', 'image9.webp']
		},
		{
			slug: 'ato-bekele',
			name: 'Ato Bekele',
			role: 'Elder, Gullele',
			quote:
				'Thursday afternoon is the part of my week I count towards. Not the food parcel, the company.',
			pillar: 'elder-care',
			photo: 'image21.webp',
			featured: true,
			gallery: ['image12.webp', 'image13.webp']
		},
		{
			slug: 'sara-t',
			name: 'Sara',
			role: 'Volunteer since 2024',
			quote:
				'I came expecting to hand out parcels. What I actually do is turn up for the same four families every fortnight, which turned out to be the whole point.',
			pillar: null,
			photo: 'image19.webp',
			gallery: ['image17.webp', 'image20.webp']
		},
		{
			slug: 'dawit-m',
			name: 'Dawit',
			role: 'Referred through a partner clinic',
			quote:
				'Asking for help with your head costs you something socially here. They understood that before I had to explain it.',
			pillar: 'mental-wellness',
			photo: 'image18.webp'
		},
		{
			slug: 'hanna-g',
			name: 'Hanna',
			role: 'Teacher, partner school',
			quote:
				'Three of my students are still in my classroom because of this Foundation. That is not a statistic to me, it is three desks.',
			pillar: 'youth-education',
			photo: 'image2.webp'
		}
	];

	for (const [index, row] of rows.entries()) {
		await db
			.insert(schema.testimonials)
			.values({
				slug: row.slug,
				name: row.name,
				role: row.role,
				quote: row.quote,
				body: row.body ?? null,
				photo: row.photo,
				pillarId: row.pillar ? pillarId(row.pillar) : null,
				showOnSite: true,
				isFeatured: row.featured ?? false,
				sortOrder: index
			})
			.onConflictDoNothing({ target: schema.testimonials.slug });
	}

	const saved = await db
		.select({ id: schema.testimonials.id, slug: schema.testimonials.slug })
		.from(schema.testimonials);

	for (const row of rows) {
		if (!row.gallery?.length) continue;
		const match = saved.find((t) => t.slug === row.slug);
		if (!match) continue;
		await attachMedia('testimonial', match.id, 'image', row.gallery);
	}

	console.log(`✓ ${rows.length} testimonials`);
}

/* ==========================================================================
   Run
   ========================================================================== */

async function main() {
	console.log('Seeding Shimeles Abera Foundation…\n');

	await seedPermissions();
	await seedRegions();
	await seedSettings();
	await seedStatuses();
	await seedPillars();
	await seedForms();
	await migrateMissionIntoAbout();
	await migrateAboutToHardcodedRoute();
	await seedPages();
	await seedPayments();
	await seedDonationCampaigns();
	await seedSafeguarding();
	await seedVolunteerCatalog();
	await seedApply();
	await seedInKindCategories();
	await seedContact();
	await seedTranslations();
	await seedHelpTopics();
	await seedMedia();
	await seedAboutPage();
	await seedBlog();
	await seedTestimonials();

	console.log('\nDone. Create the first administrator at /setup.');
	client.close();
}

main().catch((err) => {
	console.error(err);
	client.close();
	process.exit(1);
});
