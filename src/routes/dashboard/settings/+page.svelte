<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Save } from '@lucide/svelte';
	import { yesNo } from '$lib/dashboard/options';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import FileUpload from '$lib/formComponents/FileUpload.svelte';

	let { data, form } = $props();

	/**
	 * The settings screen draws itself from the rows, not from a field list in
	 * this file. Adding a setting is a database row; this component already
	 * knows how to render it, because it renders by `value_type`.
	 */
	let active = $state(data.groups[0]?.name ?? 'general');
	let saving = $state<string | null>(null);

	const title = (group: string) =>
		group.charAt(0).toUpperCase() + group.slice(1).replace(/[-_]/g, ' ');

	$effect(() => {
		if (form?.saved) toast.success(`${title(form.saved)} settings saved`);
		if (form?.errors) toast.error('Some settings could not be saved. See the highlighted fields.');
	});
</script>

<svelte:head><title>Site settings · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Site settings</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			Everything global on the public site: contact details, social links, bank details, homepage
			copy. This screen builds itself from the settings that exist, so a new setting appears here
			the moment it is added, with no developer involved.
		</p>
	</div>

	<Tabs.Root bind:value={active}>
		<Tabs.List class="flex-wrap">
			{#each data.groups as group (group.name)}
				<Tabs.Trigger value={group.name}>{title(group.name)}</Tabs.Trigger>
			{/each}
		</Tabs.List>

		{#each data.groups as group (group.name)}
			<Tabs.Content value={group.name}>
				<Card.Root class="p-6">
					<form
						method="post"
						action="?/save"
						enctype="multipart/form-data"
						use:enhance={() => {
							saving = group.name;
							return async ({ update }) => {
								await update({ reset: false });
								saving = null;
							};
						}}
						class="flex flex-col gap-5"
					>
						<input type="hidden" name="__group" value={group.name} />

						{#each group.settings as setting (setting.key)}
							<div class="flex flex-col gap-2">
								<Label for={setting.key}>{setting.label}</Label>

								{#if setting.valueType === 'textarea'}
									<Textarea
										id={setting.key}
										name={setting.key}
										rows={3}
										value={setting.value ?? ''}
									/>
								{:else if setting.valueType === 'boolean'}
									<SelectComp
										name={setting.key}
										items={yesNo}
										value={String(setting.value ?? 'false')}
									/>
								{:else if setting.valueType === 'json'}
									<Textarea
										id={setting.key}
										name={setting.key}
										rows={4}
										class="font-mono text-xs"
										value={setting.value ?? ''}
									/>
								{:else if setting.valueType === 'image'}
									<FileUpload name={setting.key} image={setting.value} />
								{:else}
									<Input
										id={setting.key}
										name={setting.key}
										type={setting.valueType === 'number'
											? 'number'
											: setting.valueType === 'url'
												? 'url'
												: 'text'}
										step="any"
										value={setting.value ?? ''}
									/>
								{/if}

								{#if setting.hint}
									<p class="text-xs text-muted-foreground">{setting.hint}</p>
								{/if}
								{#if form?.errors?.[setting.key]}
									<p class="text-xs text-destructive">{form.errors[setting.key]}</p>
								{/if}
								<p class="font-mono text-[10px] text-muted-foreground/60">{setting.key}</p>
							</div>
						{/each}

						<Button type="submit" class="w-fit" disabled={saving === group.name}>
							<Save class="size-4" />
							{saving === group.name ? 'Saving…' : `Save ${title(group.name)}`}
						</Button>
					</form>
				</Card.Root>
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</div>
