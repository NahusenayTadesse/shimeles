<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Seo from '$lib/components/Seo.svelte';
	import { toast } from 'svelte-sonner';
	import PageHero from '$lib/content/PageHero.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import DonationCampaigns from '$lib/content/DonationCampaigns.svelte';
	import InKindForm from '$lib/donate/InKindForm.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { CircleCheck, Copy, HeartHandshake, Package } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const s = (key: string, fallback: string) => data.strings?.[key] ?? fallback;

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		resetForm: false,
		taintedMessage: null
	});

	/**
	 * Money or goods. Two forms, two tables, two workflows — a transfer is
	 * reconciled against a bank statement, a carload of coats is collected — so
	 * they are separate forms behind one switch rather than one form with half
	 * its fields hidden.
	 */
	let giftKind = $state<'money' | 'goods'>('money');

	/** Set once the gift is recorded; the page then shows the transfer reference. */
	let confirmation = $state<{ reference: string; amount: string } | null>(null);

	/**
	 * The reference only ever lived on-screen. A donor who closes the tab (or
	 * whose bank takes a few days) before they transfer had no way to find it
	 * again — this mirrors it into localStorage so reopening the donate page
	 * brings it back, for up to a week.
	 */
	const LAST_GIFT_KEY = 'donate:lastReference';
	let recoveredReference = $state<{ reference: string; amount: string; savedAt: number } | null>(
		null
	);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			// The toast fades and the summary is a long way up the page; this is
			// what actually takes the person to the question they missed.
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			if ($message.reference) {
				confirmation = { reference: $message.reference, amount: $message.amount ?? '' };
				try {
					localStorage.setItem(
						LAST_GIFT_KEY,
						JSON.stringify({ ...confirmation, savedAt: Date.now() })
					);
				} catch {
					// Private browsing or storage disabled — the on-screen copy is still there.
				}
				recoveredReference = null;
			}
		}
	});

	$effect(() => {
		if (confirmation) return;
		try {
			const raw = localStorage.getItem(LAST_GIFT_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw);
			if (Date.now() - saved.savedAt < 7 * 24 * 60 * 60 * 1000) {
				recoveredReference = saved;
			}
		} catch {
			// Nothing to recover.
		}
	});

	/**
	 * Quick-pick amounts, in birr. Local currency and diaspora amounts differ by
	 * an order of magnitude, so the ladder follows the account the donor picked
	 * rather than being one hardcoded set.
	 */
	const selectedAccount = $derived(
		data.payments.find((account) => account.accountId === $form.paymentAccountId) ??
			data.payments[0]
	);

	const presets = $derived(
		selectedAccount?.currency === 'USD' ? [10, 25, 50, 100, 250] : [200, 500, 1000, 2500, 5000]
	);

	const copyReference = async () => {
		if (!confirmation) return;
		await navigator.clipboard.writeText(confirmation.reference);
		toast.success('Reference copied');
	};

	const copy = async (value: string) => {
		await navigator.clipboard.writeText(value);
		toast.success('Copied');
	};
</script>

