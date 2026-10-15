/**
 * Saving and opening a file in a way that also works in the Android shell.
 *
 * Both WebView routes fail there, and both fail *silently* — no file, no error,
 * no hint that the click did anything:
 *
 * * `a[download]` on a `blob:` URL has no download manager behind it.
 * * `location.href = blob:` has no PDF viewer to land in.
 *
 * Inside the app the bytes therefore go to the native side
 * (`src-tauri/src/file_share.rs`), which writes a real file into the device's
 * Downloads folder and hands a `content://` URI to whatever viewer is
 * installed. Neither needs a permission.
 *
 * The IPC layer is JSON, so the bytes travel as base64. That is a third larger
 * than the bytes themselves, which is the price of not having to teach the
 * frontend a second, binary protocol — the same trade `gmailShare.ts` makes.
 *
 * Deliberately no `@tauri-apps/api` import, for the same reason `platform.ts`
 * and `clipboard.ts` avoid it: it would become dead weight in the Pages build.
 */

import { base64Encode } from "./gmail";
import { isAndroidApp } from "./platform";

/** The slice of Tauri's IPC bridge this module needs. */
type TauriInternals = {
	invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

/** True when saving and opening have to go through the native file bridge. */
export function hasNativeFiles(): boolean {
	return isAndroidApp();
}

/**
 * Writes `bytes` into the device's Downloads folder.
 *
 * Answers where the file landed, e.g. `Downloads/Lebenslauf.pdf`. The write is
 * silent, so this is what tells the user it happened at all — and the answer
 * is *not* always the requested name, which is why it is read back from the
 * native side rather than assumed.
 */
export async function saveFileNatively(
	bytes: Uint8Array,
	filename: string,
	mime: string,
): Promise<string> {
	const answer = await invoke("save_file", {
		name: filename,
		mime,
		data: base64Encode(bytes),
	});
	return typeof answer === "string" && answer ? answer : filename;
}

/** Hands the file to an installed viewer instead of opening a tab. */
export async function openFileNatively(
	bytes: Uint8Array,
	filename: string,
	mime: string,
): Promise<void> {
	await invoke("open_file", {
		name: filename,
		mime,
		data: base64Encode(bytes),
	});
}

function invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
	const internals = (globalThis as unknown as { __TAURI_INTERNALS__?: TauriInternals })
		.__TAURI_INTERNALS__;
	if (!internals?.invoke) {
		throw new Error("Tauri-IPC nicht verfügbar");
	}
	return internals.invoke(cmd, args);
}
