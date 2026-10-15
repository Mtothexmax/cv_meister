import { base } from "$app/paths";
import { createTypstCompiler, type TypstCompiler, type TypstCompilerOptions } from "typst-wasm";
import { createWebWorker } from "typst-wasm/worker/browser";
import workerUrl from "typst-wasm/worker/web-worker?url";
import coreUrl from "typst-wasm/engine/engine.core.wasm?url";
import core2Url from "typst-wasm/engine/engine.core2.wasm?url";
import core3Url from "typst-wasm/engine/engine.core3.wasm?url";

import robotoBold from "$lib/fonts/Roboto-Bold.ttf?url";
import robotoRegular from "$lib/fonts/Roboto-Regular.ttf?url";
import robotoThin from "$lib/fonts/Roboto-Thin.ttf?url";
import sourceBold from "$lib/fonts/SourceSans3-Bold.ttf?url";
import sourceItalic from "$lib/fonts/SourceSans3-Italic.ttf?url";
import sourceLight from "$lib/fonts/SourceSans3-Light.ttf?url";
import sourceRegular from "$lib/fonts/SourceSans3-Regular.ttf?url";
import proRegular from "$lib/fonts/SourceSansPro-Regular.ttf?url";
import proItalic from "$lib/fonts/SourceSansPro-Italic.ttf?url";
import proBold from "$lib/fonts/SourceSansPro-Bold.ttf?url";
import proBoldItalic from "$lib/fonts/SourceSansPro-BoldItalic.ttf?url";
import proLight from "$lib/fonts/SourceSansPro-Light.ttf?url";
import proLightItalic from "$lib/fonts/SourceSansPro-LightItalic.ttf?url";
import faBrands from "$lib/fonts/FontAwesome6Brands-Regular.ttf?url";
import faSolid from "$lib/fonts/FontAwesome6Free-Solid.ttf?url";

/** Fonts bundled with the app. Typst needs every weight as its own file. */
const FONT_URLS = [
	sourceLight,
	sourceRegular,
	sourceBold,
	sourceItalic,
	proRegular,
	proItalic,
	proBold,
	proBoldItalic,
	proLight,
	proLightItalic,
	robotoThin,
	robotoRegular,
	robotoBold,
	faSolid,
	faBrands,
];

/**
 * The Typst packages the template imports. Their files are vendored under
 * `src/lib/typst/packages` and fetched on demand as plain assets — the built-in
 * package loader (`.tar.gz` downloads) is not used at runtime.
 */
const PACKAGE_FILES = import.meta.glob("./typst/packages/preview/**/*", {
	query: "?url",
	import: "default",
	eager: true,
}) as Record<string, string>;

/**
 * Maps a Typst package spec like `@preview/fontawesome:0.6.0/lib.typ` to a
 * bundled asset URL. The file part is optional: a bare `@preview/name:version`
 * import resolves to the package entrypoint (`lib.typ`, else `src/lib.typ`,
 * matching the `entrypoint` keys in the vendored `typst.toml` files).
 */
function resolvePackageFile(spec: string): string | null {
	const m = /^@([a-z0-9-]+)\/([a-z0-9_-]+):([^/]+)(?:\/(.+))?$/.exec(spec);
	if (!m) return null;
	const [, ns, name, version, file] = m;
	const candidates = file
		? [`/packages/${ns}/${name}-${version}/${file}`]
		: [
				`/packages/${ns}/${name}-${version}/lib.typ`,
				`/packages/${ns}/${name}-${version}/src/lib.typ`,
			];
	for (const suffix of candidates) {
		for (const [path, url] of Object.entries(PACKAGE_FILES)) {
			if (path.endsWith(suffix)) return url;
		}
	}
	return null;
}

let _compiler: TypstCompiler | null = null;
let _pending: Promise<TypstCompiler> | null = null;

/**
 * Names the engine the app is actually running in. Only used to make the
 * missing-backend error below actionable, so a rough label is enough.
 */
function engineLabel(): string {
	if (typeof navigator === "undefined") return "unbekannte Engine";
	const ua = navigator.userAgent;
	const chrome = /Chrome\/(\d+)/.exec(ua)?.[1];
	// Android WebView identifies itself with a `wv` token; Chrome for Android
	// does not. Both update through the Play Store, WebView separately.
	if (chrome && /\bwv\b/.test(ua)) return `Android System WebView ${chrome}`;
	if (chrome) return `Chrome/Chromium ${chrome}`;
	return ua.slice(0, 80);
}

