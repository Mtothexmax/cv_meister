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

/**
 * True when the page runs in the *Android* app, as opposed to the desktop shell
 * or a plain browser.
 *
 * `isTauri()` covers both shells, and they are not interchangeable here: the
 * Android build can hand a mail to the Gmail app through a native intent, while
 * the desktop build has no such intent to hand it to (and a browser has no
 * attachments to hand over at all). The user agent is the only signal that
 * separates them, and it is reliable — the Android WebView always carries
 * `Android`.
 *
 * Only meaningful in the browser: during the prerender there is no `navigator`,
 * and `isTauri()` then short-circuits before it is read.
 */
export function isAndroidApp(): boolean {
	return isTauri() && /Android/i.test(navigator.userAgent);
}

/**
 * True when "Mit Google versenden" can work here — i.e. everywhere except the
 * Android app.
 *
 * Google Identity Services opens a *popup* to collect the consent, and the
 * Android WebView has none: `initTokenClient().requestAccessToken()` simply
 * never calls back, so the button would sit on "Wird versendet…" forever.
 * Google also refuses embedded webviews for the redirect flow outright
 * ("disallowed_useragent"). The app has a route that needs no login at all —
 * "In Gmail öffnen" hands the draft to the Gmail app — so the button is hidden
 * there instead of being left as a dead end.
 */
export function canUseGoogleSignIn(): boolean {
	return !isAndroidApp();
}
