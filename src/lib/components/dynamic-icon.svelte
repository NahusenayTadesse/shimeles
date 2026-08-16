<script lang="ts" module>
	import {
		Accessibility,
		Award,
		BookOpen,
		Brain,
		Building2,
		Calendar,
		Cross,
		GraduationCap,
		HandCoins,
		HandHeart,
		Handshake,
		Heart,
		HeartHandshake,
		HeartPulse,
		Home,
		Landmark,
		Leaf,
		Lightbulb,
		LifeBuoy,
		MapPin,
		MessageCircleHeart,
		Package,
		Phone,
		School,
		ShieldCheck,
		Smile,
		Sparkles,
		Sprout,
		Stethoscope,
		Sun,
		Users,
		UserRoundCheck
	} from '@lucide/svelte';

	/**
	 * Icons are stored in the database as plain names — `pillars.icon`,
	 * `future_initiatives.icon` — so a program manager adding a fifth pillar
	 * picks one from a dropdown rather than asking for a deploy, and no
	 * component reference has to survive serialisation through `load`.
	 *
	 * Add to this map to widen the dropdown; the dashboard reads `iconNames`.
	 */
	const icons = {
		Accessibility,
		Award,
		BookOpen,
		Brain,
		Building2,
		Calendar,
		Cross,
		GraduationCap,
		HandCoins,
		HandHeart,
		Handshake,
		Heart,
		HeartHandshake,
		HeartPulse,
		Home,
		Landmark,
		Leaf,
		Lightbulb,
		LifeBuoy,
		MapPin,
		MessageCircleHeart,
		Package,
		Phone,
		School,
		ShieldCheck,
		Smile,
		Sparkles,
		Sprout,
		Stethoscope,
		Sun,
		Users,
		UserRoundCheck
	};

	export type IconName = keyof typeof icons;
	export const iconNames = Object.keys(icons) as IconName[];

	/** For the dashboard's icon picker, which wants `{ value, name }` pairs. */
	export const iconItems = iconNames.map((name) => ({ value: name, name }));
</script>

<script lang="ts">
	let {
		name,
		fallback = 'HeartHandshake',
		...rest
	}: { name?: string | null; fallback?: IconName; class?: string } = $props();

	// An unknown name renders the fallback rather than crashing the page: the
	// icon column is free text in the database and a typo must not 500 the site.
	const Icon = $derived(icons[(name ?? '') as IconName] ?? icons[fallback]);
</script>

<Icon {...rest} />
