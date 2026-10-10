/**
 * Where is this running?
 *
 * One source tree ships to three targets (see README): the web build behind
 * GitHub Pages, and a Tauri shell for desktop and Android. Most of the app is
 * identical everywhere, but the shell is not a web page and a few behaviours
 * have to differ — the shell opens on the editor instead of the marketing
 * landing page, because there is no newsletter to sign up for first.
 *
 * Deliberately hand-rolled rather than importing `isTauri()` from
 * `@tauri-apps/api`: that package would become a runtime dependency of the
 * Pages build too, where it is dead weight that can never be true.
 */

/**
 * True when the page runs inside the Tauri shell (desktop or Android).
 *
 * `__TAURI_INTERNALS__` is injected by the runtime into every webview, with or
 * without `withGlobalTauri`. The origin check is a belt-and-braces fallback for
 * the asset protocols (`tauri://localhost`, `http://tauri.localhost`) in case
 * that global is ever renamed.
 */
export function isTauri(): boolean {
	if (typeof window === "undefined") return false;
	const w = window as unknown as Record<string, unknown>;
	if ("__TAURI_INTERNALS__" in w || "__TAURI__" in w) return true;
	return window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost";
}
