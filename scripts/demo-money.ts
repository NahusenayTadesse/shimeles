/**
 * Demo money data, in more than one currency.
 *
 * Every money screen counts birr and dollars apart (see `MoneyTotal` in
 * `$lib/money.ts`), and with a single ETB donation in the database there is
 * nothing on screen to show that. This fills the ledger with a realistic
 * mixture — local birr giving, diaspora dollars, a euro donor, and one
 * supporter who gives in two currencies — so every per-currency total,
 * breakdown and chart bar has something to draw.
 *
 * It is demo data, not seed data: `db:seed` does not create donations, and
 * this deliberately stays out of it so a real installation never grows a
 * fictional ledger. Everything it writes is tagged, and `--clean` removes
 * exactly what it wrote and nothing else:
 *
 *     npx tsx scripts/demo-money.ts          # insert (replaces any earlier run)
 *     npx tsx scripts/demo-money.ts --clean  # remove it again
 *
 * Runs under `tsx`, never `bun` — better-sqlite3's native addon takes the
 * process down under Bun's NAPI implementation. Same reason `db:seed` does.
 */
import Database from 'better-sqlite3';

/** Everything this script writes carries one of these two marks. */
const REFERENCE_PREFIX = 'DEMO-';
const DEMO_EMAIL_DOMAIN = '@demo.invalid';

const db = new Database('local.db');
db.pragma('foreign_keys = ON');

const clean = process.argv.includes('--clean');

/* ==========================================================================
   Removal
   ========================================================================== */

/**
 * Deletes by tag, not by "everything in the table".
 *
 * A developer will have real test rows next to these, and the whole point of
 * the prefix is that this script can be run twice without doubling the ledger
 * or eating anything it did not create.
 */
function removeDemoData() {
	const donorIds = db
		.prepare(`select id from donors where email like ?`)
		.all(`%${DEMO_EMAIL_DOMAIN}`)
		.map((row) => (row as { id: number }).id);

	const inClause = donorIds.length ? `(${donorIds.join(',')})` : '(null)';

	const removed = db.transaction(() => {
		const counts = {
			needs: db
				.prepare(`delete from application_needs where detail like ?`)
				.run(`${REFERENCE_PREFIX}%`).changes,
			disbursements: db
				.prepare(`delete from disbursements where narrative like ?`)
				.run(`${REFERENCE_PREFIX}%`).changes,
			// Donations first: a pledge cannot go while a donation still points at it.
			donations: db
				.prepare(`delete from donations where reference_code like ?`)
				.run(`${REFERENCE_PREFIX}%`).changes,
			pledges: db.prepare(`delete from recurring_pledges where donor_id in ${inClause}`).run()
				.changes,
			donors: db.prepare(`delete from donors where email like ?`).run(`%${DEMO_EMAIL_DOMAIN}`)
				.changes
		};
		return counts;
	})();

	return removed;
}

/* ==========================================================================
   The data
   ========================================================================== */

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** `monthsAgo(3)` → a timestamp roughly three months back, for the chart. */
const monthsAgo = (months: number, dayOffset = 0) => {
	const date = new Date(now);
	date.setMonth(date.getMonth() - months);
	return date.getTime() + dayOffset * DAY;
};

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type DemoDonor = {
	key: string;
	fullName: string;
	organisationName?: string;
	country: string;
	isDiaspora: boolean;
	notes: string;
};

/**
 * Six supporters, chosen to make the currency rule visible rather than to
 * look like a lot of data.
 *
 * `hanna` is the one that matters most: she gives in dollars *and* in birr, so
 * the donors screen shows her two lifetime totals side by side and her
 * `lifetime_total` column holds only the larger of the two.
 */
const DONORS: DemoDonor[] = [
	{
		key: 'mekdes',
		fullName: 'Mekdes Alemu',
		country: 'Ethiopia',
		isDiaspora: false,
		notes: 'Gives monthly by Telebirr.'
	},
	{
		key: 'yohannes',
		fullName: 'Yohannes Girma',
		country: 'Ethiopia',
		isDiaspora: false,
		notes: 'Bank transfer, always quotes the reference.'
	},
	{
		key: 'abeba-trading',
		fullName: 'Abeba Kassa',
		organisationName: 'Abeba Trading PLC',
		country: 'Ethiopia',
		isDiaspora: false,
		notes: 'Corporate giving, quarterly.'
	},
	{
		key: 'daniel',
		fullName: 'Daniel Tesfaye',
		country: 'United States',
		isDiaspora: true,
		notes: 'Diaspora, wires USD twice a year.'
	},
	{
		key: 'hanna',
		fullName: 'Hanna Wolde',
		country: 'United States',
		isDiaspora: true,
		notes: 'Gives in USD from abroad and in ETB when she visits.'
	},
	{
		key: 'lukas',
		fullName: 'Lukas Berger',
		country: 'Germany',
		isDiaspora: true,
		notes: 'Met the Foundation through a partner charity in Frankfurt.'
	}
];

