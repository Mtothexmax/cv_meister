import { base } from "$app/paths";
import { createTypstCompiler, type TypstCompiler } from "typst-wasm";
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

async function fetchBytes(url: string): Promise<Uint8Array> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

export async function getCompiler(): Promise<TypstCompiler> {
	if (_compiler) return _compiler;
	if (_pending) return _pending;

	_pending = (async () => {
		const compiler = await createTypstCompiler({
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

		await compiler.addFonts(...(await Promise.all(FONT_URLS.map(fetchBytes))));
		_compiler = compiler;
		return compiler;
	})();

	try {
		return await _pending;
	} finally {
		_pending = null;
	}
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