/**
 * `typst-wasm` can only run with one of two engines underneath: the worker
 * backend needs `SharedArrayBuffer` (i.e. cross-origin isolation) and the JSPI
 * backend needs `WebAssembly.Suspending`/`promising` (Chromium 137+). On an
 * engine that has neither, the library's own message names the *requirement*
 * but not the remedy - and the remedy differs per platform. Since this is the
 * one place where the compiler is created, every caller (both previews and both
 * PDF exports) gets the actionable text from here.
 */
function explainMissingBackend(cause: unknown): Error {
	const original = cause instanceof Error ? cause.message : String(cause);
	const engine = engineLabel();
	const android = /WebView/.test(engine);
	return new Error(
		`Diese Browser-Engine kann Typst nicht ausführen.\n` +
			`Gefunden: ${engine}.\n` +
			`Nötig ist eine Engine mit JSPI (Chrome/WebView 137 oder neuer) oder ` +
			`mit SharedArrayBuffer (Cross-Origin-Isolation).\n` +
			(android
				? `Bitte im Play Store „Android System WebView“ aktualisieren.`
				: `Bitte den Browser bzw. die WebView aktualisieren.`) +
			`\n\nUrsprüngliche Meldung: ${original}`
	);
}

/** `createTypstCompiler`, with the missing-backend error translated. */
async function createCompilerSafely(options: TypstCompilerOptions): Promise<TypstCompiler> {
	try {
		return await createTypstCompiler(options);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (/No compatible typst-wasm backend/i.test(message)) throw explainMissingBackend(e);
		throw e;
	}
}

async function fetchBytes(url: string): Promise<Uint8Array> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

export async function getCompiler(): Promise<TypstCompiler> {
	if (_compiler) return _compiler;
	if (_pending) return _pending;

	_pending = (async () => {
		// Kick the font fetches off before waiting for the engine, so that the
		// 15 files are done by the time it is. Loading them only afterwards puts
		// them on the critical path: the engine finishes at ~1.3 s and the fonts
		// then add another ~100 ms on top of that (measured on the Android
		// emulator: 2.13 s to the first page instead of 1.93 s).
		const fonts = Promise.all(FONT_URLS.map(fetchBytes));
		// A font that fails has to reach the `await` below; without this the
		// rejection would surface as an unhandled one while the engine is still
		// loading, and `render()` would report the wrong error.
		fonts.catch(() => {});

		const compiler = await createCompilerSafely({
			backend: "auto",
			worker: () => createWebWorker(workerUrl),
			// Serve the vendored packages straight from the app's own assets.
			fileLoaders: [
				async (request) => {
					if (request.kind !== "package") return null;
					const url = resolvePackageFile(request.path);
					if (!url) return null;
					const res = await fetch(url);
					if (!res.ok) return null;
					return {
						data: new Uint8Array(await res.arrayBuffer()),
						resolvedPath: request.path,
					};
				},
			],
			coreModules: {
				"engine.core.wasm": WebAssembly.compileStreaming(fetch(coreUrl)),
				"engine.core2.wasm": WebAssembly.compileStreaming(fetch(core2Url)),
				"engine.core3.wasm": WebAssembly.compileStreaming(fetch(core3Url)),
			},
		});

		await compiler.addFonts(...(await fonts));
		_compiler = compiler;
		return compiler;
	})();

	try {
		return await _pending;
	} finally {
		_pending = null;
	}
}

/**
 * Starts loading the compiler and returns immediately.
 *
 * The first preview render needs the engine anyway, and on Android that is by
 * far the most expensive step of the start: ~450 ms to read the 22.8 MB engine
 * out of the APK, against only ~60 ms to actually compile it. The app spends
 * roughly a second on hydration and the IndexedDB read before the first render
 * is even requested, so waiting for that and only *then* loading the engine
 * stacks the two costs. Calling this at mount overlaps them instead.
 *
 * Errors are deliberately swallowed: `render()` calls `getCompiler()` itself
 * and reports the failure there, with the actionable message.
 */
export function warmupCompiler(): void {
	void getCompiler().catch(() => {});
}

export async function disposeCompiler(): Promise<void> {
	if (_compiler) {
		await _compiler.dispose();
		_compiler = null;
	}
}

/** Absolute base prefix, kept for callers that build asset URLs themselves. */
export function assetBase(): string {
	return base;
}

export type { Diagnostic } from "typst-wasm";
