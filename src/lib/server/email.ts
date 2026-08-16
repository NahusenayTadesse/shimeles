import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

/**
 * Outbound mail.
 *
 * SMTP settings are read dynamically, like the database URL: they are
 * deployment config, and a missing one should surface when a send is attempted
 * rather than failing the whole build on a machine that never sends mail.
 *
 * Templates here stay deliberately plain and deliberately content-free where
 * case data is concerned — a notification tells staff that something arrived
 * and links to the dashboard, where opening the record writes an audit row.
 * Emailing the contents of a Mental Wellness application would put it in an
 * inbox nobody audits.
 */
const transporter = nodemailer.createTransport({
	host: env.SMTP_HOST,
	port: Number(env.SMTP_PORT ?? 465),
	secure: env.SMTP_SECURE !== 'false',
	auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
});

const FROM_NAME = env.MAIL_FROM_NAME ?? 'Shimeles Abera Foundation';

export const sendEmail = async (to: string, subject: string, html: string) => {
	if (!env.SMTP_HOST) {
		// A development machine with no SMTP configured should log rather than
		// throw: a broken mail server must not break a form submission.
		console.info(`[email skipped — no SMTP_HOST] to=${to} subject=${subject}`);
		return;
	}

	await transporter.sendMail({
		from: `"${FROM_NAME}" <${env.SMTP_USER ?? env.MAIL_FROM ?? 'noreply@localhost'}>`,
		to,
		subject,
		html
	});
};

/* ==========================================================================
   Templates
   ========================================================================== */

const shell = (heading: string, body: string) => `
	<div style="font-family: system-ui, sans-serif; color: #2b2622; max-width: 600px; margin: auto; border: 1px solid #ece7e0; border-radius: 12px; overflow: hidden;">
		<div style="background: #b4622f; padding: 24px; text-align: center;">
			<h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 600;">${heading}</h1>
		</div>
		<div style="padding: 24px; line-height: 1.6;">${body}</div>
		<div style="background: #faf7f2; padding: 16px; text-align: center; font-size: 12px; color: #7a716a;">
			${FROM_NAME}
		</div>
	</div>
`;

/** Acknowledges an assistance application to the person who made it. */
export const applicantAcknowledgementTemplate = (name: string, reference: string) => ({
	subject: `We have your request — ${reference}`,
	html: shell(
		'We have your request',
		`<p>Dear ${name},</p>
		 <p>Your request has reached us. Your reference number is <strong>${reference}</strong>.</p>
		 <p>Please quote it whenever you contact us about this request. Someone will be in touch.</p>`
	)
});

/** Thanks a donor and repeats the reference they must quote on their transfer. */
export const donationPledgeTemplate = (
	name: string,
	amountLabel: string,
	referenceCode: string,
	accountLines: string[]
) => ({
	subject: `Thank you — your gift reference is ${referenceCode}`,
	html: shell(
		'Thank you for your gift',
		`<p>Dear ${name},</p>
		 <p>Thank you for pledging <strong>${amountLabel}</strong>.</p>
		 <p>To complete it, make your transfer to the account below and
		 <strong>include ${referenceCode} as the reference</strong> — that is how we
		 match your gift to your name.</p>
		 <div style="background: #faf7f2; border-radius: 8px; padding: 16px; margin: 16px 0;">
			${accountLines.map((line) => `<div>${line}</div>`).join('')}
		 </div>
		 <p>Once we see it on our statement we will confirm and send your receipt.</p>`
	)
});

/** Confirms a reconciled donation — the receipt. */
export const donationReceiptTemplate = (
	name: string,
	amountLabel: string,
	referenceCode: string,
	designation: string
) => ({
	subject: `Your gift has been received — ${referenceCode}`,
	html: shell(
		'Your gift has been received',
		`<p>Dear ${name},</p>
		 <p>We have matched your transfer of <strong>${amountLabel}</strong> (reference
		 ${referenceCode}) and it is now on its way to <strong>${designation}</strong>.</p>
		 <p>Thank you for standing with the families we serve.</p>`
	)
});

/** Tells a volunteer applicant their form arrived and what happens next. */
export const volunteerAcknowledgementTemplate = (name: string, reference: string) => ({
	subject: `Thank you for offering to volunteer — ${reference}`,
	html: shell(
		'Thank you for offering to help',
		`<p>Dear ${name},</p>
		 <p>We have your volunteer application, reference <strong>${reference}</strong>.</p>
		 <p>Because our volunteers work alongside people in vulnerable moments, every
		 application goes through a safeguarding review before placement. We will be
		 in touch about the next step.</p>`
	)
});
