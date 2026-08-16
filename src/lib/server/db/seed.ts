import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, inArray, sql } from 'drizzle-orm';
import * as schema from './schema';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE } from '../../permissions';

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
	'<p>With deep respect and heartfelt remembrance, we honor the life of our beloved Shimeles Abera — a man whose legacy is defined by integrity, humility, and an unwavering commitment to others.</p>' +
	'<p>Shimeles lived a life guided by strong moral principles and genuine compassion. He was known for his calm strength, respectful nature, and the sincerity with which he treated every individual. His presence brought comfort, his words carried wisdom, and his actions reflected a life devoted to service and humanity.</p>' +
	'<p>While his passing brought profound sorrow, his life remains a lasting source of inspiration. The values he embodied — kindness, integrity, and service — continue to live on in the many lives he touched.</p>' +
	'<p>His legacy will continue forever through the Shimeles Abera Foundation, ensuring that his vision, values, and compassion endure for generations to come.</p>' +
	'<p>We remember Shimeles with profound gratitude and admiration. His life stands as a testament to the power of character and the lasting impact of a life well lived.</p>' +
	'<p><em>May his soul rest in eternal peace.</em></p>';

const ABOUT_STORY_BODY =
	'<p>This foundation carries the name of Shimeles Abera, and it was built by the people who knew him.</p>' +
	'<p>It is not a large organisation. It is a group of people in Addis Ababa who decided that the gap between what a family needs on their worst day and what they can actually reach is a gap somebody should stand in.</p>' +
	'<h2>How we work</h2><p>Someone applies, or someone tells us about a neighbour. We look at it properly. If we can help, we help — and we record where the money went, down to the hospital and the date, because a nonprofit that cannot show that has not earned the next gift.</p>';

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
			label: 'Override: funds raised (santim)',
			group: 'impact',
			valueType: 'number',
			hint: 'Leave blank to use the live total of completed donations.'
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
			color: 'olive'
		},
		{
			context: 'application',
			stage: 'active',
			label: 'Receiving support',
			color: 'clay'
		},
		{ context: 'application', stage: 'closed', label: 'Closed', color: 'slate' },
		{
			context: 'application',
			stage: 'declined',
			label: 'Not proceeding',
			color: 'rose'
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
		{ context: 'volunteer', stage: 'approved', label: 'Approved to volunteer', color: 'clay' },
		{ context: 'volunteer', stage: 'declined', label: 'Not proceeding', color: 'rose' }
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
			'<p>Our elders raised the people who are now raising Ethiopia. Too many of them spend their last years isolated — physically able enough to be overlooked, and alone enough that nobody notices when they are not.</p><p>We provide direct assistance with the practical things, and just as importantly we keep showing up. Isolation is a condition, and company is a treatment for it.</p>',
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
					hint: 'These help us move faster, but send what you have — we will not turn you away for a missing paper.'
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
							label: 'Please do not contact me — I just wanted to write this down'
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
					label: 'Two references — name, relationship, and how to reach them',
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
					fieldType: 'textarea' as const,
					isRequired: true,
					validation: { minLength: 10, maxLength: 3000 }
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
						'We have your request. Someone will look at it and be in touch — keep your reference number.',
					requiresDocuments: form.requiresDocuments,
					isLowBarrier: form.isLowBarrier,
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
			slug: 'volunteer',
			title: 'Volunteer',
			metaDescription: 'Give your time, skills and presence.',
			sortOrder: 3
		},
		{
			slug: 'contact',
			title: 'Contact',
			metaDescription: 'Get in touch with the Foundation.',
			sortOrder: 4
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
		'<p>Every programme on this site carries forward the life of the man whose name the Foundation bears — a life marked by integrity, humility, and quiet service to others.</p>' +
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
					{ metric: 'funds_raised', label: 'Raised and disbursed', is_money: true }
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
				body: '<p>You can give once, or commit to a monthly gift. You can send it where it is needed most, or name the programme it should go to.</p><p>Bank transfers in Ethiopia cannot be charged automatically, so a monthly gift here means we send you a reminder and you make the transfer — a promise rather than a direct debit.</p>'
			}
		},
		{ page: 'donate', blockType: 'donation_details', heading: 'Where to send it', content: {} },
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
				body: '<p>If this is about an application you have already made, please quote your reference number — it is the fastest way for us to find you.</p>'
			}
		},
		{
			page: 'contact',
			blockType: 'form_embed',
			content: { slug: 'contact-form', label: 'Send us a message' }
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
   Translations
   ========================================================================== */

async function seedTranslations() {
	const strings: { key: string; en: string; group: string }[] = [
		{ key: 'form.submit', en: 'Submit', group: 'form' },
		{ key: 'form.sending', en: 'Sending', group: 'form' },
		{ key: 'form.your_name', en: 'Your name', group: 'form' },
		{ key: 'form.your_phone', en: 'Phone', group: 'form' },
		{ key: 'form.your_email', en: 'Email', group: 'form' },
		{ key: 'form.programme', en: 'Programme', group: 'form' },
		{
			key: 'form.thank_you',
			en: 'Thank you — we have your request',
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
			en: 'We will remind you each month — bank transfers in Ethiopia cannot be charged automatically.',
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
		{ key: 'donate.is_diaspora', en: 'I am giving from outside Ethiopia', group: 'donate' },
		{
			key: 'donate.anonymous',
			en: 'Keep my gift anonymous',
			group: 'donate'
		},
		{ key: 'donate.newsletter', en: 'Send me occasional updates', group: 'donate' },
		{ key: 'donate.submit', en: 'Give', group: 'donate' },
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
			.values({ key: string.key, en: string.en, group: string.group })
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
	const [existing] = await db.select({ id: schema.aboutContent.id }).from(schema.aboutContent).limit(1);

	if (!existing) {
		await db.insert(schema.aboutContent).values({
			metaDescription: 'Who we are, why the Foundation exists, and the man it is named for.',
			heroImage: 'image2.webp',
			storyBody: ABOUT_STORY_BODY,
			missionText:
				'To stand with families in Ethiopia through medical hardship, old age, mental strain and the cost of education — with practical help, and with presence.',
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
	const fileRows = await db
		.select({ id: schema.files.id, storagePath: schema.files.storagePath })
		.from(schema.files)
		.where(inArray(schema.files.storagePath, galleryFiles));

	const existingGallery = await db
		.select({ fileId: schema.aboutGalleryImages.fileId })
		.from(schema.aboutGalleryImages);
	const attached = new Set(existingGallery.map((row) => row.fileId));

	let sortOrder = existingGallery.length;
	for (const filename of galleryFiles) {
		const file = fileRows.find((row) => row.storagePath === filename);
		if (!file || attached.has(file.id)) continue;

		await db.insert(schema.aboutGalleryImages).values({
			fileId: file.id,
			sortOrder: sortOrder++,
			createdAt: now()
		});
	}

	console.log('✓ about page gallery');
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
	await seedTranslations();
	await seedMedia();
	await seedAboutPage();

	console.log('\nDone. Create the first administrator at /setup.');
	client.close();
}

main().catch((err) => {
	console.error(err);
	client.close();
	process.exit(1);
});
