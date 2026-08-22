/**
 * The seed copy for the Privacy Policy and the Terms & Conditions.
 *
 * Kept out of `seed.ts` because these two documents are longer than every
 * other piece of seeded copy put together, and burying them in the middle of
 * the pages seeder would make that file hard to read for no gain.
 *
 * Both are seeded as ordinary `pages` rows with a single `rich_text` block, so
 * they are edited from Dashboard → Pages & content like any other page and
 * neither needs a route of its own. That also means this file is a *starting
 * point*: once a lawyer has been through them, the dashboard is the source of
 * truth and re-running the seed will not overwrite the edits.
 *
 * **These are drafts, not legal advice.** Sections 1–5 of the privacy policy
 * are the Foundation's own supplied text; everything after it, and the whole
 * of the terms, was drafted here to match that document's structure and voice.
 * All of it needs review by someone qualified in Ethiopian law before it is
 * relied on.
 */

const EFFECTIVE_DATE = 'August 18, 2026';
const LAST_UPDATED = 'August 18, 2026';

/** The dated header both documents open with. */
const documentHeader = (title: string) =>
	`<p><strong>Website:</strong> ShimelesaberaFoundation.org<br />` +
	`<strong>Effective Date:</strong> ${EFFECTIVE_DATE}<br />` +
	`<strong>Last Updated:</strong> ${LAST_UPDATED}</p>` +
	`<p><em>${title}</em></p>`;

