/**
 * Builds the SvelteKit frontend as a static bundle for Tauri (desktop + Android).
 *
 * This project keeps its SvelteKit options inside `vite.config.ts` (there is no
 * `svelte.config.js`), and that config is tuned for GitHub Pages: `export.ps1`
 * swaps in a `base: "/cv_meister"` variant for the duration of its build. This
 * script does the same swap, but for the Tauri target:
 *
 *   - `base: ""` — inside the webview the app is served from the root
 *   - adapter-static, one prerendered page (the app routes via URL hash)
 *
 * Both files are restored byte-for-byte afterwards, so the working tree is left
 * exactly as it was found: `export.ps1`, the committed `vite.config.ts` and the
 * Pages deployment stay untouched and keep working.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VITE_CONFIG = join(ROOT, "vite.config.ts");
const LAYOUT_TS = join(ROOT, "src/routes/+layout.ts");
const OUT_INDEX = join(ROOT, "build/index.html");

const TAURI_VITE_CONFIG = `import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries.
				runes: ({ filename }) => (filename.split(/[/\\\\]/).includes('node_modules') ? undefined : true)
			},
			// Tauri serves the app from the webview root, so there is no base path.
			paths: { base: '' },
			// "#editor" is a hash *route* (see src/routes/+page.svelte), not an
			// in-page anchor, so the prerenderer's anchor check must not fail on it.
			prerender: {
				handleMissingId: ({ id, message }) => {
					if (id !== 'editor') throw new Error(message);
				}
			},
			adapter: adapter({ pages: 'build', assets: 'build', fallback: null, precompress: false, strict: false })
		})
	]
});
`;

const LAYOUT_CONTENT = "export const prerender = true;\n";

const viteConfigBefore = readFileSync(VITE_CONFIG, "utf8");
const hadLayout = existsSync(LAYOUT_TS);
const layoutBefore = hadLayout ? readFileSync(LAYOUT_TS, "utf8") : null;

let failed = null;
try {
	// Clear the generated directories with git rather than letting SvelteKit's
	// own `rimraf(.svelte-kit/output)` and adapter-static's output cleanup do it.
	// Both are gitignored, so `-x` is required. This also keeps the build
	// deterministic on a warm tree.
	try {
		execFileSync("git", ["clean", "-fdxq", "--", ".svelte-kit/output", "build"], {
			cwd: ROOT,
			stdio: "ignore",
		});
	} catch {
		// git unavailable — let the build try anyway.
	}

	writeFileSync(VITE_CONFIG, TAURI_VITE_CONFIG);
	writeFileSync(LAYOUT_TS, LAYOUT_CONTENT);
	execFileSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit", shell: true });
} catch (error) {
	failed = error;
} finally {
	// Restore first, even if the build threw: a stale export config left behind
	// would silently break the next `npm run dev` / `export.ps1`.
	writeFileSync(VITE_CONFIG, viteConfigBefore);
	if (hadLayout) writeFileSync(LAYOUT_TS, layoutBefore);
	else rmSync(LAYOUT_TS, { force: true });
}

if (failed) {
	console.error("\nTauri-Frontend-Build fehlgeschlagen.");
	process.exit(1);
}

if (!existsSync(OUT_INDEX)) {
	console.error(`\nBuild meldete Erfolg, aber ${OUT_INDEX} fehlt.`);
	process.exit(1);
}

console.log('Tauri-Frontend nach build/ gebaut (base "", statisch vorgerendert).');
