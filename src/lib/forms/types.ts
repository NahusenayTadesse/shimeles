/**
 * The wire shape of a dynamically-defined form.
 *
 * These types are shared by the server (which builds them from
 * `form_definitions` + `form_fields`) and the single generic renderer in
 * `$lib/forms/DynamicForm.svelte`. They are declared here, outside
 * `$lib/server`, so the client never imports server-only code to know what a
 * field looks like.
 */

export type FieldType =
	| 'text'
	| 'textarea'
	| 'number'
	| 'date'
	| 'select'
	| 'multiselect'
	| 'checkbox'
	| 'file_upload'
	| 'phone'
	| 'email'
	/** Not an input — a section divider inside a long application form. */
	| 'heading';

export interface FieldOption {
	value: string;
	label: string;
}

export interface FieldValidation {
	min?: number;
	max?: number;
	minLength?: number;
	maxLength?: number;
	/** A JavaScript regular expression source, without delimiters. */
	pattern?: string;
	/** Human-readable message shown when `pattern` fails. */
	patternMessage?: string;
}

/** One question, already resolved into the reader's language. */
export interface RenderField {
	key: string;
	label: string;
	hint: string | null;
	placeholder: string | null;
	type: FieldType;
	options: FieldOption[];
	required: boolean;
	validation: FieldValidation;
	/** Set when this field only appears once another answer matches. */
	showWhen: { key: string; value: string } | null;
}

/** A whole form, resolved into the reader's language. */
export interface RenderForm {
	id: number;
	slug: string;
	title: string;
	introText: string | null;
	successMessage: string | null;
	requiresDocuments: boolean;
	isLowBarrier: boolean;
	pillar: { id: number; name: string; color: string; icon: string } | null;
	fields: RenderField[];
}