export const PRIVACY_POLICY_BODY =
	documentHeader(
		'This policy explains how the Shimelesabera Foundation handles personal information.'
	) +
	'<p>Shimelesabera Foundation (“Shimelesabera Foundation,” “the Foundation,” “we,” “us,” or “our”) respects your privacy and is committed to protecting the personal information of individuals who visit our website, communicate with us, donate to our organization, volunteer, participate in our programs, or otherwise interact with us.</p>' +
	'<p>This Privacy Policy explains how we collect, use, disclose, retain, and protect personal information through ShimelesaberaFoundation.org (the “Website”).</p>' +
	'<h2>1. Information We Collect</h2>' +
	'<p>Depending on how you interact with our Website, we may collect information that you voluntarily provide, including:</p>' +
	'<ul>' +
	'<li>Full name</li>' +
	'<li>Email address</li>' +
	'<li>Telephone number</li>' +
	'<li>Mailing or contact address</li>' +
	'<li>Organization or affiliation</li>' +
	'<li>Information submitted through contact forms</li>' +
	'<li>Volunteer information</li>' +
	'<li>Program or application information</li>' +
	'<li>Donation-related information</li>' +
	'<li>Event registration information</li>' +
	'<li>Communications with the Foundation</li>' +
	'<li>Other information you voluntarily provide</li>' +
	'</ul>' +
	'<h3>Information Collected Automatically</h3>' +
	'<p>When you visit our Website, certain technical information may be collected automatically, including:</p>' +
	'<ul>' +
	'<li>IP address</li>' +
	'<li>Browser type</li>' +
	'<li>Device type</li>' +
	'<li>Operating system</li>' +
	'<li>Pages visited</li>' +
	'<li>Date and time of access</li>' +
	'<li>Referring website</li>' +
	'<li>General Website usage information</li>' +
	'</ul>' +
	'<p>We may use this information to maintain Website security, diagnose technical problems, understand Website usage, and improve our services.</p>' +
	'<h2>2. Donations and Payment Information</h2>' +
	'<p>If online donations are available through our Website, payments may be processed by a third-party payment provider.</p>' +
	'<p>The payment provider may collect and process payment information according to its own terms and privacy policy.</p>' +
	'<p>Shimelesabera Foundation does not intend to store complete credit-card or debit-card numbers on its own Website servers.</p>' +
	'<p>Donation information may be used to:</p>' +
	'<ul>' +
	'<li>Process and acknowledge donations;</li>' +
	'<li>Issue donation receipts where applicable;</li>' +
	'<li>Maintain financial and accounting records;</li>' +
	'<li>Communicate with donors;</li>' +
	'<li>Comply with applicable legal requirements; and</li>' +
	'<li>Support the Foundation’s charitable activities.</li>' +
	'</ul>' +
	'<h2>3. How We Use Personal Information</h2>' +
	'<p>We may use personal information to:</p>' +
	'<ul>' +
	'<li>Respond to inquiries and requests;</li>' +
	'<li>Communicate with donors, volunteers, supporters, applicants, and beneficiaries;</li>' +
	'<li>Process donations;</li>' +
	'<li>Administer Foundation programs and activities;</li>' +
	'<li>Process volunteer or program applications;</li>' +
	'<li>Organize events;</li>' +
	'<li>Send newsletters and organizational updates;</li>' +
	'<li>Improve our Website and services;</li>' +
	'<li>Maintain Website security;</li>' +
	'<li>Prevent fraud or unauthorized activity;</li>' +
	'<li>Maintain appropriate organizational and financial records; and</li>' +
	'<li>Comply with applicable laws and legal obligations.</li>' +
	'</ul>' +
	'<p>We do not sell personal information as a commercial product.</p>' +
	'<h2>4. Legal Basis for Processing</h2>' +
	'<p>We seek to process personal information in accordance with applicable Ethiopian data-protection requirements, including the Personal Data Protection Proclamation No. 1321/2016.</p>' +
	'<p>Depending on the circumstances, personal information may be processed based on:</p>' +
	'<ul>' +
	'<li>Your consent;</li>' +
	'<li>Your request for a service or information;</li>' +
	'<li>The performance of an arrangement with you;</li>' +
	'<li>A legal or regulatory obligation;</li>' +
	'<li>Legitimate organizational purposes; or</li>' +
	'<li>Another lawful basis permitted by applicable law.</li>' +
	'</ul>' +
	'<p>Where consent is required, we will seek consent in an appropriate manner.</p>' +
	'<h2>5. Sharing Personal Information</h2>' +
	'<p>We may share personal information with trusted third parties when reasonably necessary to operate the Foundation or Website, including:</p>' +
	'<ul>' +
	'<li>Payment processors;</li>' +
	'<li>Website hosting providers;</li>' +
	'<li>Email and communications providers;</li>' +
	'<li>Information-technology providers;</li>' +
	'<li>Analytics providers;</li>' +
	'<li>Professional advisors;</li>' +
	'<li>Auditors and financial service providers;</li>' +
	'<li>Government authorities where legally required; and</li>' +
	'<li>Other service providers acting on our behalf.</li>' +
	'</ul>' +
	'<p>We expect service providers handling personal information for us to use appropriate safeguards and process information only for authorized purposes.</p>' +
	'<h2>6. International Data Transfers</h2>' +
	'<p>Some of the service providers described above may store or process personal information outside Ethiopia.</p>' +
	'<p>Where personal information is transferred outside Ethiopia, we seek to ensure that appropriate safeguards are in place, consistent with applicable Ethiopian data-protection requirements, including the Personal Data Protection Proclamation No. 1321/2016.</p>' +
	'<p>By using the Website or providing personal information to us, you understand that your information may be processed in jurisdictions other than the one in which you reside, and that data-protection rules in those jurisdictions may differ from those in Ethiopia.</p>' +
	'<h2>7. Data Retention</h2>' +
	'<p>We retain personal information only for as long as reasonably necessary for the purposes described in this Privacy Policy, including:</p>' +
	'<ul>' +
	'<li>The period needed to provide the service or respond to the request for which it was collected;</li>' +
	'<li>The period required to maintain financial, donation, and accounting records;</li>' +
	'<li>The period required by applicable law, audit, or regulatory obligation; and</li>' +
	'<li>The period reasonably needed to resolve disputes or enforce our agreements.</li>' +
	'</ul>' +
	'<p>Where personal information relates to assistance applications, beneficiary records, or safeguarding matters, we may retain it for longer where doing so is necessary to protect the individuals concerned or to meet our obligations as a charitable organization.</p>' +
	'<p>When personal information is no longer required, we seek to delete it or to anonymize it so that it can no longer be associated with an individual.</p>' +
	'<h2>8. Information Security</h2>' +
	'<p>We take reasonable organizational and technical measures intended to protect personal information against loss, misuse, unauthorized access, disclosure, alteration, and destruction. These measures may include access controls, restricting staff access to what their role requires, and keeping records of access to sensitive information.</p>' +
	'<p>No method of transmission over the internet and no method of electronic storage is completely secure. While we work to protect personal information, we cannot guarantee absolute security.</p>' +
	'<p>If you believe your interaction with us is no longer secure, please contact us using the details in the “Contact Us” section below.</p>' +
	'<h2>9. Your Rights</h2>' +
	'<p>Subject to applicable Ethiopian law, and depending on the circumstances, you may have the right to:</p>' +
	'<ul>' +
	'<li>Request access to the personal information we hold about you;</li>' +
	'<li>Request correction of information that is inaccurate or incomplete;</li>' +
	'<li>Request deletion of personal information, where we are not required to retain it;</li>' +
	'<li>Object to or request restriction of certain processing;</li>' +
	'<li>Withdraw consent where processing is based on consent, without affecting processing already carried out; and</li>' +
	'<li>Unsubscribe from newsletters and organizational updates at any time.</li>' +
	'</ul>' +
	'<p>To make a request, please contact us using the details below. We may need to verify your identity before acting on a request, and we will respond within a reasonable period.</p>' +
	'<p>Some requests may be limited where the information is needed to meet a legal obligation, to maintain financial records, or to protect the rights or safety of another person.</p>' +
	'<h2>10. Children’s Privacy</h2>' +
	'<p>Our Website is not directed at children, and we do not knowingly collect personal information from children through the Website without the involvement of a parent, guardian, or other appropriate adult.</p>' +
	'<p>Some of the Foundation’s programs support children and young people. Where information about a child is collected as part of a program, we seek to do so through a parent, guardian, or authorized representative, and we handle that information with additional care and restricted access.</p>' +
	'<p>If you believe a child has provided personal information through the Website without appropriate consent, please contact us and we will take reasonable steps to remove it.</p>' +
	'<h2>11. Cookies and Similar Technologies</h2>' +
	'<p>Our Website may use cookies or similar technologies to keep the Website working correctly, remember your preferences, maintain security, and understand how the Website is used.</p>' +
	'<p>Most browsers allow you to refuse or delete cookies through their settings. Disabling cookies may affect how parts of the Website function.</p>' +
	'<h2>12. Third-Party Websites and Services</h2>' +
	'<p>Our Website may contain links to third-party websites and services, including donation platforms, social media, and video services.</p>' +
	'<p>This Privacy Policy does not apply to those third parties. We are not responsible for their content or their privacy practices, and we encourage you to read the privacy policy of any third-party service before providing personal information to it.</p>' +
	'<h2>13. Changes to This Privacy Policy</h2>' +
	'<p>We may update this Privacy Policy from time to time to reflect changes in our practices, our services, or applicable law.</p>' +
	'<p>When we do, we will revise the “Last Updated” date at the top of this page. Where a change is significant, we will take reasonable steps to bring it to the attention of those affected.</p>' +
	'<p>Your continued use of the Website after an update takes effect indicates that you are aware of the current version of this Privacy Policy.</p>' +
	'<h2>14. Contact Us</h2>' +
	'<p>If you have questions about this Privacy Policy, or wish to make a request about your personal information, you can reach us at:</p>' +
	'<p><strong>Shimelesabera Foundation</strong><br />' +
	'Addis Ababa, Ethiopia<br />' +
	'Email: <a href="mailto:info@shimelesaberafoundation.org">info@shimelesaberafoundation.org</a></p>' +
	'<p>You can also use the form on our <a href="/contact">Contact page</a>.</p>';

