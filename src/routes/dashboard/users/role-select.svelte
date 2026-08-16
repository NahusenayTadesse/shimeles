<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';

	let {
		userId,
		roleId,
		roleItems
	}: {
		userId: string;
		roleId: number | null;
		roleItems: { value: string; name: string }[];
	} = $props();
</script>

<form
	method="post"
	action="?/setRole"
	use:enhance={() => async ({ update }) => await update({ reset: false })}
	class="flex items-center gap-2"
>
	<input type="hidden" name="userId" value={userId} />
	<SelectComp name="roleId" items={roleItems} value={String(roleId ?? '')} />
	<Button type="submit" size="sm" variant="outline">Set</Button>
</form>
