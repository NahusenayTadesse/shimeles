<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CircleHelp } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import type { RenderHelpTopic } from '$lib/content/types';

	/**
	 * The help panel: one button that opens an accordion of questions.
	 *
	 * Closed by default. Somebody who knows what they are doing should not have
	 * to scroll past six answers to reach the form, and somebody who does not
	 * should find the way in without hunting — so it is a button in the flow of
	 * the page rather than a floating bubble or a page of its own.
	 *
	 * The questions are rows in `help_topics` (§0). The English is the source of
	 * truth; the Amharic is offered when it exists, per topic, and a topic still
	 * missing its translation falls back to the English rather than to a blank.
	 */
	let {
		topics = [],
		labels = {},
		contactHref = '',
		class: className = ''
	}: {
		topics?: RenderHelpTopic[];
		/** `help.*` strings, each with the Amharic staff have written for it. */
		labels?: Record<string, { en: string; am: string | null }>;
		/** Where "still stuck" sends them. Omitted, the line is not shown. */
		contactHref?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	let lang = $state<'en' | 'am'>('en');

	/**
	 * The switch appears only once there is something to switch to. A button
	 * that turned every answer back into English would be worse than no button:
	 * it would read as the translation having failed.
	 */
	const hasAmharic = $derived(
		topics.some((topic) => topic.questionAm?.trim() && topic.answerAm?.trim())
	);

	const say = (key: string, fallback: string) => {
		const pair = labels[key];
		if (!pair) return fallback;
		return (lang === 'am' ? pair.am?.trim() || pair.en : pair.en) || fallback;
	};

	/** Amharic where a translator has been, English where they have not. */
	const inLang = (en: string, am: string | null) =>
		lang === 'am' && am?.trim() ? { text: am, lang: 'am' } : { text: en, lang: 'en' };
</script>

<div class={cn('rounded-2xl border border-border bg-muted/40', className)}>
	<Button
		type="button"
		variant="ghost"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="help-panel-body"
		class="h-auto w-full justify-start gap-2 rounded-2xl px-4 py-3.5 text-left font-medium whitespace-normal"
	>
		<CircleHelp class="size-4 shrink-0 text-primary" />
		{say('help.button', 'Not sure how this works?')}
	</Button>

	{#if open}
		<div id="help-panel-body" class="border-t border-border px-4 pt-3 pb-2">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="eyebrow text-muted-foreground">
					{say('help.title', 'Questions people ask us')}
				</p>

				{#if hasAmharic}
					<!-- Each language names itself in itself: somebody who cannot read
					     the interface language can still find their way out of it. -->
					<div class="flex items-center gap-1 rounded-full bg-background p-0.5" role="group">
						<button
							type="button"
							onclick={() => (lang = 'en')}
							aria-pressed={lang === 'en'}
							class={cn(
								'rounded-full px-3 py-1 text-xs transition-colors',
								lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
							)}
						>
							English
						</button>
						<button
							type="button"
							onclick={() => (lang = 'am')}
							aria-pressed={lang === 'am'}
							lang="am"
							class={cn(
								'rounded-full px-3 py-1 text-xs transition-colors',
								lang === 'am' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
							)}
						>
							አማርኛ
						</button>
					</div>
				{/if}
			</div>

			<Accordion.Root type="single" class="mt-1">
				{#each topics as topic (topic.id)}
					{@const question = inLang(topic.question, topic.questionAm)}
					{@const answer = inLang(topic.answer, topic.answerAm)}
					<Accordion.Item value={String(topic.id)}>
						<Accordion.Trigger lang={question.lang}>{question.text}</Accordion.Trigger>
						<Accordion.Content>
							<p lang={answer.lang} class="text-muted-foreground">{answer.text}</p>
						</Accordion.Content>
					</Accordion.Item>
				{/each}
			</Accordion.Root>

			{#if contactHref}
				<p class="py-3 text-xs text-muted-foreground">
					<a href={contactHref} class="underline underline-offset-2 hover:text-foreground">
						{say('help.footer', 'Still stuck? Write to us and a person will answer.')}
					</a>
				</p>
			{/if}
		</div>
	{/if}
</div>
