/**
 * The look of an email, and the words in one.
 *
 * Split out of `email.ts` and deliberately **dependency-free** — no `$lib`
 * alias, no `$env`, no database. Two things depend on that purity:
 *
 *  - `scripts/send-test-emails.ts` runs under `tsx`, outside Vite, where
 *    `$lib` and `$env/dynamic/private` do not resolve. It imports this file
 *    directly, so what it puts in your inbox is rendered by the same code the
 *    application uses. It used to hold a *copy* of the shell, which promptly
 *    drifted: the copy still sent the old terracotta design after the real one
 *    had gone green.
 *  - The unit tests exercise it without standing up a database.
 *
 * `../dates` is a relative import for the same reason — it is the one place in
 * this codebase that does not use the `$lib` alias, and it is not an oversight.
 *
 * Everything that needs config or a connection — the transport, the site
 * origin, the actual send — lives in `email.ts`, which re-exports this module
 * so callers only ever import `$lib/server/email`.
 */
import { formatDayLong } from '../dates';

/** A link rendered as a button. `href` may be a path — it is resolved against the site origin. */
export interface EmailAction {
	label: string;
	/** `/donate`, or an absolute URL for somewhere off-site. */
	href: string;
}

/**
 * What every template returns.
 *
 * Deliberately *not* a finished HTML document. A template supplies the words —
 * a heading, a body, maybe one thing to click — and `sendEmail` wraps them in
 * the Foundation's shell at send time. The wrapping has to happen there
 * because the shell needs the site's own origin for the logo and the footer
 * links, and that is an awaited setting, not something a pure template
 * function can reach. Keeping the templates sync is worth the indirection: it
 * is what makes them testable and what keeps the branding in exactly one
 * place, so a new template gets the logo without asking for it.
 */
export interface EmailTemplate {
	subject: string;
	/** Sits under the logo, in the green band. */
	heading: string;
	/** Inner HTML. Use `paragraphs()` for anything a person typed. */
	body: string;
	/** The one thing to click, rendered as the green button under the body. */
	action?: EmailAction;
	/**
	 * The plain-text alternative. Optional: `sendEmail` derives a readable one
	 * from the rendered HTML when a template does not write its own, because an
	 * HTML-only message scores badly with spam filters and reads as an empty
	 * message in a text-only client.
	 */
	text?: string;
}

/* ==========================================================================
   Building a template
   ========================================================================== */

/** Escapes text destined for an HTML body. Never skip it on typed-in content. */
export const escapeHtml = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Turns typed-in prose into paragraphs.
 *
 * Blank lines become paragraphs, single newlines become `<br />`. Sending a
 * plain-text body straight into an HTML message — which is what this codebase
 * used to do — collapses every newline, so a staff notification with a
 * reference on its own line arrived as one run-on sentence.
 */
export const paragraphs = (text: string): string =>
	text
		.split(/\n{2,}/)
		.map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br />')}</p>`)
		.join('\n');

/**
 * The inset sand panel used for bank details and staff notes.
 *
 * A named helper because it appeared inline in three templates with three
 * slightly different paddings, and a shared surface that drifts is worse than
 * no shared surface.
 */
export const panel = (inner: string): string =>
	`<div style="background: ${BRAND.sand}; border-left: 3px solid ${BRAND.gold}; border-radius: 8px; padding: 16px 18px; margin: 18px 0;">${inner}</div>`;

/**
 * A closing aside — the reference line, a "you can just reply" note.
 *
 * A rule above it and real space around it, because without them it reads as a
 * runt paragraph glued to the end of the message. That is what the contact
 * reply looked like: 13px grey text flush against the last sentence, carrying
 * the one thing the reader most needs to keep.
 */
export const footnote = (inner: string): string =>
	`<div style="margin: 26px 0 0; padding-top: 18px; border-top: 1px solid ${BRAND.line}; font-size: 13px; line-height: 1.6; color: ${BRAND.muted};">${inner}</div>`;

/**
 * The reference number, given the prominence it earns.
 *
 * It is the only thing in most of these emails the reader has to keep, and it
 * is the first thing they will be asked for. Buried in a sentence it is
 * unfindable on a phone six weeks later.
 */
