// make-icons.mjs — rasterises the app's own favicon into the Android launcher
// icon set under src-tauri/android/res/.
//
// The favicon (src/lib/assets/favicon.svg) is the single source of truth: this
// script does not redraw the logo, it renders that exact SVG through Chrome and
// derives every density from it. Change the favicon, re-run this, and the app
// icon follows.
//
// Chrome is launched by make-icons.sh — Node cannot spawn a process here
// (spawnSync fails with EBUSY), so this file only *drives* a browser that is
// already listening. It is invoked as:
//
//   src-tauri/android/make-icons.sh            # write res/
//   PREVIEW=1 src-tauri/android/make-icons.sh  # plus a masked preview sheet
//
// Why the adaptive foreground is measured rather than calculated:
//   * An adaptive icon's two layers are 108x108 dp. The launcher shows the
//     central 72x72 dp of that canvas and masks it to a shape; the 66 dp circle
//     inside it is the safe zone. So "the same look as the favicon" means the
//     letters must cover the same fraction of that 72 dp as they cover of the
//     favicon's tile — not the same fraction of the 108 dp canvas.
//   * The fraction and the glyph metrics are read from real pixels
//     (`__inkBox`), never from `getBBox()`: Chrome's `getBBox()` on a <text>
//     returns the *layout* box (advance widths, full ascent+descent), which is
//     ~1.5x the ink box — sizing from it makes the letters visibly too small.
//     The first version of this file had exactly that bug.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9241";
const ROOT = resolve(process.env.ROOT ?? join(import.meta.dirname, "..", ".."));
const FAVICON = join(ROOT, "src/lib/assets/favicon.svg");
const RES = join(ROOT, "src-tauri/android/res");
const PREVIEW = process.env.PREVIEW ? join(ROOT, ".workbuddy-ai/tmp/icon-preview.png") : null;

// Android's density buckets. `legacy` is the raster size the launcher shows on
// API < 26 (48 dp at mdpi); `fg` is the adaptive foreground layer, 108 dp at
// every density.
const DENSITIES = [
	{ name: "mdpi", legacy: 48, fg: 108 },
	{ name: "hdpi", legacy: 72, fg: 162 },
	{ name: "xhdpi", legacy: 96, fg: 216 },
	{ name: "xxhdpi", legacy: 144, fg: 324 },
	{ name: "xxxhdpi", legacy: 192, fg: 432 },
];

// The launcher's visible tile as a fraction of the 108 dp canvas.
const VISIBLE_TILE = 72 / 108;
// Supersampling factor; the result is halved down in steps so a 432 px
// foreground is not produced by one 8x squeeze (that aliases).
const SS = 8;
// Reference render sizes for the pixel measurements.
const REF_TILE = 256;
const REF_GLYPH = 256;
const REF_FONT = 100;

const log = (...a) => console.log(...a);

// --- tiny CDP client (Node 22 has a global WebSocket) -----------------------

// Chrome does not accept a WebSocket on the root path: the socket URL has to be
// read from /json/list first. Only a `type: "page"` target can be driven.
async function resolveTarget(base) {
	const list = await (await fetch(`${base}/json/list`)).json();
	const page = list.find((t) => t.type === "page");
	if (!page) throw new Error(`Kein page-Target an ${base}: ${list.map((t) => t.type).join(", ")}`);
	return page.webSocketDebuggerUrl;
}

function connect(url) {
	return new Promise((res, rej) => {
		const ws = new WebSocket(url);
		const pending = new Map();
		let id = 0;
		ws.addEventListener("open", () =>
			res({
				send(method, params = {}, timeoutMs = 60000) {
					const msgId = ++id;
					return new Promise((ok, fail) => {
						// A request that is never answered must fail loudly — otherwise
						// the run just stalls until the caller is killed.
						const timer = setTimeout(() => {
							pending.delete(msgId);
							fail(new Error(`CDP-Timeout nach ${timeoutMs} ms: ${method}`));
						}, timeoutMs);
						pending.set(msgId, {
							ok: (r) => { clearTimeout(timer); ok(r); },
							fail: (e) => { clearTimeout(timer); fail(e); },
						});
						ws.send(JSON.stringify({ id: msgId, method, params }));
					});
				},
				close: () => ws.close(),
				onMessage(fn) {
					ws.addEventListener("message", (ev) => {
						const msg = JSON.parse(ev.data);
						if (msg.id && pending.has(msg.id)) {
							const { ok, fail } = pending.get(msg.id);
							pending.delete(msg.id);
							msg.error ? fail(new Error(`${msg.error.message} (${method})`)) : ok(msg.result);
						} else fn(msg);
					});
				},
			}),
		);
		ws.addEventListener("error", () => rej(new Error(`CDP nicht erreichbar: ${url}`)));
	});
}

