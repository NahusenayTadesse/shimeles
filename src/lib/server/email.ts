import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import { setting } from '$lib/server/settings';
import { DEFAULT_ORIGIN, htmlToText, shell, type EmailTemplate } from '$lib/server/email-templates';

/**
 * Outbound mail.
 *
 * One sender, many templates. A template is a pure function returning an
 * `EmailTemplate` — `{ subject, html, text? }` — and knows nothing about SMTP;
 * `sendEmail` knows nothing about wording. Sending one is the two spread
 * together:
 *
 *     await sendEmail({ to: donor.email, ...donationReceiptTemplate(…) });
 *
 * which is why every template returns that exact shape. Adding a template is
 * therefore a function in the Templates section below and no change here.
 *
 * SMTP settings are read dynamically, like the database URL: they are
 * deployment config, and a missing one should surface when a send is attempted
 * rather than failing the whole build on a machine that never sends mail.
 *
 * Templates stay deliberately plain and deliberately content-free where case
 * data is concerned — a notification tells staff that something arrived and
 * links to the dashboard, where opening the record writes an audit row.
 * Emailing the contents of a Mental Wellness application would put it in an
 * inbox nobody audits.
 */

/* ==========================================================================
   The sender
   ========================================================================== */

export interface EmailAttachment {
	filename: string;
	/** File contents. A path is deliberately not accepted — see `sendEmail`. */
	content: Buffer | string;
	contentType?: string;
}

export interface EmailMessage extends EmailTemplate {
	/** One address or several. Empty is not an error; it is a skipped send. */
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	/**
	 * Where a human reply should land. Several templates promise the reader
	 * they can "just reply", and without this that reply goes to the SMTP
	 * account, which nobody reads. Defaults to `MAIL_REPLY_TO` when set.
	 */
	replyTo?: string;
	/** Overrides the configured sender. Rarely wanted; kept for completeness. */
	from?: string;
	attachments?: EmailAttachment[];
}

export type EmailResult =
	| { sent: true; messageId: string | undefined }
	/**
	 * `no-smtp-host` and `no-recipient` are not errors: a dev machine with no
	 * mail configured, or a template addressed to somebody who never gave an
	 * address. Callers record them rather than treat them as failures, which is
	 * how `contact.ts` shows an unsent reply as unsent.
	 *
	 * `send-failed` only ever comes from `sendEmailToEach`, which catches per
	 * recipient so one dead address cannot stop the rest. A direct `sendEmail`
	 * throws on a real SMTP failure instead — the caller is the one who knows
	 * whether that should fail the request.
	 */
	| { sent: false; reason: 'no-smtp-host' | 'no-recipient' | 'send-failed' };

const FROM_NAME = env.MAIL_FROM_NAME ?? 'Shimeles Abera Foundation';

/**
 * Where a staff notification goes when nothing more specific is configured.
 *
 * The SMTP account itself, because it is the one address that is guaranteed to
 * exist, to be monitored, and to belong to the Foundation. The fallback used
 * to be a seeded placeholder (`hello@saf.org`) — a real domain the Foundation
 * does not own, which meant a fresh installation quietly mailed a stranger
 * every time somebody used the contact form.
 *
 * `MAIL_ADMIN` overrides it for a deployment that authenticates as one mailbox
 * but wants its alerts somewhere else. This is the *last* resort: a per-form
 * `notify_emails` list and the `contact.email_primary` setting both win, so
 * routing stays a dashboard decision (§0).
 */
export const adminEmail = (): string => (env.MAIL_ADMIN || env.SMTP_USER || '').trim();

/**
 * The staff addresses a notification should go to, most specific first.
 *
 * One helper because the four notification functions each grew their own
 * copy of this chain and had already drifted — some fell back to the primary
 * contact address, some gave up and sent nothing at all, which is how a
 * notification silently stops existing.
 */
export async function staffRecipients(configured?: string[] | null): Promise<string[]> {
	if (configured?.length) return configured;

	const primary = (await setting('contact.email_primary')).trim();
	if (primary) return [primary];

	const admin = adminEmail();
	return admin ? [admin] : [];
}

/**
 * Built on first use, not at import.
 *
 * `$env/dynamic/private` is only populated at runtime, so a transport
 * constructed at module scope reads an empty host during prerender and keeps
 * it for the life of the process. Nodemailer pools connections internally, so
 * caching the one transport is what keeps a burst of notifications from
 * opening a socket each.
 */