type DemoDonation = {
	donor: string;
	/** Major units as a person would say them: 2500 birr, 250 dollars. */
	major: number;
	currency: 'ETB' | 'USD' | 'EUR';
	status: 'completed' | 'pending_reconciliation' | 'failed';
	monthsAgo: number;
	designation?: { type: 'pillar'; id: number } | { type: 'future_initiative'; id: number };
	frequency?: 'one_time' | 'monthly';
	message?: string;
};

/**
 * Ten months of giving, in three currencies.
 *
 * Spread across months on purpose: the impact screen draws a bar per currency
 * per month, and a chart needs more than one month to say anything. The
 * unmatched and failed gifts are there so the reconciliation queue and its
 * per-currency "pledged" figures are not empty either.
 */
const DONATIONS: DemoDonation[] = [
	// --- Local birr giving, month by month --------------------------------
	{
		donor: 'mekdes',
		major: 2000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 9,
		frequency: 'monthly'
	},
	{
		donor: 'mekdes',
		major: 2000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 8,
		frequency: 'monthly'
	},
	{
		donor: 'mekdes',
		major: 2500,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 6,
		frequency: 'monthly'
	},
	{
		donor: 'mekdes',
		major: 2500,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 4,
		frequency: 'monthly'
	},
	{
		donor: 'mekdes',
		major: 2500,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 2,
		frequency: 'monthly'
	},
	{
		donor: 'mekdes',
		major: 2500,
		currency: 'ETB',
		status: 'pending_reconciliation',
		monthsAgo: 0,
		frequency: 'monthly'
	},

	{
		donor: 'yohannes',
		major: 15000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 7,
		designation: { type: 'pillar', id: 1 },
		message: 'For the hospital bills fund.'
	},
	{ donor: 'yohannes', major: 8000, currency: 'ETB', status: 'completed', monthsAgo: 3 },
	{
		donor: 'yohannes',
		major: 10000,
		currency: 'ETB',
		status: 'pending_reconciliation',
		monthsAgo: 0
	},

	{
		donor: 'abeba-trading',
		major: 50000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 8,
		designation: { type: 'pillar', id: 4 }
	},
	{
		donor: 'abeba-trading',
		major: 50000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 5,
		designation: { type: 'pillar', id: 4 }
	},
	{
		donor: 'abeba-trading',
		major: 75000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 1,
		designation: { type: 'future_initiative', id: 2 },
		message: 'Towards the boarding school.'
	},
	{ donor: 'abeba-trading', major: 20000, currency: 'ETB', status: 'failed', monthsAgo: 6 },

	// --- Diaspora dollars --------------------------------------------------
	{
		donor: 'daniel',
		major: 500,
		currency: 'USD',
		status: 'completed',
		monthsAgo: 9,
		designation: { type: 'future_initiative', id: 1 }
	},
	{ donor: 'daniel', major: 750, currency: 'USD', status: 'completed', monthsAgo: 5 },
	{
		donor: 'daniel',
		major: 1000,
		currency: 'USD',
		status: 'completed',
		monthsAgo: 2,
		designation: { type: 'future_initiative', id: 1 },
		message: 'In memory of my father.'
	},
	{ donor: 'daniel', major: 400, currency: 'USD', status: 'pending_reconciliation', monthsAgo: 0 },

	// Hanna gives in both. Her USD total is the larger, so that is what her
	// `lifetime_total` column holds — and her row on the donors screen shows
	// both figures rather than one impossible sum of the two.
	{ donor: 'hanna', major: 250, currency: 'USD', status: 'completed', monthsAgo: 7 },
	{ donor: 'hanna', major: 300, currency: 'USD', status: 'completed', monthsAgo: 4 },
	{ donor: 'hanna', major: 300, currency: 'USD', status: 'completed', monthsAgo: 1 },
	{
		donor: 'hanna',
		major: 12000,
		currency: 'ETB',
		status: 'completed',
		monthsAgo: 3,
		designation: { type: 'pillar', id: 2 },
		message: 'Dropped in while visiting Addis.'
	},
	{ donor: 'hanna', major: 5000, currency: 'ETB', status: 'completed', monthsAgo: 0 },

	// --- A third currency, so nothing in the UI assumes there are only two --
	{ donor: 'lukas', major: 300, currency: 'EUR', status: 'completed', monthsAgo: 6 },
	{ donor: 'lukas', major: 450, currency: 'EUR', status: 'completed', monthsAgo: 2 },
	{ donor: 'lukas', major: 200, currency: 'EUR', status: 'pending_reconciliation', monthsAgo: 0 }
];

