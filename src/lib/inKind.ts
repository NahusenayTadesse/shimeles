import { z } from 'zod/v4';
import { flagField, optionalEmailField, optionalNumberField } from '$lib/forms/fields';

/**
 * The shape of an in-kind gift, shared by the three places that need it: the
 * zod schema that validates the offer, the form that collects it, and the
 * server load that seeds the first empty row.
 *
 * Client-safe on purpose — the donate page renders these lists, and anything
 * under `$lib/server` cannot be imported into a component. The database
 * columns in `in_kind_donation_items` carry the same values; keeping the lists
 * here is what stops the two drifting apart.
 */

export const ITEM_CONDITIONS = [
	'new',
	'like_new',
	'refurbished',
	'good',
	'used',
	'needs_repair'
] as const;

/** The single source for the condition union — see `InKindItemInput`. */
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const ITEM_AGE_GROUPS = ['any', 'infant', 'child', 'teen', 'adult', 'elderly'] as const;
export const ITEM_GENDERS = ['unisex', 'female', 'male'] as const;

export const DONOR_TYPES = [
	'individual',
	'family',
	'business',
	'school',
	'faith_group',
	'association',
	'ngo',
	'government',
	'other'
] as const;

export const CONTACT_CHANNELS = ['phone', 'sms', 'email', 'telegram', 'whatsapp'] as const;
export const HANDOVER_METHODS = ['dropoff', 'pickup', 'courier', 'already_shipped'] as const;
export const LOAD_SIZES = [
	'handheld',
	'car_boot',
	'pickup_truck',
	'small_truck',
	'container'
] as const;
export const VALUATION_BASES = [
	'unknown',
	'donor_estimate',
	'purchase_receipt',
	'professional_appraisal'
] as const;

/** Suggestions for the `unit` box, not a constraint — the column is free text. */
export const UNIT_SUGGESTIONS = [
	'items',
	'pieces',
	'pairs',
	'sets',
	'bags',
	'boxes',
	'cartons',
	'sacks',
	'kg',
	'litres',
	'packs',
	'bundles'
] as const;

/**
 * The empty line an offer opens with, so a donor sees a row to fill in rather
 * than an "add item" button and a blank panel. The unit comes from the chosen
 * category, which is why it is a parameter rather than always "items".
 */
export const blankInKindItem = (categoryId: number | null, unit: string) => ({
	categoryId,
	description: '',
	quantity: 1,
	unit,
	condition: 'good' as const,
	ageGroup: 'any' as const,
	gender: 'unisex' as const,
	sizeRange: '',
	brandOrModel: '',
	isPerishable: false,
	expiresOn: '',
	needsRefrigeration: false,
	estimatedValue: null as number | null,
	notes: ''
});

/** What the donate page shows for a category, once the server has read it. */
export type InKindCategoryOption = {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	icon: string | null;
	pillarId: number | null;
	defaultUnit: string;
	/** Food and medicine: ask for a use-by date and flag cold storage. */
	requiresExpiry: boolean;
	/** Clothing and shoes: ask for sizes and who they would fit. */
	requiresSizing: boolean;
	/** Furniture and appliances: warn that collection needs a vehicle. */
	requiresTransport: boolean;
	acceptanceNote: string | null;
	isAcceptingNow: boolean;
};

/* ==========================================================================
   Labels
   ==========================================================================

   Wording shared by the public form and the dashboard. Where the two would
   naturally say different things — a donor picks "I will bring it", a
   coordinator reads "Drop-off" — each screen keeps its own words; only the
   labels that are genuinely the same sentence for both live here.
   ========================================================================== */

export const IN_KIND_STATUSES = [
	'offered',
	'under_review',
	'accepted',
	'scheduled',
	'received',
	'distributed',
	'declined',
	'cancelled'
] as const;

export type InKindStatusValue = (typeof IN_KIND_STATUSES)[number];

export const IN_KIND_STATUS_LABELS: Record<InKindStatusValue, string> = {
	offered: 'New offer',
	under_review: 'Being looked at',
	accepted: 'Accepted',
	scheduled: 'Collection booked',
	received: 'Received',
	distributed: 'Distributed',
	declined: 'Declined',
	cancelled: 'Cancelled'
};

