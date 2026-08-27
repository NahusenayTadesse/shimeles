/**
 * Sends one of every template to a real inbox.
 *
 *     npm run mail:test -- you@example.com
 *
 * What it is for: the templates are hand-written HTML, and the only way to
 * know a logo has not blown out or a button has not collapsed is to open one
 * in a real mail client. `vitest` checks the helpers; this checks the result.
 *
 * It renders through **the application's own templates** — `email-templates.ts`
 * is dependency-free precisely so this file can import it. An earlier version
 * kept its own copy of the shell and the copy drifted: it was still sending
 * the old terracotta design after the real one had gone green, which is
 * exactly the failure a test tool must not have. The only thing invented here
 * is the sample data.
 *
 * It talks to whatever SMTP server `.env` names, so it sends *real mail from
 * the Foundation's real address*. It therefore refuses to run without an
 * explicit recipient on the command line — no default, no address baked in.
 *
 * Runs under `tsx`, never `bun`, like every other script here.
 */
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import {
	applicantAcknowledgementTemplate,
	contactAcknowledgementTemplate,
	donationPledgeTemplate,
	donationReceiptTemplate,
	htmlToText,
	inKindDecisionTemplate,
	inKindOfferTemplate,
	magicLinkTemplate,
	passwordResetTemplate,
	plainTemplate,
	replyTemplate,
	shell,
	statusChangeTemplate,
	volunteerAcknowledgementTemplate,
	type EmailTemplate
} from '../src/lib/server/email-templates';

const recipient = process.argv[2];

if (!recipient || !recipient.includes('@')) {
	console.error(
		'Give an address to send to:\n\n  npm run mail:test -- you@example.com\n\n' +
			'This sends real mail from the Foundation account, so there is deliberately no default.'
	);
	process.exit(1);
}

