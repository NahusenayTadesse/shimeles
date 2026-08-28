<script lang="ts">
	import DatabaseBackupIcon from '@lucide/svelte/icons/database-backup';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * The one-click copy of the whole system: database plus uploaded files.
	 *
	 * It escalates once a backup is more than three days old — or has never been
	 * taken — because the failure mode here is silence. Nothing warns you that
	 * the last copy of the case records is a fortnight stale; the only person
	 * who can fix that is the super admin looking at this bar, so the bar is
	 * where the reminder belongs. And a reminder that can be skimmed past is no
	 * reminder, so the older it gets the harder it is to skim past:
	 *
	 *   3 days  — the icon grows a day count and starts flashing amber.
	 *   7 days  — it turns red, shakes, and a toast comes back every few
	 *             minutes until someone deals with it.
	 *  14 days  — it swaps to a warning triangle, throbs, and the toast will
	 *             not dismiss itself at all.
	 *
	 * Every tier stays a normal-sized, normally-placed, clickable control. The
	 * nagging is loud on purpose; it is never in the way of the one action that
	 * makes it stop.
	 */

	/** Epoch milliseconds of the last downloaded backup, or null for never. */
	let { lastBackupAt = null }: { lastBackupAt?: number | null } = $props();

	const DAY = 24 * 60 * 60 * 1000;
	const STALE_AFTER = 3 * DAY;
	const OVERDUE_AFTER = 7 * DAY;
	const CRITICAL_AFTER = 14 * DAY;

	/** How often the toast comes back while a backup is overdue. */
	const NAG_INTERVAL = 4 * 60 * 1000;

	/*
	 * A dashboard tab stays open for days, so "is it stale yet" cannot be
	 * decided once at render. This clock ticks every minute and the derived
	 * state below follows it, which means the button starts nagging on the
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
	// Never backed up is the worst case there is, so it starts at the top.
	const isOverdue = $derived(age === null || age > OVERDUE_AFTER);
	const isCritical = $derived(age === null || age > CRITICAL_AFTER);

	const label = $derived.by(() => {
		if (age === null) return 'No backup has ever been downloaded';
		const days = Math.floor(age / DAY);
		if (days >= 1) return `Last backup ${days} day${days === 1 ? '' : 's'} ago`;
		const hours = Math.floor(age / 3_600_000);
		if (hours >= 1) return `Last backup ${hours} hour${hours === 1 ? '' : 's'} ago`;
		return 'Backed up in the last hour';
	});

	/* The short form that rides on the button itself once it is stale. */
	const badge = $derived.by(() => {
		if (age === null) return 'Never backed up';
		const days = Math.floor(age / DAY);
		if (isCritical) return `Back up now — ${days}d`;
		return `${days}d since backup`;
	});

	/*
	 * The button only nags the eye, and an eye can look elsewhere. Once a
	 * backup is a week late the toast starts coming back on its own, and past
	 * two weeks it stops expiring: the only things that clear it are the close
	 * button and an actual backup.
	 */
	$effect(() => {
		if (!isOverdue || preparing) return;

		const critical = isCritical;
		const show = () =>
			toast.error(critical ? 'The backup is dangerously old' : 'The backup is overdue', {
				id: 'backup-overdue',
				description: `${label}. If the server is lost right now, everything since then is gone.`,
				duration: critical ? Number.POSITIVE_INFINITY : 12_000,
				action: { label: 'Download', onClick: () => download() }
			});

		show();
		const timer = setInterval(show, NAG_INTERVAL);
		return () => {
			clearInterval(timer);
			toast.dismiss('backup-overdue');
		};
	});

	/** Fires the same plain GET the anchor does, from the toast's button. */
	function download() {
		const a = document.createElement('a');
		a.href = '/dashboard/backup';
		a.download = '';
		a.click();
		start();
	}

	function start() {
		preparing = true;
		toast.dismiss('backup-overdue');
		toast.info('Preparing the backup…', {
			description: 'The download starts once the archive is packed. Large images take a moment.'
		});
		/*
		 * The browser handles the download itself, so there is no response here
		 * to await — and the audit row that `lastBackupAt` is read from is only
		 * written once the request reaches the endpoint. Re-reading the layout
		 * data shortly afterwards is what stops the nagging, and it stops it
		 * only if the download really was authorised: a 403 writes no such row,
		 * so the button honestly keeps nagging.
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
					buttonVariants({
						variant: 'outline',
						// Stale earns the wide shape: an icon alone is furniture, a
						// button with a day count on it is a message.
						size: isStale && !preparing ? 'sm' : 'icon'
					}),
					isStale &&
						'border-amber-500 text-amber-600 hover:text-amber-600 dark:border-amber-400 dark:text-amber-400',
					// A week overdue stops being a hint. Filled red, not outlined.
					isOverdue &&
						'border-destructive bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive dark:border-destructive/60',
					isCritical && 'bg-destructive/25 font-bold dark:bg-destructive/30',
					// `motion-reduce` matters more here than usual: this thing is
					// designed to be noticed, and a permanently moving control is
					// exactly what a reduced-motion preference is asking us not to
					// do. The colour, the wording and the toast carry it there
					// instead, which is why the escalation is never motion alone.
					isStale && !preparing && 'nag',
					isOverdue && !preparing && 'nag-hard',
					isCritical && !preparing && 'nag-critical'
				)}
			>
				{#if isCritical && !preparing}
					<TriangleAlertIcon class="h-[1.2rem] w-[1.2rem]" />
				{:else}
					<DatabaseBackupIcon class="h-[1.2rem] w-[1.2rem]" />
				{/if}
				{#if isStale && !preparing}
					<span>{badge}</span>
				{:else}
					<span class="sr-only">Download backup</span>
				{/if}
			</a>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content align="end">
		<p>Download full backup</p>
		<p
			class={cn(
				'text-xs',
				isOverdue
					? 'font-semibold text-destructive'
					: isStale
						? 'text-amber-500'
						: 'text-muted-foreground'
			)}
		>
			{label}
		</p>
		{#if isStale}
			<p class="max-w-52 text-xs text-muted-foreground">
				This keeps nagging until a backup is downloaded. Nothing else in the system will tell you
				the last copy is old.
			</p>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>

<style>
	/*
	 * `animate-pulse` fades between two opacities, which is precisely the kind
	 * of motion the eye learns to filter out after a minute. These do the
	 * opposite: they hold still, then move sharply, so peripheral vision keeps
	 * catching them for as long as the backup stays old. Each tier runs on a
	 * shorter cycle than the last — the gap between nags is the thing that
	 * shrinks, which is what makes it feel like it is losing patience.
	 */
	@keyframes nag-flash {
		0%,
		74%,
		100% {
			opacity: 1;
		}
		80%,
		92% {
			opacity: 0.15;
		}
		86% {
			opacity: 1;
		}
	}

	@keyframes nag-shake {
		0%,
		62%,
		100% {
			transform: translateX(0);
		}
		68%,
		78%,
		88% {
			transform: translateX(-4px);
		}
		73%,
		83%,
		93% {
			transform: translateX(4px);
		}
	}

	/* A halo that swells out of the button — visible from across the room,
	   and pointer-events-none by virtue of being a shadow, so it never gets
	   between the cursor and the control. */
	@keyframes nag-throb {
		0%,
		100% {
			box-shadow: 0 0 0 0 var(--nag-halo);
		}
		50% {
			box-shadow: 0 0 0 6px transparent;
		}
	}

	.nag {
		animation: nag-flash 2s ease-in-out infinite;
	}

	/* The shake sits on top of the flash rather than replacing it. */
	.nag-hard {
		animation:
			nag-flash 1.4s ease-in-out infinite,
			nag-shake 1.4s ease-in-out infinite;
	}

	.nag-critical {
		--nag-halo: color-mix(in oklch, var(--destructive) 55%, transparent);
		animation:
			nag-flash 0.9s ease-in-out infinite,
			nag-shake 0.9s ease-in-out infinite,
			nag-throb 0.9s ease-in-out infinite;
	}

	@media (prefers-reduced-motion: reduce) {
		.nag,
		.nag-hard,
		.nag-critical {
			animation: none;
		}
	}
</style>