/** Badge colour tokens, matching `status-badge.svelte`'s vocabulary. */
export const IN_KIND_STATUS_COLORS: Record<InKindStatusValue, string> = {
	offered: 'amber',
	under_review: 'sky',
	accepted: 'olive',
	scheduled: 'plum',
	received: 'green',
	distributed: 'green',
	declined: 'rose',
	cancelled: 'slate'
};

export const CONDITION_LABELS: Record<string, string> = {
	new: 'New, unused',
	like_new: 'As good as new',
	// Distinct from "good": somebody has repaired or reconditioned it, which is
	// what a laptop or a piece of medical equipment usually arrives as.
	refurbished: 'Refurbished or reconditioned',
	good: 'Used, good condition',
	used: 'Well used, still usable',
	needs_repair: 'Needs a repair first'
};

export const AGE_GROUP_LABELS: Record<string, string> = {
	any: 'Anyone',
	infant: 'Babies and toddlers',
	child: 'Children',
	teen: 'Teenagers',
	adult: 'Adults',
	elderly: 'Older people'
};

export const GENDER_LABELS: Record<string, string> = {
	unisex: 'Anyone',
	female: 'Women and girls',
	male: 'Men and boys'
};

export const LOAD_SIZE_LABELS: Record<string, string> = {
	handheld: 'A bag or two, one person can carry it',
	car_boot: 'Fills a car boot',
	pickup_truck: 'Needs a pickup',
	small_truck: 'Needs a small truck',
	container: 'A container load'
};

export const VALUATION_LABELS: Record<string, string> = {
	unknown: 'No idea what it is worth',
	donor_estimate: "The donor's own estimate",
	purchase_receipt: 'What they paid, on a receipt',
	professional_appraisal: 'A professional valuation'
};

export const CONTACT_CHANNEL_LABELS: Record<string, string> = {
	phone: 'A phone call',
	sms: 'A text message',
	email: 'Email',
	telegram: 'Telegram',
	whatsapp: 'WhatsApp'
};

/* ==========================================================================
   The offer itself
   ========================================================================== */

/**
 * The in-kind offer.
 *
 * Validation sits between the two extremes already in this codebase. The
 * volunteer form is a gate and validates hard; `/apply` is a front door and
 * validates almost nothing. This is a conversation: somebody is offering to
 * give something away, and the only things we genuinely cannot proceed
 * without are what they have, a way to phone them back, and permission to do
 * so. Everything that helps a coordinator plan a collection is asked for and
 * accepted blank.
 *
 * Nothing here promises the gift will be accepted — see `$lib/server/inKind`.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const optionalIsoDate = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
	.optional()
	.or(z.literal(''));

/** One line of an offer: a kind of thing, and how many of it. */
export const inKindItemSchema = z.object({
	categoryId: z.coerce.number().int().positive().nullable().default(null),
	description: z
		.string()
		.trim()
		.min(2, 'Say what the item is')
		.max(300, 'Keep this under 300 characters'),
	quantity: z.coerce
		.number({ message: 'How many?' })
		.int('Whole numbers only')
		.min(1, 'At least one')
		.max(100_000, 'For a quantity this large, please call us')
		.default(1),
	unit: z.string().trim().min(1).max(32).default('items'),
	condition: z.enum(ITEM_CONDITIONS).default('good'),
	ageGroup: z.enum(ITEM_AGE_GROUPS).default('any'),
	gender: z.enum(ITEM_GENDERS).default('unisex'),
	sizeRange: optionalText(120),
	brandOrModel: optionalText(120),
	isPerishable: flagField(false),
	expiresOn: optionalIsoDate,
	needsRefrigeration: flagField(false),
	/** Birr as typed; the server converts to santim. Blank stays blank. */
	estimatedValue: optionalNumberField({ min: 0, max: 10_000_000 }),
	notes: optionalText(500)
});