// --- the page-side rasteriser ----------------------------------------------

// Injected once. Everything it needs is passed in — this function is stringified
// into the page, where module-level bindings do not exist.
function pageScript(SS) {
	window.__loadImage = (src) =>
		new Promise((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
			i.src = src;
		});

	const toUrl = (src) =>
		src.startsWith("data:") ? src : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);

	// Draws an SVG (or a PNG data URL) at `size` px and returns a PNG data URL.
	// `mask` is "circle" or "squircle" (undefined = the artwork's own shape).
	window.__render = (svg, size, mask) =>
		new Promise((resolve, reject) => {
			const img = new Image();
			img.onerror = () => reject(new Error("SVG konnte nicht geladen werden"));
			img.onload = () => {
				let src = document.createElement("canvas");
				src.width = size * SS;
				src.height = size * SS;
				const sx = src.getContext("2d");
				sx.imageSmoothingEnabled = true;
				sx.imageSmoothingQuality = "high";
				if (mask === "circle" || mask === "squircle") {
					sx.beginPath();
					if (mask === "circle") sx.arc(src.width / 2, src.height / 2, src.width / 2, 0, Math.PI * 2);
					else sx.roundRect(0, 0, src.width, src.height, src.width * 0.25);
					sx.clip();
				}
				sx.drawImage(img, 0, 0, src.width, src.height);

				// Halve down in steps, never in one go.
				while (src.width / 2 > size) {
					const half = document.createElement("canvas");
					half.width = src.width / 2;
					half.height = src.height / 2;
					const hx = half.getContext("2d");
					hx.imageSmoothingEnabled = true;
					hx.imageSmoothingQuality = "high";
					hx.drawImage(src, 0, 0, half.width, half.height);
					src = half;
				}
				const out = document.createElement("canvas");
				out.width = size;
				out.height = size;
				const ox = out.getContext("2d");
				ox.imageSmoothingEnabled = true;
				ox.imageSmoothingQuality = "high";
				ox.drawImage(src, 0, 0, size, size);
				resolve(out.toDataURL("image/png"));
			};
			img.src = toUrl(svg);
		});

	// The ink box of an image, read from real pixels. `mode` is "alpha" (anything
	// not transparent — a layer without background) or "white" (near-white pixels
	// only — the letters on a coloured tile).
	window.__inkBox = async (src, size, mode) => {
		const img = await window.__loadImage(toUrl(src));
		const c = document.createElement("canvas");
		c.width = size;
		c.height = size;
		const x = c.getContext("2d");
		x.drawImage(img, 0, 0, size, size);
		const d = x.getImageData(0, 0, size, size).data;
		let minx = size, miny = size, maxx = -1, maxy = -1;
		for (let py = 0; py < size; py++) {
			for (let px = 0; px < size; px++) {
				const o = (py * size + px) * 4;
				const hit =
					mode === "white"
						? d[o] > 200 && d[o + 1] > 200 && d[o + 2] > 200 && d[o + 3] > 128
						: d[o + 3] > 40;
				if (!hit) continue;
				if (px < minx) minx = px;
				if (px > maxx) maxx = px;
				if (py < miny) miny = py;
				if (py > maxy) maxy = py;
			}
		}
		if (maxx < 0) throw new Error("Keine deckenden Pixel gefunden");
		return JSON.stringify({ x: minx, y: miny, width: maxx - minx + 1, height: maxy - miny + 1 });
	};

	// Emulates what a launcher does with an adaptive icon: both layers are 108 dp,
	// the launcher shows the central 72 dp of that canvas and masks it to a shape.
	// Rendering the raw foreground layer therefore proves nothing — it has to be
	// cropped and masked to judge the result.
	window.__launcher = async (svg, F, mask) => {
		const img = await window.__loadImage(await window.__render(svg, F, null));
		const vis = Math.round(F * (72 / 108));
		const off = (F - vis) / 2;
		const out = document.createElement("canvas");
		out.width = vis;
		out.height = vis;
		const x = out.getContext("2d");
		x.imageSmoothingEnabled = true;
		x.imageSmoothingQuality = "high";
		x.beginPath();
		if (mask === "circle") x.arc(vis / 2, vis / 2, vis / 2, 0, Math.PI * 2);
		else x.roundRect(0, 0, vis, vis, vis * 0.25);
		x.clip();
		x.drawImage(img, off, off, vis, vis, 0, 0, vis, vis);
		return out.toDataURL("image/png");
	};
}

