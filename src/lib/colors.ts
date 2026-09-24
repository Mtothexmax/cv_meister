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
/**
 * Extracts the dominant logo color, mirroring `get_main_colors.ps1`:
 * - skips transparent pixels (alpha < 200)
 * - skips near-white pixels (less than 20% away from pure white in RGB space,
 *   so white backgrounds never become the accent color)
 * - histogram over 4-bit quantized colors (robust for photos/JPEGs, where
 *   exact-RGB counting would scatter), most frequent bin wins
 * - returns "#rrggbb" or null when nothing usable is found (pure-white logo)
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

		let best = 0;
		let bestN = -1;
		for (const [key, n] of counts) {
			if (n > bestN) {
				bestN = n;
				best = key;
			}
		}
		const hex = (v: number) => v.toString(16).padStart(2, "0");
		return `#${hex(((best >> 8) & 15) * 16 + 8)}${hex(((best >> 4) & 15) * 16 + 8)}${hex((best & 15) * 16 + 8)}`;
	} catch {
		return null;
	}
}