export const TERMS_AND_CONDITIONS_BODY =
	documentHeader('These terms govern your use of the Shimelesabera Foundation website.') +
	'<p>These Terms and Conditions (“Terms”) govern your access to and use of ShimelesaberaFoundation.org (the “Website”), operated by Shimelesabera Foundation (“Shimelesabera Foundation,” “the Foundation,” “we,” “us,” or “our”).</p>' +
	'<p>Please read these Terms carefully. By accessing or using the Website, you agree to them. If you do not agree, please do not use the Website.</p>' +
	'<h2>1. About the Foundation</h2>' +
	'<p>Shimelesabera Foundation is a charitable organization based in Addis Ababa, Ethiopia. The Website exists to describe our work, to allow people to apply for assistance, to volunteer, to give, and to contact us.</p>' +
	'<h2>2. Use of the Website</h2>' +
	'<p>You may use the Website for lawful purposes only. In particular, you agree not to:</p>' +
	'<ul>' +
	'<li>Use the Website in a way that breaks any applicable law or regulation;</li>' +
	'<li>Submit false, misleading, or fraudulent information, including in an application for assistance or a volunteer form;</li>' +
	'<li>Impersonate another person or organization, or misrepresent your affiliation with one;</li>' +
	'<li>Attempt to gain unauthorized access to any part of the Website, its servers, or any connected system;</li>' +
	'<li>Interfere with or disrupt the operation of the Website, including by introducing malicious code;</li>' +
	'<li>Collect personal information about other users; or</li>' +
	'<li>Use automated means to access the Website in a way that places an unreasonable load on it.</li>' +
	'</ul>' +
	'<p>We may suspend or restrict access to the Website, in whole or in part, where we reasonably believe it is being misused.</p>' +
	'<h2>3. Donations</h2>' +
	'<p>Donations made through the Website may be processed by third-party payment providers, subject to those providers’ own terms and privacy policies.</p>' +
	'<p>By making a donation, you confirm that you are entitled to use the payment method and that the funds are lawfully yours to give.</p>' +
	'<p>Unless a donation is expressly designated for a particular programme, it will be applied wherever the Foundation judges the need to be greatest. Where a designated programme is fully funded or cannot proceed, we may apply the donation to a related purpose, and we will keep a record of having done so.</p>' +
	'<p>Donations are generally non-refundable once processed. If you believe a donation was made in error or without authorization, please contact us promptly and we will review the circumstances in good faith.</p>' +
	'<p>Receipts and acknowledgements are issued where applicable. Whether a donation attracts any tax treatment depends on your own circumstances and jurisdiction, and is not something the Foundation can advise on.</p>' +
	'<h2>4. Applications, Volunteering, and Submissions</h2>' +
	'<p>Submitting an application for assistance, a volunteer application, or any other form on the Website does not create an obligation on the Foundation to provide support, a placement, or any other outcome.</p>' +
	'<p>Applications are assessed against the Foundation’s own criteria and available resources. We may request supporting information, and we may decline an application.</p>' +
	'<p>Volunteer placements that involve contact with children, elders, or other people in vulnerable circumstances are subject to safeguarding checks. Completing a form does not constitute a placement, and we may decline or end a placement where safeguarding requirements are not met.</p>' +
	'<p>You agree that the information you submit is accurate and complete to the best of your knowledge, and that you have the right to share any information you provide about another person.</p>' +
	'<h2>5. Intellectual Property</h2>' +
	'<p>Unless stated otherwise, the content of the Website, including text, graphics, logos, photographs, video, and the arrangement of the site, belongs to the Foundation or is used with permission, and is protected by applicable intellectual-property laws.</p>' +
	'<p>You may view, download, and print material from the Website for personal, non-commercial use, provided you do not remove any attribution.</p>' +
	'<p>You may not reproduce, republish, distribute, or use Website content for commercial purposes, or in a way that suggests endorsement or affiliation, without our prior written permission.</p>' +
	'<p>The Foundation’s name and logo may not be used without permission.</p>' +
	'<h2>6. Photographs and Personal Stories</h2>' +
	'<p>Photographs and stories published on the Website are shared with the consent of the people involved, or with the consent of a parent or guardian where appropriate.</p>' +
	'<p>If you appear in material on this Website and would like it removed, please contact us and we will act on the request.</p>' +
	'<h2>7. Third-Party Links and Services</h2>' +
	'<p>The Website may link to or embed third-party websites and services, including donation platforms, social media, and video providers.</p>' +
	'<p>We provide these for convenience. We do not control them, we do not endorse their content by linking to them, and we are not responsible for their availability, content, or practices. Your use of a third-party service is governed by that service’s own terms.</p>' +
	'<h2>8. No Professional Advice</h2>' +
	'<p>Information on the Website is provided for general informational purposes about the Foundation and its work.</p>' +
	'<p>It is not medical, psychological, legal, or financial advice, and it should not be relied on as a substitute for advice from a qualified professional. If you have a medical or mental-health emergency, please seek immediate help from an appropriate service.</p>' +
	'<h2>9. Availability of the Website</h2>' +
	'<p>We aim to keep the Website available and accurate, but we do not guarantee that it will be uninterrupted, error-free, or current at all times.</p>' +
	'<p>We may change, suspend, or discontinue any part of the Website at any time, including programme information and application forms.</p>' +
	'<h2>10. Disclaimer</h2>' +
	'<p>To the fullest extent permitted by applicable law, the Website and its content are provided “as is” and “as available,” without warranties of any kind, whether express or implied, including as to accuracy, fitness for a particular purpose, or non-infringement.</p>' +
	'<h2>11. Limitation of Liability</h2>' +
	'<p>To the fullest extent permitted by applicable law, the Foundation, its trustees, officers, employees, and volunteers will not be liable for any indirect, incidental, special, or consequential loss arising out of your use of, or inability to use, the Website.</p>' +
	'<p>Nothing in these Terms excludes or limits liability where it would be unlawful to do so.</p>' +
	'<h2>12. Indemnity</h2>' +
	'<p>You agree to indemnify the Foundation against any claim, loss, or expense arising from your breach of these Terms or your unlawful use of the Website.</p>' +
	'<h2>13. Privacy</h2>' +
	'<p>Personal information you provide through the Website is handled in accordance with our <a href="/privacy">Privacy Policy</a>, which forms part of these Terms.</p>' +
	'<h2>14. Governing Law</h2>' +
	'<p>These Terms are governed by the laws of the Federal Democratic Republic of Ethiopia. Any dispute arising out of or in connection with the Website or these Terms is subject to the jurisdiction of the competent courts of Ethiopia.</p>' +
	'<h2>15. Changes to These Terms</h2>' +
	'<p>We may update these Terms from time to time. When we do, we will revise the “Last Updated” date at the top of this page.</p>' +
	'<p>Your continued use of the Website after an update takes effect indicates your acceptance of the revised Terms.</p>' +
	'<h2>16. Severability</h2>' +
	'<p>If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</p>' +
	'<h2>17. Contact Us</h2>' +
	'<p>If you have questions about these Terms, you can reach us at:</p>' +
	'<p><strong>Shimelesabera Foundation</strong><br />' +
	'Addis Ababa, Ethiopia<br />' +
	'Email: <a href="mailto:info@shimelesaberafoundation.org">info@shimelesaberafoundation.org</a></p>' +
	'<p>You can also use the form on our <a href="/contact">Contact page</a>.</p>';
