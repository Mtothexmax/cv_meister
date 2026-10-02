import { svgToPng } from "./images.js";

/**
 * Loads a bitmap, rasterizing SVGs first (createImageBitmap rejects SVGs
 * without intrinsic dimensions, and canvas needs real pixels anyway).
 */
async function loadBitmap(file: File): Promise<ImageBitmap> {
	try {
		return await createImageBitmap(file);
	} catch {
		const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
		if (!isSvg) throw new Error("Bild konnte nicht gelesen werden");
		return await createImageBitmap(await svgToPng(file));
	}
}

/** One quantized colour bin: the bin's centre colour and how many pixels it holds. */
export interface ColorBin {
	r: number;
	g: number;
	b: number;
	count: number;
}

/** HSV saturation (0…1) of an 8-bit RGB triple. Black has no hue → 0. */
function saturation(r: number, g: number, b: number): number {
	const max = Math.max(r, g, b);
	if (max === 0) return 0;
	return (max - Math.min(r, g, b)) / max;
}

/**
 * Saturation floors, tried in order; the first floor that any bin clears wins.
 *
 * This is what makes the extraction prefer saturated colours: a clearly
 * coloured pixel beats a grey one *however frequent the grey is*, which is the
 * common logo case (lots of black/grey text, a small brand colour). A purely
 * greyscale logo clears no floor above 0 and therefore falls through to the
 * plain "most frequent" rule — exactly the behaviour before this preference
 * existed, so nothing regresses for monochrome logos.
 */
const SATURATION_FLOORS = [0.5, 0.25, 0];

/**
 * A bin must hold at least this share of the biggest bin to be treated as a
 * real colour rather than an anti-aliasing artefact.
 *
 * Without it, a handful of saturated edge pixels between the brand colour and
 * white could win the top tier against the actual brand colour. The biggest bin
 * always clears the gate (its share is 1), so there is always a candidate.
 */
const MIN_SHARE = 0.005;

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
	const hex = (v: number) =>
		Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
	return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Chooses the accent colour from a quantized histogram, preferring saturation.
 *
 * Pure on purpose: the pixel reading needs a canvas, but the *decision* does
 * not, so this half is unit-tested in plain Node (`.workbuddy-ai/verify-accent.mjs`).
 *
 * Order of business:
 * 1. Drop artefact bins (`MIN_SHARE`).
 * 2. Walk `SATURATION_FLOORS` from the most demanding down; the first floor with
 *    any candidate wins the round.
 * 3. Within that round the most frequent colour wins, ties going to the more
 *    saturated one.
 */
export function pickAccentColor(bins: ColorBin[]): string | null {
	if (bins.length === 0) return null;

	let maxCount = 0;
	for (const bin of bins) if (bin.count > maxCount) maxCount = bin.count;
	const minCount = maxCount * MIN_SHARE;

	for (const floor of SATURATION_FLOORS) {
		let best: ColorBin | null = null;
		let bestSat = -1;
		for (const bin of bins) {
			if (bin.count < minCount) continue;
			const sat = saturation(bin.r, bin.g, bin.b);
			if (sat < floor) continue;
			if (best === null || bin.count > best.count || (bin.count === best.count && sat > bestSat)) {
				best = bin;
				bestSat = sat;
			}
		}
		if (best) return toHex(best);
	}
	return null;
}

/**
 * Extracts the dominant logo colour, preferring saturated ones.
 *
 * The pixel pass mirrors `get_main_colors.ps1`:
 * - skips transparent pixels (alpha < 200)
 * - skips near-white pixels (less than 20% away from pure white in RGB space,
 *   so white backgrounds never become the accent colour)
 * - histogram over 4-bit quantized colours (robust for photos/JPEGs, where
 *   exact-RGB counting would scatter)
 *
 * Which bin wins is then decided by `pickAccentColor()`.
 *
 * Returns "#rrggbb" or null when nothing usable is found (pure-white logo).
 */
export async function extractAccentColor(file: File): Promise<string | null> {
	try {
		const bmp = await loadBitmap(file);
		const maxSide = 120;
		const scale = Math.min(1, maxSide / Math.max(1, Math.max(bmp.width, bmp.height)));
		const w = Math.max(1, Math.round(bmp.width * scale));
		const h = Math.max(1, Math.round(bmp.height * scale));
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) {
			bmp.close();
			return null;
		}
		ctx.drawImage(bmp, 0, 0, w, h);
		bmp.close();
		const px = ctx.getImageData(0, 0, w, h).data;

		const maxDistSq = 3.0 * 255.0 * 255.0;
		const minDistSq = maxDistSq * 0.2 * 0.2;
		const counts = new Map<number, number>();
		for (let i = 0; i < px.length; i += 4) {
			if (px[i + 3] < 200) continue;
			const r = px[i];
			const g = px[i + 1];
			const b = px[i + 2];
			const dr = 255 - r;
			const dg = 255 - g;
			const db = 255 - b;
			if (dr * dr + dg * dg + db * db < minDistSq) continue;
			const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		if (counts.size === 0) return null;

		// Bin centre, not the raw 4-bit bucket: +8 lands in the middle of the
		// 16-value range each nibble stands for.
		const bins: ColorBin[] = [];
		for (const [key, count] of counts) {
			bins.push({
				r: ((key >> 8) & 15) * 16 + 8,
				g: ((key >> 4) & 15) * 16 + 8,
				b: (key & 15) * 16 + 8,
				count,
			});
		}
		return pickAccentColor(bins);
	} catch {
		return null;
	}
}
