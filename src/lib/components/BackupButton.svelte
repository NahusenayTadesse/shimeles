<script lang="ts">
	import DatabaseBackupIcon from '@lucide/svelte/icons/database-backup';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * The one-click copy of the whole system: database plus uploaded files.
	 *
	 * It blinks once a backup is more than three days old — or has never been
	 * taken — because the failure mode here is silence. Nothing warns you that
	 * the last copy of the case records is a fortnight stale; the only person
	 * who can fix that is the super admin looking at this bar, so the bar is
	 * where the reminder belongs.
	 */

	/** Epoch milliseconds of the last downloaded backup, or null for never. */
	let { lastBackupAt = null }: { lastBackupAt?: number | null } = $props();

	const STALE_AFTER = 3 * 24 * 60 * 60 * 1000;

	/*
	 * A dashboard tab stays open for days, so "is it stale yet" cannot be
	 * decided once at render. This clock ticks every minute and the derived
	 * state below follows it, which means the button starts blinking on the
	 * screen of someone who has not touched it since Monday.
	 */
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	let preparing = $state(false);

	const age = $derived(lastBackupAt === null ? null : now - lastBackupAt);
	const isStale = $derived(age === null || age > STALE_AFTER);

	const label = $derived.by(() => {
		if (age === null) return 'No backup has ever been downloaded';
		const days = Math.floor(age / 86_400_000);
		if (days >= 1) return `Last backup ${days} day${days === 1 ? '' : 's'} ago`;
		const hours = Math.floor(age / 3_600_000);
		if (hours >= 1) return `Last backup ${hours} hour${hours === 1 ? '' : 's'} ago`;
		return 'Backed up in the last hour';
	});

	function start() {
		preparing = true;
		toast.info('Preparing the backup…', {
			description: 'The download starts once the archive is packed. Large images take a moment.'
		});
		/*
		 * The browser handles the download itself, so there is no response here
		 * to await — and the audit row that `lastBackupAt` is read from is only
		 * written once the request reaches the endpoint. Re-reading the layout
		 * data shortly afterwards is what stops the blinking, and it stops it
		 * only if the download really was authorised: a 403 writes no such row,
		 * so the button honestly keeps blinking.
		 */
		setTimeout(() => {
			preparing = false;
			invalidateAll();
		}, 6000);
	}
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- An anchor, not a button: this is a plain GET download, so it wants
			     to behave like one — middle-click, right-click, save-as. -->
			<a
				{...props}
				href="/dashboard/backup"
				download
				onclick={(event) => {
					// Spreading `props` last would clobber this handler, spreading it
					// first would clobber the trigger's own — so call both.
					(props.onclick as ((event: MouseEvent) => void) | undefined)?.(event);
					start();
				}}
				aria-label="Download a full backup. {label}"
				aria-busy={preparing}
				class={cn(
					buttonVariants({ variant: 'outline', size: 'icon' }),
					isStale &&
						'border-amber-500 text-amber-600 hover:text-amber-600 dark:border-amber-400 dark:text-amber-400',
					// `motion-reduce` matters more here than usual: this thing is
					// designed to be noticed, and a permanently pulsing control is
					// exactly what a reduced-motion preference is asking us not to do.
					isStale && !preparing && 'animate-pulse motion-reduce:animate-none'
				)}
			>
				<DatabaseBackupIcon class="h-[1.2rem] w-[1.2rem]" />
				<span class="sr-only">Download backup</span>
			</a>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content align="end">
		<p>Download full backup</p>
		<p class={cn('text-xs', isStale ? 'text-amber-500' : 'text-muted-foreground')}>{label}</p>
	</Tooltip.Content>
</Tooltip.Root>
