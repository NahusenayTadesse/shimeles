<script lang="ts">
	import { Tipex, defaultExtensions } from '@friendofsvelte/tipex';
	import '@friendofsvelte/tipex/styles/index.css';
	import type { Editor } from '@tiptap/core';

	/**
	 * No fallback on `value`, deliberately.
	 *
	 * Svelte 5 refuses `bind:value={undefined}` against a bindable prop that
	 * declares one — it cannot tell whether to write the fallback back to the
	 * parent. And undefined is exactly what arrives from a superforms field
	 * built with `optionalText()`, which is `.optional()` with no default: the
	 * Add dialog on any screen with a rich-text field threw before it opened.
	 *
	 * The empty case is handled below instead, where it always was.
	 */
	let { value = $bindable(), placeholder = 'Start writing...' } = $props();

	let editorInstance: Editor | undefined = $state();

	/**
	 * The placeholder is a placeholder, not the first draft.
	 *
	 * It used to be passed as the editor's *body* — real content, in the
	 * document, which the writer had to select and delete before typing. On a
	 * page block that was an annoyance. On the reply box of a case, where what
	 * is in the editor is what an applicant receives, it is a letter that opens
	 * "Write your reply, or a note for colleagues…". Tipex already ships
	 * tiptap's placeholder extension; this reconfigures that instead, so the
	 * hint is drawn over an empty document and cannot be sent.
	 *
	 * Computed once rather than derived: `Tipex` mutates the array it is given
	 * (it pushes the floating menu in), so each editor gets its own copy —
	 * which also stops two editors on one screen from stacking menus into the
	 * shared default.
	 */
	const extensions = defaultExtensions.map((extension) =>
		extension.name === 'placeholder'
			? extension.configure({ placeholder, showOnlyWhenEditable: false })
			: extension
	);

	$effect(() => {
		if (editorInstance) {
			editorInstance.on('update', () => {
				value = editorInstance?.getHTML() || '';
			});
		}
	});
</script>

<Tipex body={value || ''} {extensions} bind:tipex={editorInstance} focal floating />