// --- helpers ---------------------------------------------------------------

const toBuffer = (dataUrl) => Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

async function writePng(path, dataUrl) {
	await mkdir(join(path, ".."), { recursive: true });
	const buf = toBuffer(dataUrl);
	await writeFile(path, buf);
	return buf.length;
}

// --- main ------------------------------------------------------------------

const favicon = (await readFile(FAVICON, "utf8")).trim();
if (!/<svg[\s\S]*<\/svg>/.test(favicon)) throw new Error(`${FAVICON} enthält kein <svg>`);

const rect = favicon.match(/<rect\b[^>]*\/>/);
const text = favicon.match(/<text\b[\s\S]*?<\/text>/);
if (!rect) throw new Error("favicon.svg: kein <rect> gefunden (die Hintergrundform)");
if (!text) throw new Error("favicon.svg: kein <text> gefunden (die Buchstaben)");
const fill = /fill="([^"]+)"/.exec(rect[0])?.[1];
if (!fill) throw new Error("favicon.svg: das <rect> hat kein fill");
const glyphs = /<text[^>]*>([\s\S]*?)<\/text>/.exec(favicon)[1].trim();
const fontFamily = /font-family="([^"]+)"/.exec(text[0])?.[1] ?? "Arial, Helvetica, sans-serif";
const fontWeight = /font-weight="([^"]+)"/.exec(text[0])?.[1] ?? "bold";
const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(favicon);
const vb = viewBox ? Number(viewBox[1]) : 64;

log(`favicon:   ${glyphs} auf ${fill}, viewBox ${vb}`);
log(`Schrift:   ${fontFamily} / ${fontWeight}`);

// Round variant: the same letters on a full circle. Clipping the rounded rect
// would leave transparent notches on the diagonals (its corner arc is at r≈11.5
// while the circle runs to r=32), so the background shape is swapped instead.
const roundSvg =
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}">` +
	`<circle cx="${vb / 2}" cy="${vb / 2}" r="${vb / 2}" fill="${fill}"/>` +
	`${text[0]}</svg>`;

const { send, close, onMessage } = await connect(await resolveTarget(CDP_URL));
onMessage(() => {});
await send("Runtime.enable");
await send("Runtime.evaluate", { expression: `(${pageScript.toString()})(${SS})`, returnByValue: true });
const injected = await send("Runtime.evaluate", {
	expression: "typeof window.__render === 'function' && typeof window.__inkBox === 'function'",
	returnByValue: true,
});
if (!injected.result.value) throw new Error("Der Renderer wurde nicht in die Seite injiziert");
log(`CDP:       ${CDP_URL} verbunden, Renderer bereit`);

const evalIn = async (expression) => {
	const { result, exceptionDetails } = await send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
	return result.value;
};

const render = (svg, size, mask) =>
	evalIn(`window.__render(${JSON.stringify(svg)}, ${size}, ${JSON.stringify(mask ?? null)})`);
const inkBox = (src, size, mode) =>
	evalIn(`window.__inkBox(${JSON.stringify(src)}, ${size}, ${JSON.stringify(mode)}).then(JSON.parse)`);

// How much of the favicon's tile do the letters actually cover?
const tileInk = await inkBox(favicon, REF_TILE, "white");
const inkOfTile = tileInk.width / REF_TILE;
// The same look on the adaptive layer = the same fraction of the visible 72 dp.
const inkOfCanvas = inkOfTile * VISIBLE_TILE;
log(`Buchstaben: ${(inkOfTile * 100).toFixed(1)}% der Kachel -> ${(inkOfCanvas * 100).toFixed(1)}% der 108dp-Leinwand`);

// Ink width of the glyphs per 1 unit of font size, measured on transparent.
const refSvg =
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${REF_GLYPH} ${REF_GLYPH}">` +
	`<text x="${REF_GLYPH / 2}" y="${REF_GLYPH * 0.75}" text-anchor="middle" ` +
	`font-family="${fontFamily}" font-weight="${fontWeight}" font-size="${REF_FONT}" fill="#ffffff">${glyphs}</text></svg>`;
const glyphInk = await inkBox(refSvg, REF_GLYPH, "alpha");
const inkPerFontUnit = glyphInk.width / REF_FONT;
log(`Glyphen:   Tinte ${glyphInk.width}x${glyphInk.height}px bei font-size ${REF_FONT}`);

