/**
 * SVG uploads are rasterized to PNG in the browser (longest side 600 px) so
 * downstream code (Typst images, color extraction, IndexedDB) only ever sees
 * PNG/JPEG bitmaps. Scripts in SVGs never run (loaded via `<img>`), external
 * subresources/fonts fall back to system rendering during rasterization.
 */

/** Target bitmap size for an SVG: longest side capped at `maxSide`. */
export function svgTargetSize(
	svgText: string,
	maxSide = 600,
): { width: number; height: number } {
	const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0] ?? "";
	const attr = (name: string): number | null => {
		const m = new RegExp(`${name}\\s*=\\s*["']([0-9.]+)(px|pt|%)?["']`, "i").exec(tag);
		if (!m || m[2] === "%") return null;
		const v = Number(m[1]);
		return Number.isFinite(v) && v > 0 ? v : null;
	};
	let w = attr("width");
	let h = attr("height");
	if (w === null || h === null) {
		// Missing or unusable dimensions (e.g. percent units): use the viewBox.
		const vb = /viewBox\s*=\s*["']([0-9.\-+\s,eE]+)["']/i.exec(tag);
		if (vb) {
			const nums = vb[1].trim().split(/[\s,]+/).map(Number);
			if (nums.length === 4 && nums[2] > 0 && nums[3] > 0) {
				w = nums[2];
				h = nums[3];
			}
		}
	}
	if (w === null || h === null || w <= 0 || h <= 0) {
		w = maxSide;
		h = maxSide;
	}
	const scale = Math.min(1, maxSide / Math.max(w, h));
	return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Sets explicit width/height (removing existing ones first — duplicate
 * attributes are invalid XML and make `<img>` refuse the file entirely). */
function withDimensions(svgText: string, width: number, height: number): string {
	return svgText.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
		const stripped = String(attrs).replace(
			/\s+(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
			"",
		);
		return `<svg${stripped} width="${width}" height="${height}">`;
	});
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("SVG konnte nicht geladen werden"));
		img.src = url;
	});
}

/** Rasterizes an SVG file to PNG (longest side `maxSide` px). */
export async function svgToPng(file: File, maxSide = 600): Promise<File> {
	const text = await file.text();
	const { width, height } = svgTargetSize(text, maxSide);
	const url = URL.createObjectURL(new Blob([withDimensions(text, width, height)], { type: "image/svg+xml" }));
	try {
		const img = await loadImage(url);
		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth || width;
		canvas.height = img.naturalHeight || height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas nicht verfügbar");
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
		if (!blob) throw new Error("PNG-Export fehlgeschlagen");
		return new File([blob], file.name.replace(/\.svg$/i, "") + ".png", { type: "image/png" });
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** File extension matching the real content (Typst picks the decoder by extension). */
export function logoExt(name: string, type: string): string {
	const n = name.toLowerCase();
	if (n.endsWith(".svg") || type === "image/svg+xml") return ".svg";
	if (n.endsWith(".jpg") || n.endsWith(".jpeg") || type === "image/jpeg") return ".jpg";
	if (n.endsWith(".gif") || type === "image/gif") return ".gif";
	if (n.endsWith(".webp") || type === "image/webp") return ".webp";
	return ".png";
}

/**
 * First column containing any non-transparent pixel (pure, testable).
 * Returns `width` when the image is fully transparent.
 */
export function firstOpaqueColumn(
	px: Uint8ClampedArray,
	width: number,
	height: number,
): number {
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			if (px[(y * width + x) * 4 + 3] !== 0) return x;
		}
	}
	return width;
}

/** Parses "#rrggbb" into channels, null when invalid. */
export function parseHexColor(hex: string): [number, number, number] | null {
	const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
	if (!m) return null;
	return [
		parseInt(m[1].slice(0, 2), 16),
		parseInt(m[1].slice(2, 4), 16),
		parseInt(m[1].slice(4, 6), 16),
	];
}

