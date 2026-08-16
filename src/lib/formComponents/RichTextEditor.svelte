<!-- QuillEditor.svelte -->
<script lang="ts">
	import { Tipex } from '@friendofsvelte/tipex';
	import '@friendofsvelte/tipex/styles/index.css';

	let { value = $bindable(''), placeholder = 'Start writing...' } = $props();

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
