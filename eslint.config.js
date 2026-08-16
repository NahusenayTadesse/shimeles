import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		},
		rules: {
			/**
			 * `resolve()` exists to prefix links with a configured `base` path. This
			 * app is deployed at the root of its own domain and has no `base`, so
			 * every link would gain a wrapper that resolves to itself. Off, rather
			 * than suppressed at ~40 call sites.
			 *
			 * If the app is ever mounted under a sub-path, turn this back on and fix
			 * the links it flags — that is exactly the moment it earns its keep.
			 */
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		/**
		 * The generic toolkit — the CRUD generator, the dynamic table, the column
		 * builders — is deliberately untyped at its edges: it accepts any table and
		 * any row shape, which is what makes one implementation serve twenty
		 * screens. TanStack's column definitions are `any` in their own types too.
		 * Narrowing these would mean either lying with casts or giving up the
		 * generality, so `any` is the honest annotation here.
		 */
		files: [
			'src/lib/server/crud.ts',
			'src/lib/dashboard/**/*.{ts,svelte}',
			'src/lib/components/Table/**/*.svelte',
			'src/lib/components/NavMain.svelte',
			'src/lib/components/app-sidebar.svelte',
			'src/lib/formComponents/**/*.svelte',
			'src/lib/forms/DynamicForm.svelte',
			'src/lib/content/PageShell.svelte',
			'src/routes/dashboard/**/*.svelte'
		],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	},
	{
		/**
		 * Admin-authored rich text is rendered as HTML on purpose — that is what
		 * the block editor and the pillar description editor produce, and stripping
		 * it would defeat the point of giving staff an editor at all.
		 *
		 * The exposure is bounded: only signed-in users holding `content.manage` or
		 * `pillars.manage` can write these fields, so this is the same trust level
		 * as any CMS. It is not a place to render anything a visitor submitted —
		 * public form answers are rendered as text everywhere they appear.
		 */
		// The bracket in `[slug]` is a glob character class, so the directory has
		// to be matched with a wildcard rather than written out literally.
		files: ['src/lib/content/BlockRenderer.svelte', 'src/routes/programs/*/+page.svelte'],
		rules: {
			'svelte/no-at-html-tags': 'off'
		}
	}
);
