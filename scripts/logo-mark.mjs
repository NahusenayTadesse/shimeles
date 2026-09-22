/**
 * Cuts the round portrait emblem out of `static/logo.png` into
 * `static/mark.png`.
 *
 * `logo.png` is the full lockup — the emblem, the name in English and Amharic,
 * and the tagline in both — on a flat `--forest` rectangle. That makes it the
 * right thing for an email header and the wrong thing for a page that already
 * says the name in type: it repeats the words, and its flat background shows
 * as a pasted box wherever the surface behind it is not exactly `--forest`
 * (the footer's `.forest-glow` has gold in its corners).
 *
 * The emblem alone has neither problem, and it is what the site header already
 * uses — at 64px, from `favicon.png`, which is too small for anything larger.
 * So it is taken from the lockup, where it is 222px across, and masked to a
 * circle so it carries its own transparency onto any background.
 *
 * Regenerate with `npm run logo:mark` if the logo is ever replaced. Check the
 * bounds below still hold: they are measured for this 720×238 lockup, not
 * detected, because a detector that guessed wrong would crop the man's head.
 *
 *   npm run logo:mark
 */
import sharp from 'sharp';

const SOURCE = 'static/logo.png';
const OUT = 'static/mark.png';

/** The emblem's box in `logo.png`, measured from the flat background around it. */
const BOX = { left: 12, top: 5, width: 226, height: 226 };

const mask = Buffer.from(
	`<svg width="${BOX.width}" height="${BOX.height}">
		<circle cx="${BOX.width / 2}" cy="${BOX.height / 2}" r="${BOX.width / 2 - 1}" fill="#fff"/>
	</svg>`
);

const { width, height } = await sharp(SOURCE).metadata();
if (width !== 720 || height !== 238) {
	console.error(
		`${SOURCE} is ${width}×${height}, not the 720×238 the crop below was measured against.\n` +
			`Re-measure BOX before trusting the output.`
	);
	process.exit(1);
}

await sharp(SOURCE)
	.extract(BOX)
	.composite([{ input: mask, blend: 'dest-in' }])
	.png()
	.toFile(OUT);

console.log(`wrote ${OUT} — ${BOX.width}×${BOX.height}, circular alpha`);