<Seo
	title={data.page?.title ?? 'Donate'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
	imageAlt={data.page?.title ?? 'Donate'}
	breadcrumbs={[
		{ name: 'Home', path: '/' },
		{ name: data.page?.title ?? 'Donate', path: '/donate' }
	]}
/>

<PageHero
	eyebrow="Where your gift goes"
	title={data.page?.title ?? s('donate.title', 'Give')}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
/>

<!-- The giving form is the page, not a column of it. The goods form in
     particular asks a lot of questions, and asking them down a 380px gutter
     made a form that was mostly scrolling. -->
<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-16 md:py-24">
	<div class="flex min-w-0 flex-col gap-6">
		{#if recoveredReference && !confirmation}
			<div
				class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-sm"
			>
				<span>
					Still to transfer? Your last reference was
					<button
						type="button"
						onclick={() => copy(recoveredReference?.reference ?? '')}
						class="font-mono font-semibold underline underline-offset-2"
					>
						{recoveredReference.reference}
					</button>
					for {recoveredReference.amount}.
				</span>
				<Button variant="ghost" size="sm" onclick={() => (recoveredReference = null)}>
					Dismiss
				</Button>
			</div>
		{/if}

		<Tabs.Root bind:value={giftKind} class="w-full">
			<Tabs.List class="grid w-full grid-cols-2">
				<Tabs.Trigger value="money">
					<HeartHandshake class="size-4" />
					{s('donate.kind_money', 'Give money')}
				</Tabs.Trigger>
				<Tabs.Trigger value="goods">
					<Package class="size-4" />
					{s('donate.kind_goods', 'Give goods')}
				</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		{#if giftKind === 'goods'}
			<Card.Root class="p-6">
				<InKindForm
					form={data.inKindForm}
					categories={data.goodsCategories}
					pillars={data.pillars}
					initiatives={data.initiatives.filter((initiative) => initiative.goalAmount)}
					regions={data.regions}
					{s}
				/>
			</Card.Root>
		{:else if confirmation}
			<Card.Root class="mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
				<div class="rounded-full bg-accent p-4 text-accent-foreground">
					<CircleCheck class="size-8" />
				</div>
				<h2 class="font-heading text-2xl font-semibold">Thank you</h2>
				<p class="text-muted-foreground">
					Make your transfer of <strong>{confirmation.amount}</strong> and include this reference. It
					is how we match the gift to your name.
				</p>
				<button
					type="button"
					onclick={copyReference}
					class="flex items-center gap-2 rounded-full bg-muted px-5 py-3 font-mono text-lg font-semibold"
				>
					{confirmation.reference}
					<Copy class="size-4 opacity-60" />
				</button>

				{#if selectedAccount}
					<dl class="w-full space-y-2 text-left text-sm">
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">Account name</dt>
							<dd class="text-right font-medium">{selectedAccount.accountName}</dd>
						</div>
						<div class="flex items-center justify-between gap-4">
							<dt class="text-muted-foreground">Account number</dt>
							<dd class="flex items-center gap-1 font-mono font-medium">
								{selectedAccount.accountNumber}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									onclick={() => copy(selectedAccount.accountNumber)}
								>
									<Copy class="size-3.5" />
								</Button>
							</dd>
						</div>
						{#if selectedAccount.bankName}
							<div class="flex justify-between gap-4">
								<dt class="text-muted-foreground">Bank</dt>
								<dd class="text-right">{selectedAccount.bankName}</dd>
							</div>
						{/if}
					</dl>
				{/if}

				<Button variant="outline" onclick={() => (confirmation = null)} class="mt-2">
					Give again
				</Button>
			</Card.Root>
		{:else}
			<Card.Root class="p-6 md:p-8">
				<form method="post" action="?/donate" use:enhance class="flex flex-col gap-6">
					<div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-2">
							<HeartHandshake class="size-5 text-primary" />
							<h2 class="font-heading text-xl font-semibold">
								{s('donate.form_title', 'Make a gift')}
							</h2>
						</div>
						{#if data.campaigns?.length}
							<a
								href="#card-payment"
								class="shrink-0 text-sm text-primary underline underline-offset-2"
							>
								Prefer to pay by card?
							</a>
						{/if}
					</div>
					<p class="-mt-3 text-xs text-muted-foreground">
						This records your gift and gives you a bank-transfer reference. It does not charge you
						directly.
					</p>

					<Errors allErrors={$allErrors} />

					<!-- Two columns at desk width: what the gift is on the left, who is
					     giving it on the right. They are independent halves of the same
					     decision, so neither has to be scrolled past to reach the other. -->
					<div class="grid gap-6 lg:grid-cols-2 lg:gap-10">
						<div class="flex min-w-0 flex-col gap-5">
							<!-- Frequency. "Monthly" creates a pledge with a reminder rather
					     than an auto-debit, which is stated here so nobody expects a
					     card to be charged. -->
							<Tabs.Root bind:value={$form.frequency} class="w-full">
								<Tabs.List class="grid w-full grid-cols-2">
									<Tabs.Trigger value="one_time">{s('donate.once', 'One-time')}</Tabs.Trigger>
									<Tabs.Trigger value="monthly">{s('donate.monthly', 'Monthly')}</Tabs.Trigger>
								</Tabs.List>
							</Tabs.Root>
							<input type="hidden" name="frequency" value={$form.frequency} />
							{#if $form.frequency === 'monthly'}
								<p class="-mt-3 text-xs text-muted-foreground">
									{s(
										'donate.monthly_note',
										'We will remind you each month. Bank transfers in Ethiopia cannot be charged automatically.'
									)}
								</p>
							{/if}

							<!-- Amount -->
							<div class="flex flex-col gap-2">
								<Label for="amount"
									>{s('donate.amount', 'Amount')} ({selectedAccount?.currency ?? 'ETB'})</Label
								>
								<div class="flex flex-wrap gap-2">
									{#each presets as preset (preset)}
										<Button
											type="button"
											variant={$form.amount === preset ? 'default' : 'outline'}
											size="sm"
											onclick={() => ($form.amount = preset)}
										>
											{preset.toLocaleString()}
										</Button>
									{/each}
								</div>
								<Input
									id="amount"
									name="amount"
									type="number"
									min="1"
									step="any"
									bind:value={$form.amount}
								/>
								{#if $errors.amount}
									<p class="text-sm text-destructive">{$errors.amount}</p>
								{/if}
							</div>

							<!-- Designation. The pillar list comes from the database, so a fifth
					     pillar appears here without a code change. -->
							<div class="flex flex-col gap-2">
								<Label>{s('donate.designation', 'Where should it go?')}</Label>
								<div class="flex flex-wrap gap-2">
									<Button
										type="button"
										variant={$form.designationType === 'general_fund' ? 'default' : 'outline'}
										size="sm"
										onclick={() => {
											$form.designationType = 'general_fund';
											$form.designationPillarId = null;
											$form.designationInitiativeId = null;
										}}
									>
										{s('donate.general_fund', 'Where most needed')}
									</Button>
									{#each data.pillars as pillar (pillar.id)}
										<Button
											type="button"
											variant={$form.designationPillarId === pillar.id ? 'default' : 'outline'}
											size="sm"
											onclick={() => {
												$form.designationType = 'pillar';
												$form.designationPillarId = pillar.id;
												$form.designationInitiativeId = null;
											}}
										>
											<DynamicIcon name={pillar.icon} class="size-4" />
											{pillar.name}
										</Button>
									{/each}
									{#each data.initiatives.filter((i) => i.goalAmount) as initiative (initiative.id)}
										<Button
											type="button"
											variant={$form.designationInitiativeId === initiative.id
												? 'default'
												: 'outline'}
											size="sm"
											onclick={() => {
												$form.designationType = 'future_initiative';
												$form.designationInitiativeId = initiative.id;
												$form.designationPillarId = null;
											}}
										>
											{initiative.name}
										</Button>
									{/each}
								</div>
								{#if $form.designationType === 'future_initiative' && data.settings?.['initiatives.disclaimer']}
									<!-- Shown at the point of choosing, not only further down
									     the page: this gift is towards something that does not
									     exist yet, and the donor should know before they give. -->
									<p
										class="rounded-xl border border-warning/30 bg-warning/8 p-3 text-xs text-muted-foreground"
									>
										{data.settings['initiatives.disclaimer']}
									</p>
								{/if}
								<input type="hidden" name="designationType" value={$form.designationType} />
								<input
									type="hidden"
									name="designationPillarId"
									value={$form.designationPillarId ?? ''}
								/>
								<input
									type="hidden"
									name="designationInitiativeId"
									value={$form.designationInitiativeId ?? ''}
								/>
							</div>

							<!-- Payment account. Diaspora donors need the foreign-currency
					     account; local donors need the birr one. -->
							{#if data.payments.length > 1}
								<div class="flex flex-col gap-2">
									<Label>{s('donate.method', 'How will you send it?')}</Label>
									<div class="grid gap-2">
										{#each data.payments as account (account.accountId)}
											<button
												type="button"
												onclick={() => ($form.paymentAccountId = account.accountId)}
												class={cn(
													'flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left text-sm transition-colors',
													$form.paymentAccountId === account.accountId
														? 'border-primary bg-primary/5'
														: 'hover:bg-muted'
												)}
											>
												<span class="font-medium">{account.methodName}</span>
												<Badge variant="outline">{account.currency}</Badge>
											</button>
										{/each}
									</div>
								</div>
							{/if}
							<input type="hidden" name="paymentAccountId" value={$form.paymentAccountId ?? ''} />
						</div>

						<div class="flex min-w-0 flex-col gap-5">
							<InputComp
								{errors}
								bind:value={$form.donorName}
								name="donorName"
								label={s('donate.name', 'Your name')}
								type="text"
								autocomplete="name"
								labelClass=""
								required
							/>

							<div class="grid gap-2 sm:grid-cols-2">
								<InputComp
									{errors}
									bind:value={$form.donorEmail}
									name="donorEmail"
									label={s('donate.email', 'Email')}
									type="email"
									autocomplete="email"
									labelClass=""
								/>
								<InputComp
									{errors}
									bind:value={$form.donorPhone}
									name="donorPhone"
									label={s('donate.phone', 'Phone')}
									type="tel"
									autocomplete="tel"
									labelClass=""
								/>
							</div>

							<InputComp
								{errors}
								bind:value={$form.donorOrganisation}
								name="donorOrganisation"
								label={s('donate.organisation', 'Organisation, if you are giving on its behalf')}
								type="text"
								placeholder={s('donate.organisation_hint', 'A company, school, church or group')}
								labelClass=""
							/>

							<InputComp
								{errors}
								bind:value={$form.donorMessage}
								name="donorMessage"
								label={s('donate.message', 'A message, if you would like')}
								type="textarea"
								rows={3}
								labelClass=""
							/>

							<div class="flex flex-col gap-2">
								<CheckboxField
									bind:checked={$form.isDiaspora}
									name="isDiaspora"
									label={s('donate.is_diaspora', 'I am giving from outside Ethiopia')}
								/>

								<!-- Only asked of a diaspora donor: for a gift sent from
								     inside Ethiopia the answer is already known, and an
								     extra box on a donation form costs gifts. -->
								{#if $form.isDiaspora}
									<div class="pt-1 pl-6">
										<InputComp
											{errors}
											bind:value={$form.donorCountry}
											name="donorCountry"
											label={s('donate.country', 'Which country are you giving from?')}
											type="text"
											autocomplete="country-name"
											labelClass=""
										/>
									</div>
								{/if}
								<CheckboxField
									bind:checked={$form.isAnonymous}
									name="isAnonymous"
									label={s('donate.anonymous', 'Keep my gift anonymous')}
								/>
								<CheckboxField
									bind:checked={$form.joinNewsletter}
									name="joinNewsletter"
									label={s('donate.newsletter', 'Send me occasional updates')}
								/>
							</div>
						</div>
					</div>

					<div class="hidden" aria-hidden="true">
						<input
							name="website"
							type="text"
							tabindex="-1"
							autocomplete="off"
							bind:value={$form.website}
						/>
					</div>

					<Button type="submit" size="lg" class="lg:w-fit lg:self-end lg:px-10">
						{#if $delayed}
							<LoadingBtn name={s('donate.sending', 'Recording your gift')} />
						{:else}
							<HeartHandshake class="size-4" />
							{s('donate.submit', 'Give')}
						{/if}
					</Button>
				</form>
			</Card.Root>
		{/if}
	</div>

	{#if data.campaigns?.length}
		<Card.Root id="card-payment" class="scroll-mt-[105px] p-6 md:p-8">
			<DonationCampaigns
				campaigns={data.campaigns}
				videos={data.campaignVideos}
				heading={s('donate.card_heading', 'Give by card')}
				description={s(
					'donate.card_description',
					'Fastest if you are giving from outside Ethiopia. The platform handles the payment and sends your receipt.'
				)}
			/>
		</Card.Root>
	{/if}
</div>

<!-- Where the gift goes. Below the form rather than beside it: somebody who
     arrived ready to give should not have to scroll past the case for giving. -->
{#if data.page && data.blocks}
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 md:pb-24">
		<BlockRenderer
			blocks={data.page.blocks}
			pillars={data.blocks.pillars}
			initiatives={data.blocks.initiatives}
			metrics={data.metrics}
			moneyTotals={data.moneyTotals}
			payments={data.blocks.payments}
			initiativeNotice={data.settings?.['initiatives.disclaimer'] ?? ''}
		/>
	</div>
{/if}
