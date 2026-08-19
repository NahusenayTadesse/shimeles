<!-- QuillEditor.svelte -->
<script lang="ts">
	import { Tipex } from '@friendofsvelte/tipex';
	import '@friendofsvelte/tipex/styles/index.css';

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

	import type { Editor } from '@tiptap/core';
	let editorInstance: Editor | undefined = $state();

	$effect(() => {
		if (editorInstance) {
			editorInstance.on('update', () => {
				value = editorInstance?.getHTML() || '';
			});
		}
	});
</script>

<!-- <div bind:this={container}></div> -->

<Tipex body={value || `<p>${placeholder}</p>`} bind:tipex={editorInstance} focal floating />