/** Money going back out, against the beneficiary the database already has. */
const DISBURSEMENTS = [
	{ major: 18000, currency: 'ETB', paidTo: 'Tikur Anbessa Hospital', monthsAgo: 5, pillarId: 1 },
	{ major: 6500, currency: 'ETB', paidTo: 'Bete Pharmacy', monthsAgo: 3, pillarId: 1 },
	{
		major: 400,
		currency: 'USD',
		paidTo: 'Overseas lab (specialist tests)',
		monthsAgo: 2,
		pillarId: 1
	},
	{
		major: 9000,
		currency: 'ETB',
		paidTo: 'Almaz Bekele (transport and food)',
		monthsAgo: 1,
		pillarId: 1
	}
];

/** Standing commitments, one per currency, so the pledges screen is mixed. */
const PLEDGES = [
	{ donor: 'mekdes', major: 2500, currency: 'ETB' },
	{ donor: 'daniel', major: 100, currency: 'USD' },
	{ donor: 'lukas', major: 50, currency: 'EUR' }
];

/**
 * What one applicant asked for, priced in two currencies.
 *
 * The case screen shows one "estimated" badge per currency; a single figure
 * there used to be an ETB-labelled sum of both.
 */
const NEEDS = [
	{
		needId: 2,
		major: 24000,
		currency: 'ETB',
		urgency: 'immediate',
		detail: 'Outstanding hospital bill'
	},
	{ needId: 6, major: 350, currency: 'USD', urgency: 'weeks', detail: 'Wheelchair, imported' },
	{ needId: 7, major: 3000, currency: 'ETB', urgency: 'weeks', detail: 'Transport to appointments' }
];

/* ==========================================================================
   Writing
   ========================================================================== */

/** Two decimals for every currency here; `$lib/money.ts` owns the general rule. */
const toMinor = (major: number) => Math.round(major * 100);