/** `.env` by hand — `$env/dynamic/private` only exists inside Vite. */
const env = Object.fromEntries(
	readFileSync('.env', 'utf8')
		.split('\n')
		.filter((line) => line.includes('=') && !line.trim().startsWith('#'))
		.map((line) => {
			const at = line.indexOf('=');
			return [
				line.slice(0, at).trim(),
				line
					.slice(at + 1)
					.trim()
					.replace(/^["']|["']$/g, '')
			];
		})
);

const brandName = env.MAIL_FROM_NAME ?? 'Shimeles Abera Foundation';
const port = Number(env.SMTP_PORT ?? 465);

/**
 * The origin the logo and the footer links are built from.
 *
 * `site.url` lives in the database, which this script deliberately does not
 * open, so it is overridable here — point it at a dev server to check that a
 * locally-changed logo renders.
 *
 *     MAIL_TEST_ORIGIN=http://localhost:5173 npm run mail:test -- you@example.com
 *
 * Note that a private origin will show a broken logo in your inbox: your mail
 * client cannot reach your laptop. That is the point of the default.
 */
const origin = (env.MAIL_TEST_ORIGIN || 'https://shimelesaberafoundation.org').replace(/\/+$/, '');

const transporter = nodemailer.createTransport({
	host: env.SMTP_HOST,
	port,
	secure: env.SMTP_SECURE ? env.SMTP_SECURE !== 'false' : port === 465,
	auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
});

/* --- Sample data, run through the real templates -------------------------- */

const SAMPLES: { name: string; template: EmailTemplate }[] = [
	{
		name: 'apply — acknowledgement',
		template: applicantAcknowledgementTemplate('Almaz Bekele', 'SAF-APP-2026-0042')
	},
	{
		name: 'apply — approved',
		template: statusChangeTemplate({
			name: 'Almaz Bekele',
			reference: 'SAF-APP-2026-0042',
			statusLabel: 'Approved',
			publicDescription:
				'Your request has been approved. Someone from the team will be in touch to arrange ' +
				'what happens next. There is nothing you need to do in the meantime.',
			note: 'We have booked you into the medical hardship programme starting next month.',
			kind: 'application'
		})
	},
	{
		name: 'apply — declined',
		template: statusChangeTemplate({
			name: 'Almaz Bekele',
			reference: 'SAF-APP-2026-0042',
			statusLabel: 'Not proceeding',
			publicDescription:
				'We are not able to take this request forward. That is not a judgement about you or ' +
				'your situation — we can only reach a limited number of families at a time. You are ' +
				'welcome to apply again.',
			kind: 'application'
		})
	},
	{
		name: 'volunteer — acknowledgement',
		template: volunteerAcknowledgementTemplate('Hanna Wolde', 'SAF-VOL-2026-0011')
	},
	{
		name: 'volunteer — approved',
		template: statusChangeTemplate({
			name: 'Hanna Wolde',
			reference: 'SAF-VOL-2026-0011',
			statusLabel: 'Approved to volunteer',
			publicDescription:
				'Your safeguarding review is complete and you are approved to volunteer with us. ' +
				'The coordinator will be in touch about placing you.',
			kind: 'volunteer'
		})
	},
	{
		name: 'contact — acknowledgement',
		template: contactAcknowledgementTemplate({
			name: 'Daniel Tesfaye',
			reference: 'SAF-MSG-2026-0007',
			topic: 'Donating or fundraising',
			responseTarget: 'within two working days'
		})
	},
	{
		name: 'contact — a staff reply',
		template: replyTemplate({
			name: 'Daniel Tesfaye',
			reference: 'SAF-MSG-2026-0007',
			about: 'message',
			body:
				'Thank you for getting in touch about setting up a monthly gift.\n\n' +
				'You can start one from the donate page, and we will send a reminder each month ' +
				'with the reference to quote.'
		})
	},
	{
		name: 'application — a caseworker reply',
		template: replyTemplate({
			name: 'Almaz Bekele',
			reference: 'SAF-MED-2026-0042',
			about: 'request',
			body:
				'Thank you for your application. I have spoken to the hospital and they have ' +
				'confirmed the outstanding balance.\n\n' +
				'We can cover the treatment cost in full. You do not need to send anything further.\n\n' +
				'Someone will call you on Thursday to arrange the paperwork.'
		})
	},
	{
		name: 'donation — pledge, awaiting transfer',
		template: donationPledgeTemplate('Mekdes Alemu', 'ETB 2,500.00', 'SAF-DON-2026-0031', [
			'Commercial Bank of Ethiopia',
			'Shimeles Abera Foundation',
			'1000 1234 5678 90'
		])
	},
	{
		name: 'donation — receipt',
		template: donationReceiptTemplate(
			'Daniel Tesfaye',
			'$1,000.00',
			'SAF-DON-2026-0018',
			'A free hospital'
		)
	},
	{
		name: 'in-kind — offer received',
		template: inKindOfferTemplate('Abeba Kassa', 'SAF-GIF-2026-0004', "4 boxes of children's coats")
	},
	{
		name: 'in-kind — handover booked',
		template: inKindDecisionTemplate({
			name: 'Abeba Kassa',
			referenceCode: 'SAF-GIF-2026-0004',
			summary: "4 boxes of children's coats",
			outcome: 'scheduled',
			note: 'Please bring them to the Kolfe office reception.',
			when: '2026-09-04'
		})
	},
	{
		name: 'account — password reset',
		template: passwordResetTemplate({
			name: 'System Admin',
			url: `${origin}/reset-password?token=example-token-not-a-real-one`,
			expiresIn: 60 * 60
		})
	},
	{
		name: 'account — magic sign-in link',
		template: magicLinkTemplate({
			name: null,
			url: `${origin}/api/auth/magic-link/verify?token=example-token-not-a-real-one`,
			expiresIn: 60 * 15
		})
	},
	{
		name: 'staff — new enquiry notification',
		template: plainTemplate(
			'New enquiry',
			'A new message has arrived through the contact form.\n\n' +
				'Reference: SAF-MSG-2026-0007\nTopic: Donating or fundraising\n\n' +
				`Read and reply here: ${origin}/dashboard/messages/7`,
			'New enquiry, Donating or fundraising: SAF-MSG-2026-0007',
			{ label: 'Open in the dashboard', href: '/dashboard/messages/7' }
		)
	}
];

/* --- Send ----------------------------------------------------------------- */

const from = `"${brandName}" <${env.MAIL_FROM || env.SMTP_USER || 'noreply@localhost'}>`;

console.log(`Sending ${SAMPLES.length} test emails to ${recipient}`);
console.log(`  from:   ${from}`);
console.log(`  origin: ${origin}  (logo and links)\n`);

for (const sample of SAMPLES) {
	const html = shell(sample.template.heading, sample.template.body, {
		origin,
		action: sample.template.action,
		brandName
	});

	try {
		const info = await transporter.sendMail({
			from,
			to: recipient,
			// Tagged so a whole test run can be found and binned in one search.
			subject: `[TEST] ${sample.template.subject}`,
			html,
			text: sample.template.text ?? htmlToText(html)
		});
		console.log(`  ✓ ${sample.name.padEnd(38)} ${info.messageId}`);
	} catch (err) {
		console.log(`  ✗ ${sample.name.padEnd(38)} ${(err as Error).message}`);
	}
}

transporter.close();
console.log('\nDone.');
