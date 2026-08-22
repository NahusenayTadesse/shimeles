<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	/**
	 * The dashboard error page.
	 *
	 * Rendered inside the dashboard layout, so the sidebar stays: whatever went
	 * wrong, the staff member is still somewhere they recognise rather than on
	 * a bare status code with only the back button to escape with.
	 *
	 * The distinction it works hard to keep is 403 versus 404. "This case
	 * belongs to a programme you do not have access to" and "this case does not
	 * exist" are different facts, and a caseworker who followed a colleague's
	 * link needs to know which one they are looking at — the first is solved by
	 * asking an administrator, the second by asking for a better link.
	 */

	const status = $derived(page.status);
	const isForbidden = $derived(status === 403);
	const isNotFound = $derived(status === 404);

	const heading = $derived(
		isForbidden
			? 'You do not have access to this'
			: isNotFound
				? 'That record is not here'
				: 'Something went wrong'
	);

	const explanation = $derived(
		isForbidden
			? 'The record exists, but it sits outside the programmes or permissions your account has been given. Nothing has been logged against you beyond the usual access record.'
			: isNotFound
				? 'It may have been deleted, or the link may be out of date. If a colleague sent it, ask them to re-send it from the record itself.'
				: 'The page could not be loaded. Trying again often works; if it does not, tell an administrator what you were doing.'
	);

	const Icon = $derived(isForbidden ? LockIcon : isNotFound ? SearchXIcon : TriangleAlertIcon);
</script>

<svelte:head>
	<title>{heading} · Dashboard</title>
</svelte:head>

<div class="mx-auto w-full max-w-xl py-16">
	<div class="rounded-xl border border-border bg-card p-8 shadow-sm">
		<div
			class="flex size-11 items-center justify-center rounded-lg {isForbidden
				? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
				: 'bg-muted text-muted-foreground'}"
		>
			<Icon class="size-5" />
		</div>

		<p class="mt-5 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
			Error {status}
		</p>
		<h1 class="mt-2 font-heading text-2xl font-semibold">{heading}</h1>
		<p class="mt-3 text-sm text-muted-foreground">{explanation}</p>

		<!-- The server messages behind these throws are written for people —
		     `permissions.ts` and the case loaders say things like "This case
		     belongs to a programme you do not have access to" — so show them
		     rather than paraphrasing. The generic SvelteKit fillers are not
		     worth the space. -->
		{#if page.error?.message && !['Not Found', 'Internal Error', 'Forbidden'].includes(page.error.message)}
			<p class="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
				{page.error.message}
			</p>
		{/if}

		<div class="mt-6 flex flex-wrap gap-3">
			<Button href="/dashboard">
				<LayoutDashboardIcon class="size-4" />
				Back to the dashboard
			</Button>
			<Button variant="outline" onclick={() => history.back()}>
				<ArrowLeftIcon class="size-4" />
				Go back
			</Button>
		</div>

		{#if isForbidden}
			<p class="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
				If you need this for your work, an administrator can grant it under
				<span class="font-medium text-foreground">Configuration → Users</span>. Either a programme
				assignment or the specific permission.
			</p>
		{/if}
	</div>
</div>
