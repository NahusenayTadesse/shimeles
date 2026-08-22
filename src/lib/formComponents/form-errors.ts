/**
 * Taking someone to the thing they got wrong.
 *
 * A long form that fails validation used to report it with a toast and nothing
 * else: the error summary sits at the top of the page, several hundred lines
 * above the submit button on `/apply`, and nothing scrolled you to it. The
 * toast then faded. On a phone that leaves a person staring at an unchanged
 * submit button with no idea what is wrong.
 *
 * These two helpers are what the summary and the pages share. They are plain
 * DOM, deliberately: the controls are rendered by five different components
 * (`InputComp`, `SelectComp`, `ChoiceGroup`, `DatePicker2`, `FileUpload`), and
 * an id lookup works for all of them without each one having to register
 * itself somewhere.
 */

/** The id `InputComp` and friends give a control: its `name`, or the `id` prop. */
export function fieldId(path: unknown): string | null {
	if (typeof path === 'string') return path || null;
	if (Array.isArray(path)) {
		const parts = path.filter((part) => part !== undefined && part !== null).map(String);
		return parts.length ? parts.join('.') : null;
	}
	return null;
}

/** `#applicantName`, for a summary row that should be a link to the field. */
export function fieldHref(path: unknown): string | undefined {
	const id = fieldId(path);
	return id ? `#${CSS?.escape ? CSS.escape(id) : id}` : undefined;
}

function findControl(id: string): HTMLElement | null {
	const escaped = CSS?.escape ? CSS.escape(id) : id;
	return (
		document.getElementById(id) ??
		document.querySelector<HTMLElement>(`[name="${escaped}"]`) ??
		/*
		 * A nested path such as `needs.2.detail` has no control of its own, but
		 * the section it belongs to does — landing on `needs` is far better than
		 * not moving at all.
		 */
		(id.includes('.') ? findControl(id.split('.')[0]) : null)
	);
}

/**
 * Scrolls to a field and puts the caret in it.
 *
 * Focus rather than scroll alone, because focus is what a screen reader
 * follows and what makes the next keystroke land in the right box. Elements
 * that cannot hold focus are given `tabindex="-1"` for the duration.
 */
export function focusField(id: string): boolean {
	const element = findControl(id);
	if (!element) return false;

	element.scrollIntoView({ behavior: 'smooth', block: 'center' });

	// `preventScroll` so the smooth scroll above is not cut short by the jump
	// focus() would otherwise do.
	if (element.tabIndex < 0 && !element.hasAttribute('tabindex')) {
		element.setAttribute('tabindex', '-1');
		element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
	}
	element.focus({ preventScroll: true });
	return true;
}

type ErrorEntry = { path?: unknown; messages?: string[] };

/**
 * The whole of the failed-submit behaviour, for a page's `$message` handler.
 *
 * Tries the first invalid field; falls back to the error summary, which is
 * `role="alert"` and so is announced when it takes focus. Called after a tick
 * so the summary has rendered.
 */
export function focusFirstError(allErrors: ErrorEntry[], summaryId = 'form-errors'): void {
	if (typeof document === 'undefined') return;

	requestAnimationFrame(() => {
		const first = fieldId(allErrors?.[0]?.path);
		if (first && focusField(first)) return;
		focusField(summaryId);
	});
}
