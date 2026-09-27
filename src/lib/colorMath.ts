/**
 * Pure colour maths for the picker — no DOM, no Svelte, so it can be unit
 * tested in plain Node (see `.workbuddy-ai/verify-color.mjs`).
 *
 * The application's accent colour is an opaque `#rrggbb` string: `safeAccentColor()`
 * in `letter.ts` rejects anything else and falls back to the default, and the
 * value ends up verbatim in the Typst source (`#let heading-color = rgb("…")`).
 * Everything here therefore reads and writes that one shape, and drops alpha
 * rather than carrying it around.
 */

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export interface Hsv {
	/** 0..360 */
	h: number;
	/** 0..1 */
	s: number;
	/** 0..1 */
	v: number;
}

const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function toHexByte(n: number): string {
	return byte(n).toString(16).padStart(2, "0");
}

/** `{r,g,b}` → `#rrggbb` (lower case). */
export function rgbToHex(c: Rgb): string {
	return `#${toHexByte(c.r)}${toHexByte(c.g)}${toHexByte(c.b)}`;
}

/**
 * `#rrggbb` (or a bare `rrggbb`) → `{r,g,b}`. Anything unparseable becomes
 * black, so callers that must not guess should run `parseColorText()` first.
 */
export function hexToRgb(hex: string): Rgb {
	const bare = hex.trim().replace(/^#/, "");
	if (!/^[0-9a-f]{6}$/i.test(bare)) return { r: 0, g: 0, b: 0 };
	return {
		r: parseInt(bare.slice(0, 2), 16),
		g: parseInt(bare.slice(2, 4), 16),
		b: parseInt(bare.slice(4, 6), 16),
	};
}

/**
 * `prevH` is returned unchanged for greys, where the hue is undefined: without
 * it, dragging the picker down to black (or up to white) would silently reset
 * the hue to 0 and the next drag would jump to red.
 */
export function rgbToHsv(c: Rgb, prevH = 0): Hsv {
	const r = byte(c.r) / 255;
	const g = byte(c.g) / 255;
	const b = byte(c.b) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = prevH;
	if (d !== 0) {
		if (max === r) h = 60 * (((g - b) / d) % 6);
		else if (max === g) h = 60 * ((b - r) / d + 2);
		else h = 60 * ((r - g) / d + 4);
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
	const hh = (((h % 360) + 360) % 360) / 60;
	const ss = Math.max(0, Math.min(1, s));
	const vv = Math.max(0, Math.min(1, v));
	const i = Math.floor(hh);
	const f = hh - i;
	const p = vv * (1 - ss);
	const q = vv * (1 - f * ss);
	const t = vv * (1 - (1 - f) * ss);
	let rp: number;
	let gp: number;
	let bp: number;
	switch (i) {
		case 0: [rp, gp, bp] = [vv, t, p]; break;
		case 1: [rp, gp, bp] = [q, vv, p]; break;
		case 2: [rp, gp, bp] = [p, vv, t]; break;
		case 3: [rp, gp, bp] = [p, q, vv]; break;
		case 4: [rp, gp, bp] = [t, p, vv]; break;
		default: [rp, gp, bp] = [vv, p, q]; break;
	}
	return { r: Math.round(rp * 255), g: Math.round(gp * 255), b: Math.round(bp * 255) };
}

/**
 * Reads a colour the user typed and returns it as `#rrggbb`, or null when there
 * is nothing usable in the text.
 *
 * Accepts `#rgb`, `#rrggbb`, a bare `rgb`/`rrggbb`, `#rrggbbaa` and
 * `rgb()`/`rgba()` — being forgiving on input is the whole point of a text
 * field. Alpha is dropped: the accent colour is opaque.
 */
export function parseColorText(text: string): string | null {
	const raw = (text || "").trim();
	if (!raw) return null;

	const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
	if (short) {
		return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
	}

	const bare = raw.replace(/^#/, "");
	if (/^[0-9a-f]{8}$/i.test(bare)) return `#${bare.slice(0, 6)}`.toLowerCase();
	if (/^[0-9a-f]{6}$/i.test(bare)) return `#${bare}`.toLowerCase();

	// rgb(...) / rgba(...) / "r g b" / "r,g,b" — channels may be percentages.
	const inner = raw
		.replace(/^rgba?\(/i, "")
		.replace(/\)$/, "")
		.replace(/\s*\/\s*/g, ",");
	const parts = inner.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
	if (parts.length < 3) return null;
	const num = parts.slice(0, 3).map((p) => parseFloat(p));
	if (num.some((n) => Number.isNaN(n))) return null;
	const channel = (n: number, src: string) => (src.includes("%") ? (n / 100) * 255 : n);
	return rgbToHex({
		r: channel(num[0], parts[0]),
		g: channel(num[1], parts[1]),
		b: channel(num[2], parts[2]),
	});
}

/** The swatches offered as a starting point — greys, hues, then muted tones. */
export const QUICK_COLORS: readonly string[] = [
	"#000000",
	"#ffffff",
	"#808080",
	"#dcdcdc",
	"#ff0000",
	"#ff8000",
	"#ffff00",
	"#00ff00",
	"#00ffff",
	"#0000ff",
	"#8000ff",
	"#ff00ff",
	"#ff4081",
	"#3f51b5",
	"#009688",
	"#795548",
];