// The adaptive foreground: white letters, centred, sized so their ink covers
// `inkOfCanvas` of the canvas. `withBackground` is only for the preview.
const fgSvg = (F, withBackground = false) => {
	const fontSize = (inkOfCanvas * F) / inkPerFontUnit;
	const capHeight = (glyphInk.height / REF_FONT) * fontSize;
	const baseline = F / 2 + capHeight / 2;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F} ${F}">` +
		(withBackground ? `<rect width="${F}" height="${F}" fill="${fill}"/>` : "") +
		`<text x="${F / 2}" y="${baseline.toFixed(2)}" text-anchor="middle" ` +
		`font-family="${fontFamily}" font-weight="${fontWeight}" font-size="${fontSize.toFixed(2)}" ` +
		`fill="#ffffff">${glyphs}</text></svg>`
	);
};

let count = 0;
for (const d of DENSITIES) {
	const dir = join(RES, `mipmap-${d.name}`);
	await writePng(join(dir, "ic_launcher.png"), await render(favicon, d.legacy));
	await writePng(join(dir, "ic_launcher_round.png"), await render(roundSvg, d.legacy));
	await writePng(join(dir, "ic_launcher_foreground.png"), await render(fgSvg(d.fg), d.fg));
	count += 3;
	log(`mipmap-${d.name.padEnd(8)} legacy ${d.legacy}px · foreground ${d.fg}px`);
}

// Self-check: the foreground really has to carry the letters at the intended
// size. Read it back out of the file that was just written — a wrong fraction
// here is exactly the bug that made the letters look too small, and nothing
// else in the pipeline would notice.
const biggest = DENSITIES[DENSITIES.length - 1];
const fgPath = join(RES, `mipmap-${biggest.name}/ic_launcher_foreground.png`);
const onDisk = "data:image/png;base64," + (await readFile(fgPath)).toString("base64");
const checkInk = await inkBox(onDisk, biggest.fg, "alpha");
const actual = checkInk.width / biggest.fg;
const expected = inkOfCanvas;
if (Math.abs(actual - expected) > 0.01) {
	throw new Error(
		`Foreground-Buchstaben sind ${(actual * 100).toFixed(1)}% der Leinwand, erwartet ${(expected * 100).toFixed(1)}%`,
	);
}
log(`Prüfung:   Buchstaben ${(actual * 100).toFixed(1)}% der Leinwand (Soll ${(expected * 100).toFixed(1)}%)`);

if (PREVIEW) {
	const panel = 192;
	const F = Math.round(panel / VISIBLE_TILE); // canvas whose 72 dp centre is `panel` px
	const composed = fgSvg(F, true);
	const cells = [
		["legacy · Quadrat", await render(favicon, panel), "#e2e8f0"],
		["legacy · rund", await render(roundSvg, panel), "#e2e8f0"],
		["adaptiv · Kreis", await evalIn(`window.__launcher(${JSON.stringify(composed)}, ${F}, "circle")`), "#e2e8f0"],
		["adaptiv · Squircle", await evalIn(`window.__launcher(${JSON.stringify(composed)}, ${F}, "squircle")`), "#e2e8f0"],
		["adaptiv · dunkel", await evalIn(`window.__launcher(${JSON.stringify(composed)}, ${F}, "squircle")`), "#1e293b"],
	];
	const sheet = await evalIn(`(async () => {
		const tiles = ${JSON.stringify(cells.map(([label, url, bg]) => ({ label, url, bg })))};
		const pad = 16, head = 26, panel = ${panel};
		const w = tiles.length * (panel + pad) + pad;
		const h = head + panel + pad;
		const c = document.createElement("canvas");
		c.width = w; c.height = h;
		const x = c.getContext("2d");
		x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h);
		for (let i = 0; i < tiles.length; i++) {
			const t = tiles[i];
			const px = pad + i * (panel + pad), py = head;
			x.fillStyle = t.bg; x.fillRect(px, py, panel, panel);
			x.drawImage(await window.__loadImage(t.url), px, py, panel, panel);
			x.fillStyle = "#334155";
			x.font = "13px Arial, sans-serif";
			x.textAlign = "center";
			x.fillText(t.label, px + panel / 2, 17);
		}
		return c.toDataURL("image/png");
	})()`);
	await mkdir(join(PREVIEW, ".."), { recursive: true });
	await writeFile(PREVIEW, toBuffer(sheet));
	log(`Vorschau:  ${PREVIEW}`);
}

close();
log(`\n${count} PNGs in ${RES}`);
process.exit(0);