function insertDemoData() {
	const donorIds = new Map<string, number>();

	db.transaction(() => {
		for (const donor of DONORS) {
			const { lastInsertRowid } = db
				.prepare(
					`insert into donors
					   (full_name, email, organisation_name, is_diaspora, country, notes, created_at, updated_at)
					 values (?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					donor.fullName,
					`${donor.key}${DEMO_EMAIL_DOMAIN}`,
					donor.organisationName ?? null,
					donor.isDiaspora ? 1 : 0,
					donor.country,
					donor.notes,
					now,
					now
				);
			donorIds.set(donor.key, Number(lastInsertRowid));
		}

		const pledgeIds = new Map<string, number>();
		for (const pledge of PLEDGES) {
			const started = monthsAgo(9);
			const next = new Date(now);
			next.setMonth(next.getMonth() + 1);
			const { lastInsertRowid } = db
				.prepare(
					`insert into recurring_pledges
					   (donor_id, amount, currency, designation_type, status,
					    next_reminder_date, reminder_channel, started_at, created_at, updated_at)
					 values (?, ?, ?, 'general_fund', 'active', ?, 'email', ?, ?, ?)`
				)
				.run(
					donorIds.get(pledge.donor),
					toMinor(pledge.major),
					pledge.currency,
					isoDate(next.getTime()),
					started,
					started,
					started
				);
			pledgeIds.set(pledge.donor, Number(lastInsertRowid));
		}

		DONATIONS.forEach((donation, index) => {
			const at = monthsAgo(donation.monthsAgo, index % 20);
			const designation = donation.designation;
			// A monthly gift belongs to the standing pledge it pays off, which is
			// what moves the donor's next reminder on when finance matches it.
			const pledgeId =
				donation.frequency === 'monthly' ? (pledgeIds.get(donation.donor) ?? null) : null;

			db.prepare(
				`insert into donations
				   (donor_id, amount, currency, frequency, designation_type,
				    designation_pillar_id, designation_initiative_id,
				    payment_method_id, payment_account_id, status, reference_code,
				    completed_at, donor_message, recurring_pledge_id, region_id,
				    created_at, updated_at)
				 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				donorIds.get(donation.donor),
				toMinor(donation.major),
				donation.currency,
				donation.frequency ?? 'one_time',
				designation?.type ?? 'general_fund',
				designation?.type === 'pillar' ? designation.id : null,
				designation?.type === 'future_initiative' ? designation.id : null,
				// The international account for foreign currency, Telebirr or the
				// bank for birr — so the method column on the queue reads sensibly.
				donation.currency === 'ETB' ? 2 : 3,
				donation.currency === 'ETB' ? 1 : 3,
				donation.status,
				`${REFERENCE_PREFIX}${donation.currency}-${String(index + 1).padStart(3, '0')}`,
				donation.status === 'completed' ? at : null,
				donation.message ?? null,
				pledgeId,
				1,
				at,
				at
			);
		});

		for (const [index, payment] of DISBURSEMENTS.entries()) {
			const at = monthsAgo(payment.monthsAgo, index);
			db.prepare(
				`insert into disbursements
				   (form_submission_id, beneficiary_id, pillar_id, amount, currency, paid_to,
				    disbursement_date, fund_source, narrative, is_active, created_at, updated_at)
				 values (?, 1, ?, ?, ?, ?, ?, 'general_fund', ?, 1, ?, ?)`
			).run(
				1,
				payment.pillarId,
				toMinor(payment.major),
				payment.currency,
				payment.paidTo,
				isoDate(at),
				`${REFERENCE_PREFIX}demo payment`,
				at,
				at
			);
		}

		// Onto a case that has no needs recorded yet, so nothing real is disturbed.
		for (const need of NEEDS) {
			db.prepare(
				`insert into application_needs
				   (form_submission_id, need_id, detail, estimated_amount, currency, urgency, created_at)
				 values (18, ?, ?, ?, ?, ?, ?)`
			).run(
				need.needId,
				`${REFERENCE_PREFIX}${need.detail}`,
				toMinor(need.major),
				need.currency,
				need.urgency,
				now
			);
		}

		/**
		 * Donor lifetime totals, by the same rule the reconcile action uses:
		 * the largest *single* currency, named by `lifetime_currency`. Summing
		 * every currency into that one column is the bug it replaced.
		 */
		for (const donorId of donorIds.values()) {
			const largest = db
				.prepare(
					`select currency, coalesce(sum(amount), 0) total
					   from donations
					  where donor_id = ? and status = 'completed' and deleted_at is null
					  group by currency
					  order by total desc
					  limit 1`
				)
				.get(donorId) as { currency: string; total: number } | undefined;

			const counted = db
				.prepare(
					`select count(*) gifts, max(completed_at) last
					   from donations
					  where donor_id = ? and status = 'completed' and deleted_at is null`
				)
				.get(donorId) as { gifts: number; last: number | null };

			db.prepare(
				`update donors
				    set lifetime_total = ?, lifetime_currency = ?, donation_count = ?,
				        last_donation_at = ?, updated_at = ?
				  where id = ?`
			).run(
				Number(largest?.total ?? 0),
				largest?.currency ?? 'ETB',
				counted.gifts,
				counted.last,
				now,
				donorId
			);
		}
	})();

	return donorIds.size;
}

/**
 * Rewrites the cached `funds_raised` counters, one row per currency.
 *
 * The homepage reads the cache, and the server only recomputes it hourly and
 * on boot — without this the public counter would keep showing the old single
 * figure until something happened to warm it, which makes the demo look broken
 * rather than multi-currency.
 */
function refreshFundsRaisedCache() {
	const totals = db
		.prepare(
			`select currency, coalesce(sum(amount), 0) total
			   from donations
			  where status = 'completed' and deleted_at is null
			  group by currency
			  order by total desc`
		)
		.all() as { currency: string; total: number }[];

	db.transaction(() => {
		db.prepare(`delete from impact_metrics_cache where key = 'funds_raised'`).run();
		for (const row of totals) {
			db.prepare(
				`insert into impact_metrics_cache (key, pillar_id, region_id, value, currency, computed_at)
				 values ('funds_raised', null, null, ?, ?, ?)`
			).run(row.total, row.currency, now);
		}
	})();

	return totals;
}

/* ==========================================================================
   Run
   ========================================================================== */

const removed = removeDemoData();

if (clean) {
	console.log('Removed demo money data:', removed);
} else {
	const donorCount = insertDemoData();
	console.log(
		`Inserted ${donorCount} donors, ${DONATIONS.length} donations, ` +
			`${PLEDGES.length} pledges, ${DISBURSEMENTS.length} disbursements, ${NEEDS.length} needs.`
	);
}

const totals = refreshFundsRaisedCache();
console.log('Funds raised, per currency:', totals);

db.close();
