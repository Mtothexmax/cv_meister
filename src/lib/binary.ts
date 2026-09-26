/**
 * Blob/File ⇄ data:-URL conversion.
 *
 * Used by the JSON exports: the "arbeitsbereich" export carries every uploaded
 * image and PDF as a data-URL, because those bytes cannot be regenerated from
 * the state (unlike the Typst-rendered PDFs, which are rebuilt on demand).
 *
 * The per-application export deliberately does NOT use this — it references
 * images by name only, so the file stays editable by hand.
 */

const MIME_EXT: [string, string][] = [
	["image/png", "png"],
	["image/jpeg", "jpg"],
	["image/gif", "gif"],
	["image/webp", "webp"],
	["image/svg+xml", "svg"],
	// Uploaded extra PDFs (Statische Daten → PDF): used only when the stored name
	// carries no extension, so a restored File is still recognisable as a PDF.
	["application/pdf", "pdf"],
];

function fileToDataUrl(file: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("Lesen fehlgeschlagen"));
		reader.readAsDataURL(file);
	});
}

/** Blob → data:-URL. */
export function blobToDataUrl(file: Blob): Promise<string> {
	return fileToDataUrl(file);
}

/** Restores a File from a data:-URL (null on any problem). */
export function dataUrlToFile(dataUrl: unknown, name?: string | null): File | null {
	try {
		if (typeof dataUrl !== "string") return null;
		const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(dataUrl);
		if (!m) return null;
		const mime = m[1] || "application/octet-stream";
		const bin = atob(m[2]);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		let filename = typeof name === "string" && name ? name : "datei";
		if (!/\.[a-z0-9]+$/i.test(filename)) {
			const ext = MIME_EXT.find(([t]) => t === mime)?.[1] ?? "bin";
			filename = `${filename}.${ext}`;
		}
		return new File([bytes], filename, { type: mime });
	} catch {
		return null;
	}
}

export interface ImageKind {
	mime: string;
	ext: string;
}

/** How many leading bytes are inspected when sniffing a text-based image. */
const TEXT_SNIFF_BYTES = 2048;

function ascii(bytes: Uint8Array, from: number, to: number): string {
	return String.fromCharCode(...bytes.subarray(from, to));
}

/**
 * Recognises an image from its **bytes**, ignoring the Content-Type header
 * (raw.githubusercontent serves `.svg` as `text/plain`, many CDNs serve
 * `application/octet-stream` — the header is not trustworthy).
 *
 * Returns `null` for anything that is not an image. That rejection matters more
 * than it looks: Typst sniffs an image by its first byte, so an HTML page
 * (which starts with `<`) is handed to the **SVG** parser and fails with
 * `failed to parse SVG (found closing tag 'head' instead of 'link')` — a message
 * that says nothing about the actual mistake, which is a page URL instead of a
 * file URL. Catching it here keeps that failure out of the renderer.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return { mime: "image/png", ext: "png" };
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return { mime: "image/jpeg", ext: "jpg" };
	}
	if (bytes.length >= 6) {
		const head = ascii(bytes, 0, 6);
		if (head === "GIF87a" || head === "GIF89a") return { mime: "image/gif", ext: "gif" };
	}
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
		return { mime: "image/webp", ext: "webp" };
	}
	if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
		return { mime: "image/bmp", ext: "bmp" };
	}
	if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
		return { mime: "image/x-icon", ext: "ico" };
	}
	if (
		bytes.length >= 4 &&
		((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) ||
			(bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00))
	) {
		return { mime: "image/tiff", ext: "tiff" };
	}
	// Text-based: only SVG qualifies, and HTML must be excluded explicitly —
	// it also starts with `<`, which is exactly how it slips into Typst's SVG
	// parser.
	const text = new TextDecoder("utf-8", { fatal: false })
		.decode(bytes.subarray(0, TEXT_SNIFF_BYTES))
		.replace(/^\uFEFF/, "")
		.trimStart();
	if (!text.startsWith("<")) return null;
	if (/^<(?:!doctype\s+html|html|head|body|meta|link|script|style|div|p|span)\b/i.test(text)) return null;
	return /<svg[\s>]/i.test(text) ? { mime: "image/svg+xml", ext: "svg" } : null;
}

/**
 * Derives a file name for a fetched image: the URL's last path segment, with the
 * extension forced to the sniffed type (so a `.svg` URL that actually serves a
 * PNG is not stored as `.svg`).
 */
export function imageFilenameFromUrl(url: string, ext: string): string {
	const base = (url.split(/[?#]/)[0].split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "");
	return `${base || "logo"}.${ext}`;
}