function smoothstep(e0: number, e1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

/**
 * Duotone kernel (pure, testable): grayscale via luminosity, then colorize.
 * Strokes become fully opaque accent (exact color, no optical lightening on
 * white paper); only anti-aliased edges stay semi-transparent. White paper
 * becomes fully transparent, original alpha is preserved multiplicatively.
 */
export function duotoneKernel(px: Uint8ClampedArray, r: number, g: number, b: number): void {
	for (let i = 0; i < px.length; i += 4) {
		const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
		const ink = Math.max(0, 1 - lum);
		const alpha = smoothstep(0.12, 0.45, ink) * (px[i + 3] / 255);
		px[i] = r;
		px[i + 1] = g;
		px[i + 2] = b;
		px[i + 3] = Math.round(alpha * 255);
	}
}

/**
 * Tints a signature scan in the exact accent color:
 * 1. fully transparent columns on the left are cropped (left-aligned)
 * 2. grayscale via luminosity, strokes become opaque accent, paper transparent
 */
export async function tintSignatureImage(file: File, hex: string): Promise<Blob> {
	const rgb = parseHexColor(hex);
	if (!rgb) throw new Error("Ungültige Akzentfarbe");
	const bmp = await createImageBitmap(file);
	const iw = Math.max(1, bmp.width);
	const ih = Math.max(1, bmp.height);

	const probe = document.createElement("canvas");
	probe.width = iw;
	probe.height = ih;
	const pctx = probe.getContext("2d", { willReadFrequently: true });
	if (!pctx) {
		bmp.close();
		throw new Error("Canvas nicht verfügbar");
	}
	pctx.drawImage(bmp, 0, 0);
	bmp.close();

	let target: HTMLCanvasElement = probe;
	let img = pctx.getImageData(0, 0, iw, ih);
	const cut = firstOpaqueColumn(img.data, iw, ih);
	if (cut > 0 && cut < iw) {
		const cropped = document.createElement("canvas");
		cropped.width = iw - cut;
		cropped.height = ih;
		const cctx = cropped.getContext("2d", { willReadFrequently: true });
		if (!cctx) throw new Error("Canvas nicht verfügbar");
		cctx.drawImage(probe, cut, 0, iw - cut, ih, 0, 0, iw - cut, ih);
		target = cropped;
		img = cctx.getImageData(0, 0, iw - cut, ih);
	}

	duotoneKernel(img.data, rgb[0], rgb[1], rgb[2]);
	const tctx = target.getContext("2d");
	if (!tctx) throw new Error("Canvas nicht verfügbar");
	tctx.putImageData(img, 0, 0);

	const blob = await new Promise<Blob | null>((res) => target.toBlob(res, "image/png"));
	if (!blob) throw new Error("PNG-Export fehlgeschlagen");
	return blob;
}

/**
 * True when every pixel with any opacity is (near) white — a logo that would be
 * invisible on white paper.
 *
 * `tolerance` is the largest per-channel distance from 255 that still counts as
 * white, so the anti-aliased edge of a white shape (white with partial alpha)
 * passes as well. A fully transparent image is **not** white: there is nothing
 * to show, and blackening it would produce nothing either.
 */
export function isWhiteOnly(px: Uint8ClampedArray, tolerance = 24): boolean {
	let opaque = false;
	for (let i = 0; i < px.length; i += 4) {
		if (px[i + 3] === 0) continue;
		opaque = true;
		if (255 - px[i] > tolerance || 255 - px[i + 1] > tolerance || 255 - px[i + 2] > tolerance) {
			return false;
		}
	}
	return opaque;
}

/** Inverts the RGB channels, keeping alpha: white ink becomes black ink with the
 *  same anti-aliasing. Only ever applied to an image that is white throughout. */
export function invertKernel(px: Uint8ClampedArray): void {
	for (let i = 0; i < px.length; i += 4) {
		px[i] = 255 - px[i];
		px[i + 1] = 255 - px[i + 1];
		px[i + 2] = 255 - px[i + 2];
	}
}

/** A white paint value in an SVG: `#fff`, `#ffffff`, the keyword, `rgb(255,255,255)`. */
const SVG_WHITE = "(?:#fff(?:fff)?|white|rgb\\(\\s*255\\s*,\\s*255\\s*,\\s*255\\s*\\))";
/** Attribute names that carry paint — deliberately *without* `stroke-width`,
 *  `fill-opacity` and friends (the regex requires `=`/`:` right after the name). */
const SVG_PAINT = "(?:fill|stroke|stop-color|flood-color|lighting-color|color)";

/**
 * Rewrites white paint in an SVG source to black, keeping the vectors sharp.
 *
 * Only real paint positions are touched: `fill="#fff"`, `style="fill: white"`,
 * and `fill: #ffffff;` inside a `<style>` block. A bare `white` word is never
 * replaced on its own — that would also hit `id="white-part"` or a `class="white"`
 * rule and break the file. The flip side of being this careful: a white gradient
 * stop reached through `fill="url(#g)"` survives the rewrite, so
 * `blackenWhiteLogo()` verifies the result instead of trusting it.
 */
export function blackenSvgSource(svg: string): string {
	const attr = new RegExp(`(${SVG_PAINT}\\s*=\\s*["'])${SVG_WHITE}(["'])`, "gi");
	const decl = new RegExp(`(${SVG_PAINT}\\s*:\\s*)${SVG_WHITE}(\\s*[;}"'])`, "gi");
	return svg.replace(attr, "$1#000000$2").replace(decl, "$1#000000$2");
}

/** Draws any image file (SVG included) into a canvas and returns its pixels. */
async function pixelsOf(file: File, maxSide = 600): Promise<ImageData> {
	// createImageBitmap rejects an SVG without intrinsic dimensions, so the
	// rasterizer the rest of the app uses goes in front.
	const bitmap = await createImageBitmap(file).catch(async () =>
		createImageBitmap(await svgToPng(file, maxSide)),
	);
	const scale = Math.min(1, maxSide / Math.max(1, bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		bitmap.close();
		throw new Error("Canvas nicht verfügbar");
	}
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Turns an all-white logo black so it stays visible on white paper. Returns the
 * recoloured file, or `null` when the image carries any other colour — an
 * ordinary logo must not be touched.
 *
 * An SVG keeps its vectors: the white paint is rewritten in the source and the
 * result is *verified* by rasterising it, because a gradient or an exotic colour
 * form survives the rewrite and would still render white. Everything else — and
 * that fallback — is rasterised and inverted.
 */
export async function blackenWhiteLogo(file: File): Promise<File | null> {
	const original = await pixelsOf(file);
	if (!isWhiteOnly(original.data)) return null;

	if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
		const source = await file.text();
		const blackened = blackenSvgSource(source);
		if (blackened !== source) {
			const candidate = new File([blackened], file.name, { type: "image/svg+xml" });
			if (!isWhiteOnly((await pixelsOf(candidate)).data)) return candidate;
		}
	}

	const canvas = document.createElement("canvas");
	canvas.width = original.width;
	canvas.height = original.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas nicht verfügbar");
	invertKernel(original.data);
	ctx.putImageData(original, 0, 0);
	const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
	if (!blob) throw new Error("PNG-Export fehlgeschlagen");
	// The extension picks Typst's decoder (`logoExt`), so the new format needs the
	// new name: a PNG body behind a `.svg` name would go to the SVG parser.
	return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
}