let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
	transporter ??= nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT ?? 465),
		// Port 465 is implicit TLS; 587 upgrades with STARTTLS. Deriving it from
		// the port means one fewer setting to get wrong, and `SMTP_SECURE`
		// remains the override for a server that does something unusual.
		secure: env.SMTP_SECURE ? env.SMTP_SECURE !== 'false' : Number(env.SMTP_PORT ?? 465) === 465,
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
	});
	return transporter;
};

/** Drops empties, so `[to, maybeCc].filter(Boolean)` is not every caller's job. */
const addresses = (value: string | string[] | undefined): string[] =>
	(Array.isArray(value) ? value : value ? [value] : []).map((one) => one.trim()).filter(Boolean);

/**
 * Sends one message.
 *
 * Throws only on an actual SMTP failure. A missing host or a missing recipient
 * returns `{ sent: false }` instead, because neither is a bug worth failing a
 * form submission over: an applicant whose request was stored must not see an
 * error because the mail server is down.
 *
 * Attachments take content, never a path. Everything this system might attach
 * is a stored file behind `/files`, which is access-controlled and audited;
 * letting a caller name an arbitrary path would route around both.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
	const to = addresses(message.to);
	const cc = addresses(message.cc);
	const bcc = addresses(message.bcc);

	if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
		return { sent: false, reason: 'no-recipient' };
	}

	if (!env.SMTP_HOST) {
		// A development machine with no SMTP configured should log rather than
		// throw: a broken mail server must not break a form submission.
		console.info(`[email skipped: no SMTP_HOST] to=${to.join(', ')} subject=${message.subject}`);
		return { sent: false, reason: 'no-smtp-host' };
	}

	// The branding is applied here rather than in the template, because it needs
	// the site origin for the logo and the footer links — see `renderEmail`.
	const html = await renderEmail(message);

	const info = await getTransporter().sendMail({
		from:
			message.from ?? `"${FROM_NAME}" <${env.MAIL_FROM ?? env.SMTP_USER ?? 'noreply@localhost'}>`,
		to: to.length ? to : undefined,
		cc: cc.length ? cc : undefined,
		bcc: bcc.length ? bcc : undefined,
		replyTo: message.replyTo ?? env.MAIL_REPLY_TO ?? undefined,
		subject: message.subject,
		html,
		text: message.text ?? htmlToText(html),
		attachments: message.attachments
	});

	return { sent: true, messageId: info.messageId };
}

/**
 * Sends the same message to several people as separate messages.
 *
 * Separate, not one message with several `to` addresses: staff notification
 * lists come from `form_definitions.notify_emails` and a shared `to` header
 * discloses the whole list to everyone on it. Failures are collected rather
 * than thrown, so one dead address does not stop the rest going out.
 */
export async function sendEmailToEach(
	recipients: string[],
	template: EmailTemplate & Omit<Partial<EmailMessage>, 'to'>
): Promise<EmailResult[]> {
	return Promise.all(
		addresses(recipients).map((to) =>
			sendEmail({ ...template, to }).catch((err): EmailResult => {
				console.error(`email to ${to} failed`, err);
				return { sent: false, reason: 'send-failed' };
			})
		)
	);
}

/* ==========================================================================
   Branding and templates
   ========================================================================== */

/**
 * Re-exported so every caller imports one module, `$lib/server/email`, and
 * never has to know which half a helper lives in. The split exists for
 * `scripts/send-test-emails.ts` and the unit tests, not for callers.
 */
export * from '$lib/server/email-templates';

/**
 * Where every absolute URL in an email points.
 *
 * `site.url`, not the request's origin — the same rule `$lib/seo.ts` follows,
 * and for a sharper reason here. An email outlives the request that sent it:
 * it is opened next week, on a phone, long after that request is gone. Build
 * its links from `event.url.origin` and whatever host happened to serve the
 * form gets baked in permanently — a donor receipt linking to `localhost:5173`
 * because the pledge was made in development, or to a preview deployment, or
 * to `www.` when the canonical host is the apex. Worse, half the mail here has
 * no request at all behind it: pledge reminders and the hourly jobs run on a
 * timer, where `event` does not exist.
 *
 * Falls back to the production origin so a fresh installation with the setting
 * unset still sends a working logo rather than a broken image.
 */
const siteOrigin = async (): Promise<string> => {
	const configured = (await setting('site.url')).trim();
	return (configured || DEFAULT_ORIGIN).replace(/\/+$/, '');
};

/** Renders a template into the finished HTML that goes down the wire. */
export const renderEmail = async (template: EmailTemplate): Promise<string> =>
	shell(template.heading, template.body, {
		origin: await siteOrigin(),
		action: template.action,
		brandName: FROM_NAME
	});