export const referencePanel = (reference: string): string =>
	panel(
		`<div style="font-size: 13px; color: ${BRAND.muted};">Your reference number</div>
		 <div style="font-size: 19px; font-weight: 600; color: ${BRAND.green}; letter-spacing: 0.02em;">${escapeHtml(
				reference
			)}</div>`
	);

/**
 * A readable plain-text alternative, derived from the HTML.
 *
 * Not a general HTML-to-text converter, and does not need to be: it only ever
 * sees the markup the templates in this file produce. Block ends become line
 * breaks so the text version keeps the shape of the message.
 */
export const htmlToText = (html: string): string =>
	html
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
		.replace(/<li[^>]*>/gi, '• ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.split('\n')
		.map((line) => line.trim())
		.join('\n')
		.trim();

/* ==========================================================================
   Templates
   ========================================================================== */

/**
 * The brand, in hex, because email has no CSS variables.
 *
 * Taken from `src/routes/layout.css`, which is the source of truth: `--clay`
 * is the Foundation's deep forest green and the site's *primary*, `--olive`
 * its gold. The old shell was built on `#b4622f`, a terracotta that appears
 * nowhere in that palette — and the palette's own note says terracotta is for
 * "pull-quotes, the odd tag, never a whole surface". The green leads here for
 * the same reason it leads on the website.
 */
export const BRAND = {
	green: '#0e3b2e',
	greenDeep: '#002117',
	greenBright: '#215848',
	gold: '#ccab59',
	sand: '#f9f4ec',
	ink: '#261d16',
	muted: '#6c6158',
	line: '#e6ded1'
} as const;

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
export const DEFAULT_ORIGIN = 'https://shimelesaberafoundation.org';

/** `/donate` → `https://…/donate`. An absolute URL is left alone. */
const absoluteUrl = (href: string, origin: string): string =>
	/^https?:\/\//i.test(href) ? href : `${origin}${href.startsWith('/') ? '' : '/'}${href}`;

/**
 * The standing links every email carries.
 *
 * Routes, not copy — these four are the Foundation's standing invitations and
 * they exist as pages in this codebase, so they are named here rather than
 * configured. The labels are the only editorial part, and they match the
 * site's own navigation wording.
 */
export const FOOTER_LINKS: EmailAction[] = [
	{ label: 'Visit the website', href: '/' },
	{ label: 'Donate', href: '/donate' },
	{ label: 'Apply for support', href: '/apply' },
	{ label: 'Volunteer', href: '/volunteer' },
	{ label: 'Contact us', href: '/contact' }
];

/** A green button. Padded anchor rather than a table so it degrades to a link. */
const button = (action: EmailAction, origin: string) => `
	<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
		<tr><td style="border-radius: 8px; background: ${BRAND.green};">
			<a href="${absoluteUrl(action.href, origin)}"
			   style="display: inline-block; padding: 13px 28px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; font-weight: 600; color: ${BRAND.sand}; text-decoration: none; border-radius: 8px;">${escapeHtml(action.label)}</a>
		</td></tr>
	</table>`;

/**
 * The Foundation's branded wrapper — an extension of the website, in the
 * subset of HTML that mail clients actually render.
 *
 * Tables and inline styles throughout, because Outlook has no flexbox, no
 * grid, and strips a `<style>` block. Width is fixed at 600px, the width every
 * client agrees on.
 *
 * The logo is a hosted image rather than an inline attachment. That is a real
 * trade-off: most clients block remote images until the reader clicks "show
 * images", so the header is built to work without it — the band is the brand
 * green whether or not the image loads, and the alt text carries the
 * Foundation's name. An attached copy would always display, at the cost of
 * ~48KB on every message and a filesystem read that differs between dev and a
 * built server. The logo's own background is this exact green, so when it does
 * load it sits in the band seamlessly rather than as a pasted rectangle.
 */
export const shell = (
	heading: string,
	body: string,
	options: { origin?: string; action?: EmailAction; brandName?: string } = {}
) => {
	const {
		origin = DEFAULT_ORIGIN,
		action,
		// A parameter rather than an env read, which is what keeps this module
		// free of `$env` and therefore importable from a plain tsx script.
		brandName = 'Shimeles Abera Foundation'
	} = options;

	return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${BRAND.sand}; margin: 0; padding: 24px 12px;">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">

   <!-- Header. The logo's own background is this green, so it sits in the
        band rather than on it; the band alone still reads as the brand when
        a client blocks the image. -->
   <tr><td align="center" style="background: ${BRAND.green}; padding: 28px 24px 22px;">
     <a href="${origin}" style="text-decoration: none;">
       <img src="${origin}/logo.png" width="300" height="99" alt="${escapeHtml(brandName)}"
            style="display: block; width: 300px; max-width: 82%; height: auto; border: 0;" />
     </a>
   </td></tr>

   <!-- The gold rule is the whole of the second brand colour: an accent
        against the green, never a surface of its own. -->
   <tr><td style="height: 4px; background: ${BRAND.gold}; line-height: 4px; font-size: 0;">&nbsp;</td></tr>

   <tr><td style="padding: 32px 32px 8px;">
     <h1 style="margin: 0 0 18px; font-size: 21px; line-height: 1.3; font-weight: 600; color: ${BRAND.green};">${escapeHtml(heading)}</h1>
   </td></tr>

   <tr><td style="padding: 0 32px 26px; font-size: 15px; line-height: 1.65; color: ${BRAND.ink};">
     ${body}
     ${action ? button(action, origin) : ''}
   </td></tr>

   <!-- Footer. The standing invitations, so any email is also a way back in. -->
   <tr><td align="center" style="padding: 22px 24px 26px; background: ${BRAND.sand};">
     <p style="margin: 0 0 12px; font-size: 13px; line-height: 2;">
       ${FOOTER_LINKS.map(
					(link) =>
						`<a href="${absoluteUrl(link.href, origin)}" style="color: ${BRAND.greenBright}; text-decoration: none; font-weight: 500; white-space: nowrap;">${escapeHtml(link.label)}</a>`
				).join(`<span style="color: ${BRAND.gold}; padding: 0 9px;">&bull;</span>`)}
     </p>
     <p style="margin: 0; font-size: 12px; line-height: 1.6; color: ${BRAND.muted};">
       ${escapeHtml(brandName)}<br />
       <span style="color: ${BRAND.greenBright};">Hope</span>
       <span style="color: ${BRAND.gold};">&bull;</span>
       <span style="color: ${BRAND.greenBright};">Compassion</span>
       <span style="color: ${BRAND.gold};">&bull;</span>
       <span style="color: ${BRAND.greenBright};">Opportunity</span>
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>`;
};

/**
 * A whole template from a heading and typed-in prose.
 *
 * The shortest path to a new email: the staff notifications are all this
 * shape, and it saves each one hand-escaping its own body and hand-writing its
 * own `<p>` tags — which is where the collapsed-newline bug came from.
 */
export const plainTemplate = (
	heading: string,
	body: string,
	subject?: string,
	action?: EmailAction
): EmailTemplate => ({
	subject: subject ?? heading,
	heading,
	body: paragraphs(body),
	action,
	text: body
});

/** Acknowledges an assistance application to the person who made it. */
export const applicantAcknowledgementTemplate = (
	name: string,
	reference: string
): EmailTemplate => ({
	subject: `We have your request: ${reference}`,
	heading: 'We have your request',
	body: `<p>Dear ${escapeHtml(name)},</p>
		 <p>Your request has reached us. Your reference number is <strong>${escapeHtml(reference)}</strong>.</p>
		 <p>Please quote it whenever you contact us about this request. Someone will be in touch.</p>`,
	action: { label: 'Visit the Foundation', href: '/' }
});

/** Thanks a donor and repeats the reference they must quote on their transfer. */
export const donationPledgeTemplate = (
	name: string,
	amountLabel: string,
	referenceCode: string,
	accountLines: string[]
): EmailTemplate => ({
	subject: `Thank you. Your gift reference is ${referenceCode}`,
	heading: 'Thank you for your gift',
	body: `<p>Dear ${escapeHtml(name)},</p>
		 <p>Thank you for pledging <strong>${escapeHtml(amountLabel)}</strong>.</p>
		 <p>To complete it, make your transfer to the account below and
		 <strong>include ${escapeHtml(referenceCode)} as the reference</strong>. That is how we
		 match your gift to your name.</p>
		 ${panel(accountLines.map((line) => `<div>${escapeHtml(line)}</div>`).join(''))}
		 <p>Once we see it on our statement we will confirm and send your receipt.</p>`,
	action: { label: 'See the payment details', href: '/donate' }
});

/** Confirms a reconciled donation — the receipt. */
export const donationReceiptTemplate = (
	name: string,
	amountLabel: string,
	referenceCode: string,
	designation: string
): EmailTemplate => ({
	subject: `Your gift has been received: ${referenceCode}`,
	heading: 'Your gift has been received',
	body: `<p>Dear ${escapeHtml(name)},</p>
		 <p>We have matched your transfer of <strong>${escapeHtml(amountLabel)}</strong> (reference
		 ${escapeHtml(referenceCode)}) and it is now on its way to <strong>${escapeHtml(designation)}</strong>.</p>
		 <p>Thank you for standing with the families we serve.</p>`,
	action: { label: 'See what your gift supports', href: '/' }
});

/**
 * Acknowledges an offer of goods.
 *
 * Careful not to say "accepted": an in-kind offer is reviewed before it is
 * taken, because storage and distribution are real constraints. The email
 * promises a phone call, which is a promise the Foundation can keep.
 */
export const inKindOfferTemplate = (
	name: string,
	referenceCode: string,
	summary: string
): EmailTemplate => ({
	subject: `Thank you for your offer: ${referenceCode}`,
	heading: 'Thank you for your offer',
	body: `<p>Dear ${escapeHtml(name)},</p>
		 <p>We have your offer of <strong>${escapeHtml(summary)}</strong>. Its reference is
		 <strong>${escapeHtml(referenceCode)}</strong>. Please quote it when you contact us.</p>
		 <p>Someone from the team will call to confirm what we are able to take and to
		 arrange the handover. Please hold on to the items until then.</p>`,
	action: { label: 'Other ways to give', href: '/donate' }
});

/**
 * What the Foundation decided about an offer of goods.
 *
 * One template rather than four, because the four are the same letter with a
 * different middle: what was offered, what we decided, what happens next. A
 * decline says why — the reason a coordinator typed is the whole point of
 * sending it, and "we cannot take this" without one reads as rudeness.
 */
export const inKindDecisionTemplate = (input: {
	name: string;
	referenceCode: string;
	summary: string;
	outcome: 'accepted' | 'declined' | 'scheduled' | 'received';
	note: string | null;
	/** ISO date, for the scheduled handover. */
	when: string | null;
}): EmailTemplate => {
	const date = input.when ? formatDayLong(input.when, '') || null : null;

	const bodies: Record<typeof input.outcome, { heading: string; subject: string; body: string }> = {
		accepted: {
			heading: 'We would be glad to take it',
			subject: `We can take your gift: ${input.referenceCode}`,
			body: `<p>Thank you for offering <strong>${input.summary}</strong>. We would be glad to
			 take it, and will be in touch to arrange when.</p>`
		},
		declined: {
			heading: 'About your offer',
			subject: `About your offer: ${input.referenceCode}`,
			body: `<p>Thank you for offering <strong>${input.summary}</strong>, and for thinking of
			 us. We are not able to take this one.</p>`
		},
		scheduled: {
			heading: 'Your handover is booked',
			subject: `Your handover is booked${date ? ` for ${date}` : ''}: ${input.referenceCode}`,
			body: `<p>Thank you for offering <strong>${input.summary}</strong>. We have booked the
			 handover for <strong>${date ?? 'the agreed day'}</strong>.</p>`
		},
		received: {
			heading: 'Your gift has arrived',
			subject: `Your gift has been received: ${input.referenceCode}`,
			body: `<p>We have taken in <strong>${input.summary}</strong>. Thank you. It is now with
			 the team who will pass it on.</p>`
		}
	};

	const chosen = bodies[input.outcome];

	return {
		subject: chosen.subject,
		heading: chosen.heading,
		body: `<p>Dear ${escapeHtml(input.name)},</p>
			 ${chosen.body}
			 ${input.note ? panel(paragraphs(input.note)) : ''}
			 <p>Your reference is <strong>${escapeHtml(input.referenceCode)}</strong>.</p>`,
		action: { label: 'Other ways to give', href: '/donate' }
	};
};

/** Tells a volunteer applicant their form arrived and what happens next. */
export const volunteerAcknowledgementTemplate = (
	name: string,
	reference: string
): EmailTemplate => ({
	subject: `Thank you for offering to volunteer: ${reference}`,
	heading: 'Thank you for offering to help',
	body: `<p>Dear ${escapeHtml(name)},</p>
		 <p>We have your volunteer application, reference <strong>${escapeHtml(reference)}</strong>.</p>
		 <p>Because our volunteers work alongside people in vulnerable moments, every
		 application goes through a safeguarding review before placement. We will be
		 in touch about the next step.</p>`,
	action: { label: 'Read about our work', href: '/' }
});

/**
 * Acknowledges a message sent through the contact form.
 *
 * Every other public form on the site says "we have it"; this one used to say
 * nothing at all, so somebody who wrote in had no way to tell the form from a
 * dead end. It promises a reply rather than an outcome, because a contact
 * message is routed to a person, not to a process.
 *
 * `responseTarget` is the topic's own promise from `contact_subjects` — when
 * a coordinator has set one, saying it is worth more than "soon".
 */
export const contactAcknowledgementTemplate = (input: {
	name: string;
	reference: string;
	topic: string | null;
	responseTarget: string | null;
}): EmailTemplate => ({
	subject: `We have your message: ${input.reference}`,
	heading: 'We have your message',
	body: `<p>Dear ${escapeHtml(input.name)},</p>
		 <p>Thank you for writing to us. Your reference is
		 <strong>${escapeHtml(input.reference)}</strong>${
				input.topic ? `, and it has gone to the team who handle ${escapeHtml(input.topic)}` : ''
			}.</p>
		 <p>${
				input.responseTarget
					? `We aim to reply ${escapeHtml(input.responseTarget)}.`
					: 'Somebody will reply to you.'
			} You can reply to this email if you need to add anything.</p>`,
	action: { label: 'Visit the Foundation', href: '/' }
});

/**
 * Tells an applicant or a volunteer that their record has moved.
 *
 * One template for both, because they are the same letter: who you are, what
 * changed, what it means. What it *means* is `publicDescription` from the
 * `status_options` row — staff wording, edited in the dashboard, never written
 * here. A status with nothing to say does not send at all, which is why the
 * caller checks for it rather than this template papering over it.
 *
 * The optional `note` is what the staff member typed on the transition. It is
 * included only when they wrote one, and it is the only place case-specific
 * words appear in this email — everything else is the status.
 */
export const statusChangeTemplate = (input: {
	name: string;
	reference: string;
	statusLabel: string;
	publicDescription: string;
	note?: string | null;
	/** Changes the heading only; the letter is otherwise identical. */
	kind: 'application' | 'volunteer';
}): EmailTemplate => ({
	subject:
		input.kind === 'volunteer'
			? `An update on your volunteer application: ${input.reference}`
			: `An update on your request: ${input.reference}`,
	heading: 'An update from the Foundation',
	body: `<p>Dear ${escapeHtml(input.name)},</p>
		 <p>Your ${
				input.kind === 'volunteer' ? 'volunteer application' : 'request'
			} (reference <strong>${escapeHtml(input.reference)}</strong>) is now
		 <strong style="color: #0e3b2e;">${escapeHtml(input.statusLabel)}</strong>.</p>
		 ${paragraphs(input.publicDescription)}
		 ${input.note?.trim() ? panel(paragraphs(input.note.trim())) : ''}
		 <p>Please quote your reference whenever you contact us about it.</p>`,
	// Somebody reading a decision most often wants to ask about it.
	action: { label: 'Get in touch', href: '/contact' }
});

/**
 * Confirms that a form submission arrived, for the dynamic forms.
 *
 * One template for all of them — the four programme applications and any
 * fifth a program manager builds tomorrow — because the only thing that
 * differs between them is words a staff member already wrote. `message` is the
 * form's own `success_message`, so the sentence on the confirmation screen and
 * the sentence in the inbox are the same one, edited in the same box.
 *
 * The heading names the form, so somebody who applied to two programmes can
 * tell the two emails apart in a list.
 */
export const formAcknowledgementTemplate = (input: {
	name: string | null;
	reference: string;
	formTitle: string;
	message: string | null;
}): EmailTemplate => ({
	subject: `We have your ${input.formTitle.toLowerCase()}: ${input.reference}`,
	heading: 'We have your request',
	body: `<p>Dear ${escapeHtml(input.name?.trim() || 'friend')},</p>
		 ${paragraphs(
				input.message?.trim() || 'We have your request. Someone will look at it and be in touch.'
			)}
		 ${referencePanel(input.reference)}
		 <p>Please quote it whenever you contact us about this request.</p>`,
	action: { label: 'Visit the Foundation', href: '/' }
});

/**
 * A staff member's reply to somebody who wrote in or applied.
 *
 * One template for both, because they are the same letter — a person wrote to
 * the Foundation and a person is writing back — and the only difference is
 * what "your message" is called. It lived in `contact.ts` while every other
 * template lived here, which meant it missed the shared helpers and the test
 * script could not render it.
 *
 * The body is whatever the staff member typed, so it goes through
 * `paragraphs`, which escapes it and keeps the line breaks they meant. It was
 * once dropped into a single `<p>`, where a reply written as three short
 * paragraphs arrived as one.
 *
 * Deliberately no button. Every other template ends with one, but here the
 * action *is* replying to the email, and a green "Get in touch" under a message
 * that is already in touch would compete with it.
 */
export const replyTemplate = (input: {
	name: string;
	body: string;
	reference: string;
	/** What the reader called it. Changes the subject line and nothing else. */
	about: 'message' | 'request';
}): EmailTemplate => ({
	subject:
		input.about === 'request'
			? `Re: your request to the Shimeles Abera Foundation (${input.reference})`
			: `Re: your message to the Shimeles Abera Foundation (${input.reference})`,
	heading: 'A reply from the Foundation',
	body: `<p>Dear ${escapeHtml(input.name?.trim() || 'friend')},</p>
		 ${paragraphs(input.body)}
		 ${referencePanel(input.reference)}
		 ${footnote('You can reply to this email and it will reach us.')}`,
	text: `Dear ${input.name?.trim() || 'friend'},\n\n${input.body}\n\nYour reference is ${
		input.reference
	}.\nYou can reply to this email and it will reach us.`
});

/* --------------------------------------------------------------------------
   Account access

   These two are the only emails in this file that carry a credential. They
   are worded to be *checkable* — who asked, what it does, how long it lasts,
   and what to do if it was not you — because the reader has to decide whether
   to trust a link, and a vague email trains them to click anyway.
   -------------------------------------------------------------------------- */

/** Minutes, phrased for a person: `45 minutes`, `1 hour`, `2 hours`. */
const expiryLabel = (seconds: number): string => {
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} minutes`;
	const hours = Math.round(minutes / 60);
	return hours === 1 ? '1 hour' : `${hours} hours`;
};

/**
 * The link that lets somebody choose a new password.
 *
 * Says plainly that ignoring it is safe, because that is the correct advice
 * for the one case that matters: an email nobody asked for, which is what an
 * attacker probing the login form produces.
 */
export const passwordResetTemplate = (input: {
	name: string | null;
	url: string;
	expiresIn: number;
}): EmailTemplate => ({
	subject: 'Reset your Shimeles Abera Foundation password',
	heading: 'Reset your password',
	body: `<p>Dear ${escapeHtml(input.name?.trim() || 'colleague')},</p>
		 <p>Somebody asked to reset the password on your Foundation dashboard account.
		 Use the button below to choose a new one.</p>
		 ${footnote(
				`This link works once and expires in ${expiryLabel(input.expiresIn)}.
			 <strong>If you did not ask for this, ignore this email</strong> — your password
			 has not changed and nobody can use the link without your inbox.`
			)}`,
	action: { label: 'Choose a new password', href: input.url }
});

/**
 * A one-click sign-in link.
 *
 * The plugin is configured with `disableSignUp`, so this can only ever reach
 * an address that already has a staff account — but the email still says so,
 * because somebody who receives one unexpectedly should be told what it would
 * have done.
 */
export const magicLinkTemplate = (input: {
	name: string | null;
	url: string;
	expiresIn: number;
}): EmailTemplate => ({
	subject: 'Your sign-in link for the Shimeles Abera Foundation',
	heading: 'Your sign-in link',
	body: `<p>Dear ${escapeHtml(input.name?.trim() || 'colleague')},</p>
		 <p>Use the button below to sign in to the Foundation dashboard. You will not
		 need your password.</p>
		 ${footnote(
				`This link signs in whoever opens it, so do not forward it. It works once and
			 expires in ${expiryLabel(input.expiresIn)}.
			 <strong>If you did not ask for it, ignore this email</strong> — nothing has
			 changed on your account.`
			)}`,
	action: { label: 'Sign in to the dashboard', href: input.url }
});
