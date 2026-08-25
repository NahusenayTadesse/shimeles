/**
 * Draws `static/og-default.png` — the picture that appears when somebody posts
 * a link to this site on Facebook, WhatsApp, X or Slack.
 *
 * Why a generated file rather than a runtime endpoint: rendering a share card
 * on request needs an image library (satori, sharp, a headless browser) sitting
 * in production for something that changes about once a year. This renders the
 * same card with the browser that is already installed for tests, commits the
 * PNG, and production serves a static file.
 *
 * Run it after changing the logo, the site name or the palette:
 *
 *     bun run og:image
 *
 * It is the *fallback*. A page with its own share image uses that, and the
 * `seo.share_image` setting overrides this for the whole site without a deploy
 * — this is what stops a link with neither from previewing as a grey box.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/** Facebook, X, LinkedIn and WhatsApp all crop to roughly 1.91:1. */
const WIDTH = 1200;
const HEIGHT = 630;

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'static', 'og-default.png');

/* The brand anchors, as hex — the site defines them in oklch, which is fine in
   a browser but unreadable in a template. Keep the two in step by eye: they are
   `--clay` and `--olive` in `src/routes/layout.css`. */
const CLAY = '#0e3b2e';
const CLAY_DEEP = '#082019';
const OLIVE = '#ccab59';
const SAND = '#f5efe3';

const dataUri = (file: string, mime: string) =>
	`data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;

const logo = dataUri(path.join(ROOT, 'static', 'logo.png'), 'image/png');
const sora = dataUri(
	path.join(ROOT, 'node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2'),
	'font/woff2'
);
const manrope = dataUri(
	path.join(
		ROOT,
		'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'
	),
	'font/woff2'
);

/**
 * The card.
 *
 * The logo is the whole lockup — mark, name in both scripts, and the
 * "Hope · Compassion · Opportunity" line — so the card does not repeat any of
 * it. What it adds is the one thing the logo does not say: what the Foundation
 * actually does.
 *
 * The background is flat `#0e3b2e` and not a gradient, because that is exactly
 * the colour baked into `logo.png`, which has no transparency. Any gradient or
 * glow behind it makes the logo's own background show up as a visible
 * rectangle — which is what the first version of this card did.
 *
 * Deliberately not a screenshot of the homepage: a share preview is seen at
 * thumbnail size in a chat list, and has to survive being shrunk to 200px wide.
 */
const html = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<style>
			@font-face {
				font-family: 'Sora';
				src: url('${sora}') format('woff2-variations');
				font-weight: 100 800;
			}
			@font-face {
				font-family: 'Manrope';
				src: url('${manrope}') format('woff2-variations');
				font-weight: 200 800;
			}
			* { margin: 0; padding: 0; box-sizing: border-box; }
			body {
				width: ${WIDTH}px;
				height: ${HEIGHT}px;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 44px;
				background: ${CLAY};
				color: ${SAND};
				font-family: 'Manrope', sans-serif;
				position: relative;
				overflow: hidden;
			}
			/* Strokes rather than fills: an arc drawn *behind* an opaque logo is
			   hidden by it, where a soft glow would betray the logo's edges. */
			.arc {
				position: absolute;
				border-radius: 50%;
				border: 2px solid rgba(204, 171, 89, 0.22);
			}
			.arc.one { right: -220px; bottom: -300px; width: 700px; height: 700px; }
			.arc.two { left: -260px; top: -320px; width: 620px; height: 620px; }
			img { width: 780px; height: auto; position: relative; }
			.rule { width: 120px; height: 5px; border-radius: 999px; background: ${OLIVE}; position: relative; }
			h1 {
				font-family: 'Sora', sans-serif;
				font-weight: 500;
				font-size: 38px;
				line-height: 1.35;
				letter-spacing: -0.01em;
				text-align: center;
				position: relative;
			}
			h1 b { font-weight: 700; color: ${OLIVE}; }
			footer {
				position: absolute;
				bottom: 46px;
				font-size: 24px;
				letter-spacing: 0.08em;
				text-transform: uppercase;
				color: rgba(245, 239, 227, 0.6);
			}
		</style>
	</head>
	<body>
		<div class="arc one"></div>
		<div class="arc two"></div>

		<img src="${logo}" alt="" />

		<div class="rule"></div>

		<h1>Medical hardship · Elder care<br /><b>Mental wellness · Youth education</b></h1>

		<footer>Addis Ababa, Ethiopia</footer>
	</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();

const { size } = fs.statSync(OUT);
console.log(`✓ ${path.relative(ROOT, OUT)} — ${WIDTH}×${HEIGHT}, ${(size / 1024).toFixed(0)} KB`);
