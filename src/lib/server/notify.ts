import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { formDefinitions } from '$lib/server/db/schema';
import { setting } from '$lib/server/settings';
import { sendEmail } from '$lib/server/email';
import type { SubmitResult } from '$lib/server/submissions';

/**
 * Outbound notifications.
 *
 * Deliberately thin and deliberately non-blocking: every caller invokes these
 * with `void … .catch(…)`, because a slow SMTP server must never make an
 * applicant wait or fail a submission that is already stored.
 *
 * Notification recipients are `form_definitions.notify_emails`, so which staff
 * member is told about a new Mental Wellness case is a dashboard setting.
 * Nothing about *what* is sent includes case detail — the email says a
 * submission arrived and gives its reference, and staff read the case in the
 * dashboard where the read is audited (§3.11).
 */

export async function notifyNewSubmission(slug: string, result: SubmitResult): Promise<void> {
	const [definition] = await db
		.select({
			name: formDefinitions.name,
			notifyEmails: formDefinitions.notifyEmails
		})
		.from(formDefinitions)
		.where(and(eq(formDefinitions.slug, slug), isNull(formDefinitions.deletedAt)))
		.limit(1);

	if (!definition) return;

	const fallback = await setting('contact.email_primary');
	const recipients = definition.notifyEmails?.length
		? definition.notifyEmails
		: fallback
			? [fallback]
			: [];

	if (recipients.length === 0) return;

	const origin = await setting('site.url');
	const subject = `New ${definition.name}: ${result.referenceNumber}`;
	const body = [
		`A new submission has arrived through the ${definition.name}.`,
		'',
		`Reference: ${result.referenceNumber}`,
		'',
		// The link, not the content. The case itself is only readable in the
		// dashboard, where opening it writes an audit row.
		origin ? `Open it here: ${origin}/dashboard/applications/${result.id}` : ''
	]
		.filter(Boolean)
		.join('\n');

	await Promise.all(recipients.map((to) => sendEmail(to, subject, escapeHtml(body))));
}

/**
 * Tells the volunteer coordinator that an application has arrived.
 *
 * Recipients still come from the `volunteer-application` form definition when
 * one exists, even though `/volunteer` no longer renders from it — that row is
 * where a coordinator has always set "who gets told", and moving the setting
 * somewhere else would silently redirect the notifications. Falls back to the
 * Foundation's primary contact address.
 */
export async function notifyNewVolunteer(result: SubmitResult): Promise<void> {
	const [definition] = await db
		.select({ notifyEmails: formDefinitions.notifyEmails })
		.from(formDefinitions)
		.where(
			and(eq(formDefinitions.slug, 'volunteer-application'), isNull(formDefinitions.deletedAt))
		)
		.limit(1);

	const fallback = await setting('contact.email_primary');
	const recipients = definition?.notifyEmails?.length
		? definition.notifyEmails
		: fallback
			? [fallback]
			: [];

	if (recipients.length === 0) return;

	const origin = await setting('site.url');
	const subject = `New volunteer application: ${result.referenceNumber}`;
	const body = [
		'Someone has offered to volunteer.',
		'',
		`Reference: ${result.referenceNumber}`,
		'',
		// The link, not the content — the same rule as every other notification
		// here. Reading the application is an audited act (§3.11).
		origin ? `Open it here: ${origin}/dashboard/volunteers/${result.id}` : ''
	]
		.filter(Boolean)
		.join('\n');

	await Promise.all(recipients.map((to) => sendEmail(to, subject, escapeHtml(body))));
}

/**
 * Tells staff that somebody has offered goods.
 *
 * Unlike a cash gift, this one needs a human before anything else happens —
 * a coordinator has to decide whether the Foundation can take it and book a
 * collection — so the notification goes out on submission rather than waiting
 * for a queue to be checked. Recipients are the Foundation's primary contact
 * address; there is no form definition behind this page to configure.
 */
export async function notifyNewInKindOffer(offer: {
	id: number;
	referenceCode: string;
	summary: string;
}): Promise<void> {
	const to = await setting('contact.email_primary');
	if (!to) return;

	const origin = await setting('site.url');
	const body = [
		'Somebody has offered goods through the donate page.',
		'',
		`Reference: ${offer.referenceCode}`,
		`Offered: ${offer.summary}`,
		'',
		// The link, not the detail: the offer carries a home address, and it is
		// read in the dashboard where the read is audited (§3.11).
		origin ? `Open it here: ${origin}/dashboard/in-kind/${offer.id}` : ''
	]
		.filter(Boolean)
		.join('\n');

	await sendEmail(to, `New offer of goods: ${offer.referenceCode}`, escapeHtml(body));
}

/** Reminder for a standing pledge that has come due (§3.5). */
export async function notifyPledgeReminder(
	to: string,
	donorName: string,
	amountLabel: string,
	referenceCode: string
): Promise<void> {
	const subject = 'Your monthly gift to the Shimeles Abera Foundation';
	const body = [
		`Dear ${donorName},`,
		'',
		`This is your reminder for the ${amountLabel} gift you pledged.`,
		`Please quote this reference on your transfer: ${referenceCode}`,
		'',
		'Thank you for standing with the families we serve.'
	].join('\n');

	await sendEmail(to, subject, escapeHtml(body));
}

/** Plain-text bodies still go out as HTML, so the newlines need help. */
const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />');
