<script lang="ts">
	/**
	 * The Foundation's lockup, drawn rather than photographed.
	 *
	 * `logo.png` is a 720×238 bitmap: the emblem, the name in English and
	 * Amharic, a rule, and the tagline in both. Everything but the emblem is
	 * type, and type in a bitmap is type that blurs on a retina screen, cannot
	 * be selected or read aloud, cannot follow `site.name` when staff edit it,
	 * and carries its own flat `--forest` background onto whatever is behind it.
	 *
	 * So the words are rebuilt here as SVG text at the same coordinates the
	 * bitmap measures, and only the portrait stays an image (`mark.png`, cut
	 * from the lockup by `npm run logo:mark`). The `viewBox` makes the whole
	 * thing scale to whatever width it is given, at any pixel density.
	 *
	 * **`textLength` is what makes it look like the logo.** The three name lines
	 * and the rule are all flush to the same 458-unit column — that is the whole
	 * character of the lockup, and it is not something letter-spacing can be
	 * tuned to hold once a staff member edits the name. Each line is given its
	 * measured width and `lengthAdjust="spacing"`, so the browser tracks the
	 * letters out to fill it exactly and never distorts the glyphs themselves.
	 *
	 * Every string is a setting (§0). The name is split with its last word on
	 * the second line, which is how the bitmap sets it.
	 *
	 * The type and the gold arrive through classes rather than `font-family` and
	 * `fill` attributes: a presentation attribute holding `var(--font-serif)`
	 * resolves in Chrome but is not dependable across engines, and where it
	 * fails the mark quietly falls back to the browser's default serif in a
	 * default colour — which looks like a rendering bug and reads like a
	 * different organisation.
	 */
	let {
		name,
		nameAmharic,
		tagline,
		taglineAmharic,
		class: className = ''
	}: {
		name: string;
		nameAmharic?: string;
		tagline?: string;
		taglineAmharic?: string;
		class?: string;
	} = $props();

	const words = $derived(name.trim().split(/\s+/).filter(Boolean));
	/** "Shimeles Abera Foundation" → "Shimeles Abera" over "Foundation". */
	const firstLine = $derived(words.length > 1 ? words.slice(0, -1).join(' ') : name);
	const secondLine = $derived(words.length > 1 ? words[words.length - 1] : '');

	/**
	 * "Hope. Compassion. Opportunity." → "Hope • Compassion • Opportunity", the
	 * way the lockup sets it. The setting keeps its full stops because that is
	 * how it reads everywhere else on the site.
	 */
	const taglineParts = $derived(
		(tagline ?? '')
			.split(/[.•·]/)
			.map((part) => part.trim())
			.filter(Boolean)
	);

	/** What a screen reader hears: the whole mark, once, as a sentence. */
	const label = $derived([name, tagline].filter(Boolean).join(' — '));
</script>

<!--
	The geometry below is measured from `logo.png`, in its own units (720×238,
	with six units of air added on the right so the flush column's last glyph is
	not shaved by the viewBox edge):
	the emblem's box, the divider at x=244, the 458-wide text column from x=262,
	and each line's baseline and width. Change one and it stops being the logo.
-->
<svg
	viewBox="0 0 726 238"
	class={className}
	role="img"
	aria-label={label}
	xmlns="http://www.w3.org/2000/svg"
>
	<!-- The one part that stays a photograph. It is masked to a circle, so it
	     needs no background of its own and sits on whatever is behind it. -->
	<image href="/mark.png" x="12" y="5" width="226" height="226" />

	<rect x="244" y="20" width="4" height="207" class="fill-(--gold)" />

	<g class="font-serif" fill="#f6f3e6" font-weight="700">
		<text x="262" y="69" font-size="55" textLength="458" lengthAdjust="spacing">
			{firstLine.toUpperCase()}
		</text>
		{#if secondLine}
			<text x="262" y="117" font-size="44" textLength="458" lengthAdjust="spacing">
				{secondLine.toUpperCase()}
			</text>
		{/if}
		{#if nameAmharic}
			<text x="262" y="156" font-size="27" textLength="458" lengthAdjust="spacing">
				{nameAmharic}
			</text>
		{/if}
	</g>

	<rect x="262" y="170" width="458" height="4" class="fill-(--gold)" />

	<g class="fill-(--gold) font-serif" text-anchor="middle">
		{#if taglineParts.length}
			<text x="491" y="197" font-size="23" font-style="italic" textLength="440">
				{taglineParts.join(' • ')}
			</text>
		{/if}
		{#if taglineAmharic}
			<text x="491" y="224" font-size="17" textLength="389">{taglineAmharic}</text>
		{/if}
	</g>
</svg>
