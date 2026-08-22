import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { defaults } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import DynamicForm from './DynamicForm.svelte';
import { buildSchema } from './schema';
import type { RenderField, RenderForm } from './types';

/**
 * Filling in a generated form, in a real browser, the way an applicant does.
 *
 * The server tests check what the schema makes of a body once it arrives. This
 * checks the half that decides what that body *is*: which controls the renderer
 * draws, and what they put on the wire when someone clicks them. Nearly every
 * bug worth finding in a form builder lives in that gap — a control that looks
 * right, reads right, and posts something else.
 *
 * So the assertions are mostly made against the form's own `FormData`, taken
 * straight off the `<form>` element exactly as the browser would serialise it
 * on submit. What a person sees and what the server receives have to agree.
 */

const field = (over: Partial<RenderField> & Pick<RenderField, 'key' | 'label' | 'type'>) =>
	({
		hint: null,
		placeholder: null,
		options: [],
		required: false,
		validation: {},
		showWhen: null,
		...over
	}) as RenderField;

const testForm = (fields: RenderField[]): RenderForm => ({
	id: 1,
	slug: 'test-form',
	title: 'Test form',
	introText: null,
	successMessage: null,
	requiresDocuments: false,
	isLowBarrier: false,
	pillar: null,
	fields
});

/** Renders the form and hands back a reader for what it would post. */
function renderForm(form: RenderForm) {
	const screen = render(DynamicForm, {
		form,
		data: defaults(zod4(buildSchema(form)))
	});

	const formData = () => {
		const element = document.querySelector('form');
		if (!element) throw new Error('the renderer drew no <form>');
		return new FormData(element as HTMLFormElement);
	};

	return { screen, formData, posted: (key: string) => formData().getAll(key).map(String) };
}

const supportOptions = [
	{ value: 'treatment_cost', label: 'Help with treatment costs' },
	{ value: 'medication', label: 'Medication' },
	{ value: 'transport', label: 'Transport to appointments' }
];

describe('a tick-all-that-apply question', () => {
	const form = testForm([
		field({
			key: 'support_needed',
			label: 'What kind of help do you need?',
			type: 'multiselect',
			options: supportOptions
		})
	]);

	it('shows every option, in the words staff wrote', async () => {
		renderForm(form);
		for (const option of supportOptions) {
			await expect.element(page.getByText(option.label, { exact: true })).toBeInTheDocument();
		}
	});

	it('posts the value of the box that was ticked', async () => {
		const { posted } = renderForm(form);
		await page.getByText('Medication', { exact: true }).click();
		expect(posted('support_needed')).toEqual(['medication']);
	});

	it('posts every box a person ticks, not just the last one', async () => {
		const { posted } = renderForm(form);
		await page.getByText('Help with treatment costs', { exact: true }).click();
		await page.getByText('Medication', { exact: true }).click();
		await page.getByText('Transport to appointments', { exact: true }).click();

		expect(posted('support_needed').sort()).toEqual(
			['medication', 'transport', 'treatment_cost'].sort()
		);
	});

	it('stops posting a box that is ticked and then unticked', async () => {
		const { posted } = renderForm(form);
		await page.getByText('Medication', { exact: true }).click();
		await page.getByText('Medication', { exact: true }).click();
		expect(posted('support_needed')).toEqual([]);
	});

	it('posts nothing at all when nothing is ticked', async () => {
		const { posted } = renderForm(form);
		expect(posted('support_needed')).toEqual([]);
	});
});

describe('a consent box', () => {
	const form = testForm([
		field({
			key: 'consent',
			label: 'I agree to you keeping this',
			type: 'checkbox',
			required: true
		})
	]);

	it('posts a value the server reads as unticked before it is touched', async () => {
		const { posted } = renderForm(form);
		expect(posted('consent')).toEqual(['false']);
	});

	it('can be ticked by clicking its own words, the way people tick a box', async () => {
		// This is the regression, and clicking the text is the whole assertion.
		// The question used to be drawn by a `<label>` with no `for` — pointing at
		// nothing — so clicking it did nothing at all, and the only way to give
		// consent was to hit the 18-pixel box exactly.
		const { posted } = renderForm(form);
		await page.getByText('I agree to you keeping this *', { exact: true }).click();
		expect(posted('consent')).toEqual(['true']);
	});

	it('binds that label to the box rather than leaving it pointing nowhere', async () => {
		renderForm(form);
		const label = document.querySelector('label[for]');
		expect(label?.textContent?.trim()).toBe('I agree to you keeping this *');
		expect(document.getElementById(label?.getAttribute('for') ?? '')).not.toBeNull();
	});
});

describe('a single-choice question', () => {
	const form = testForm([
		field({
			key: 'grade',
			label: 'Grade or year',
			type: 'select',
			options: [
				{ value: 'primary', label: 'Primary' },
				{ value: 'secondary', label: 'Secondary' }
			]
		})
	]);

	it('posts nothing until a choice is made', async () => {
		const { posted } = renderForm(form);
		expect(posted('grade')).toEqual(['']);
	});
});

describe('the questions themselves', () => {
	it('marks a required question so a person can see which ones matter', async () => {
		renderForm(
			testForm([
				field({ key: 'full_name', label: 'Your full name', type: 'text', required: true }),
				field({ key: 'nickname', label: 'What we should call you', type: 'text' })
			])
		);

		await expect.element(page.getByText(/Your full name/)).toBeInTheDocument();
		await expect.element(page.getByText(/What we should call you/)).toBeInTheDocument();
	});

	it('shows the hint staff wrote under the question it belongs to', async () => {
		renderForm(
			testForm([
				field({
					key: 'story',
					label: 'What is happening?',
					type: 'textarea',
					hint: 'One sentence is enough.'
				})
			])
		);

		await expect.element(page.getByText('One sentence is enough.')).toBeInTheDocument();
	});

	it('draws a heading as a heading rather than as something to fill in', async () => {
		renderForm(
			testForm([
				field({ key: 'section', label: 'About the medical situation', type: 'heading' }),
				field({ key: 'condition', label: 'What is the situation?', type: 'textarea' })
			])
		);

		await expect
			.element(page.getByRole('heading', { name: 'About the medical situation' }))
			.toBeInTheDocument();
	});
});

describe('a question that only appears once another is answered', () => {
	const form = testForm([
		field({
			key: 'is_professional',
			label: 'Are you a licensed professional?',
			type: 'select',
			options: [
				{ value: 'no', label: 'No' },
				{ value: 'yes', label: 'Yes' }
			]
		}),
		field({
			key: 'credentials',
			label: 'Your credentials and licence number',
			type: 'textarea',
			showWhen: { key: 'is_professional', value: 'yes' }
		})
	]);

	it('stays hidden until the answer that reveals it is given', async () => {
		renderForm(form);
		await expect
			.element(page.getByText('Your credentials and licence number'))
			.not.toBeInTheDocument();
	});
});