export const inKindSchema = z
	.object({
		/* --- What is being offered ------------------------------------------- */
		items: z
			.array(inKindItemSchema)
			.min(1, 'Add at least one thing you would like to give')
			.max(40, 'That is more lines than this form can take. Please call us'),
		valuationBasis: z.enum(VALUATION_BASES).default('donor_estimate'),
		/** Medicines, powered equipment, anything with a rule attached. */
		hasRestrictedItems: flagField(false),
		restrictedItemsNote: optionalText(500),

		/* --- Where it should go ----------------------------------------------- */
		designationType: z
			.enum(['general_fund', 'pillar', 'future_initiative'])
			.default('general_fund'),
		designationPillarId: z.coerce.number().int().positive().nullable().optional(),
		designationInitiativeId: z.coerce.number().int().positive().nullable().optional(),
		regionId: z.coerce.number().int().positive().nullable().default(null),

		/* --- Getting hold of it ------------------------------------------------ */
		handoverMethod: z.enum(HANDOVER_METHODS).default('dropoff'),
		pickupContactName: optionalText(150),
		pickupContactPhone: optionalText(32),
		pickupAddressLine: optionalText(240),
		pickupCity: optionalText(120),
		pickupLandmark: optionalText(160),
		accessNotes: optionalText(500),
		loadSize: z.enum(LOAD_SIZES).default('car_boot'),
		estimatedWeightKg: optionalNumberField({ min: 0, max: 100_000, int: true }),
		requiresVehicle: flagField(false),
		requiresHelpLoading: flagField(false),
		availableFrom: optionalIsoDate,
		availableUntil: optionalIsoDate,

		/* --- Who is giving ------------------------------------------------------ */
		donorName: z.string().trim().min(2, 'Enter your name').max(150),
		donorEmail: optionalEmailField(),
		donorPhone: optionalText(32),
		donorType: z.enum(DONOR_TYPES).default('individual'),
		organisationName: optionalText(200),
		isDiaspora: flagField(false),
		preferredContactChannel: z.enum(CONTACT_CHANNELS).default('phone'),
		bestTimeToContact: optionalText(120),

		/* --- Paperwork and recognition ------------------------------------------ */
		receiptRequested: flagField(false),
		taxReceiptRequired: flagField(false),
		taxIdNumber: optionalText(64),
		isAnonymous: flagField(false),
		recognitionName: optionalText(150),
		donorMessage: optionalText(1000),
		heardAbout: optionalText(200),
		joinNewsletter: flagField(false),

		/**
		 * The one hard requirement beyond the goods themselves. An offer we may
		 * not reply to is not an offer, and the address and phone number on this
		 * form are not ours to keep without it.
		 */
		consentToContact: flagField(false).refine(
			(value) => value === true,
			'We need your permission to contact you about this'
		),

		/** Honeypot — see the note in `$lib/server/forms`. */
		website: z.string().max(200).optional().or(z.literal(''))
	})
	/** Somewhere to reply. Either channel will do; neither will not. */
	.refine((data) => Boolean(data.donorPhone?.trim()) || Boolean(data.donorEmail?.trim()), {
		path: ['donorPhone'],
		message: 'Leave a phone number or an email address so we can arrange collection'
	})
	/** A collection needs somewhere to collect from. */
	.refine((data) => data.handoverMethod !== 'pickup' || Boolean(data.pickupAddressLine?.trim()), {
		path: ['pickupAddressLine'],
		message: 'Where should we come to collect?'
	})
	.refine((data) => data.handoverMethod !== 'pickup' || Boolean(data.pickupCity?.trim()), {
		path: ['pickupCity'],
		message: 'Which town or sub-city?'
	})
	/** An organisation's gift is recorded under the organisation's name. */
	.refine(
		(data) =>
			data.donorType === 'individual' ||
			data.donorType === 'family' ||
			Boolean(data.organisationName?.trim()),
		{ path: ['organisationName'], message: 'Tell us the name of the organisation' }
	)
	/** A tax receipt without a TIN cannot be issued, so ask while they are here. */
	.refine((data) => !data.taxReceiptRequired || Boolean(data.taxIdNumber?.trim()), {
		path: ['taxIdNumber'],
		message: 'A tax receipt needs your TIN'
	})
	/** A window that closes before it opens would send a driver on the wrong day. */
	.refine(
		(data) =>
			!data.availableFrom || !data.availableUntil || data.availableFrom <= data.availableUntil,
		{ path: ['availableUntil'], message: 'This is before the date you can start' }
	);

export type InKindSchema = typeof inKindSchema;
