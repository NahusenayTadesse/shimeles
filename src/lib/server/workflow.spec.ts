import { describe, expect, it } from 'vitest';
import { statusLetter } from './workflow';

/**
 * What a status-change email says.
 *
 * The rest of the module talks to the database, but this decision is pure and
 * it is the one that matters: it is what stands between a family and an email
 * whose body is the word "Verified", and between a caseworker and a note they
 * meant privately going out twice.
 */
describe('statusLetter', () => {
	it('leads with the status wording and keeps the note as an addition', () => {
		expect(statusLetter('Your request has been approved.', 'Starting next month.')).toEqual({
			body: 'Your request has been approved.',
			note: 'Starting next month.'
		});
	});

	it('sends the status wording alone when no note was written', () => {
		expect(statusLetter('Your request has been approved.', undefined)).toEqual({
			body: 'Your request has been approved.',
			note: undefined
		});
	});

	it('promotes the note to the letter when the status has no wording of its own', () => {
		// The manual "Notify applicant" button on an internal status like
		// "Verified": the caseworker's sentence *is* the message.
		expect(statusLetter(null, 'Your documents arrived, nothing more is needed.')).toEqual({
			body: 'Your documents arrived, nothing more is needed.'
		});
	});

	it('does not repeat the note underneath itself when it is the letter', () => {
		expect(statusLetter('   ', 'The only sentence.')?.note).toBeUndefined();
	});

	it('sends nothing when there is nothing to say', () => {
		// Never a status label on its own — an email that says "Under review"
		// and nothing else teaches the reader to ignore the next one.
		expect(statusLetter(null, null)).toBeNull();
		expect(statusLetter('', '')).toBeNull();
		expect(statusLetter('  \n ', '   ')).toBeNull();
	});
});
