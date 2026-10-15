/**
 * Reading the clipboard in a way that also works in the Android shell.
 *
 * The web build uses the async Clipboard API. The Tauri shell must not, at
 * least not for reading: the Android WebView refuses
 * `navigator.clipboard.readText()`. The `clipboard-read` permission has no
 * consent UI there, so the call rejects and pasting a JSON back into the app is
 * impossible — while *writing* keeps working, because it rides on the click
 * that triggered it.
 *
 * Inside the shell the `clipboard-manager` plugin goes through the native
 * Android `ClipboardManager`, which needs neither permission nor user gesture.
 *
 * Only reading is routed through the plugin, deliberately. Writing already
 * works on every target, and the native path would additionally make Android
 * pop its system clipboard preview on every copy — a visible change nobody
 * asked for. If that ever needs to change, this is the one place to do it.
 *
 * Deliberately no `@tauri-apps/api` import: `platform.ts` avoids that package
 * for the same reason — it would become dead weight in the Pages build. The
 * plugin's own wrapper does nothing but
 * `invoke('plugin:clipboard-manager|read_text')`, and
 * `__TAURI_INTERNALS__.invoke` is exactly what that `invoke` wraps.
 */

import { isTauri } from "./platform";

/** The slice of Tauri's IPC bridge this module needs. */
type TauriInternals = {
	invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

function invokePlugin(cmd: string): Promise<unknown> {
	const internals = (globalThis as unknown as { __TAURI_INTERNALS__?: TauriInternals })
		.__TAURI_INTERNALS__;
	if (!internals?.invoke) {
		throw new Error("Tauri-IPC nicht verfügbar");
	}
	return internals.invoke(cmd);
}

/**
 * The clipboard as plain text, `""` when it holds nothing readable.
 *
 * Throws only when the clipboard cannot be reached at all. The distinction
 * matters: the caller has separate messages for "unreadable" and "empty", and
 * an empty clipboard reported as a denied one would send the user hunting for a
 * permission problem that does not exist.
 */
export async function readClipboardText(): Promise<string> {
	if (!isTauri()) {
		return await navigator.clipboard.readText();
	}
	try {
		const text = await invokePlugin("plugin:clipboard-manager|read_text");
		return typeof text === "string" ? text : "";
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (NOTHING_TO_READ.includes(message)) return "";
		throw e;
	}
}

/**
 * Plugin answers that mean "there is no text on the clipboard", as opposed to
 * "the clipboard could not be read".
 *
 * The plugin *rejects* in these cases rather than returning `""`: its Android
 * side answers `Clipboard is empty` when no clip is set and `Clipboard content
 * reader not implemented` for a clip that is not plain text
 * (`ClipboardPlugin.kt`, `readText`). Matched on the exact wording — if the
 * plugin ever rewords them the read falls back to throwing, which is the safe
 * direction to fail in.
 */
const NOTHING_TO_READ = ["Clipboard is empty", "Clipboard content reader not implemented"];
