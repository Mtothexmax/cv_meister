/**
 * "In Gmail öffnen" — handing a pre-filled draft to the Gmail app.
 *
 * Android only, and only inside the app. The WebView has no way to put a draft
 * with attachments into Gmail: `navigator.share` is not implemented in the
 * Android WebView, and a `mailto:` link carries text but no files. The native
 * side therefore writes the attachments to the app cache and fires an Android
 * `ACTION_SEND` intent — the same route the reference implementation takes
 * (see `src-tauri/src/gmail_share.rs`).
 *
 * The IPC layer is JSON, so the PDF bytes travel as base64. That is a third
 * larger than the bytes themselves, which is the price of not having to teach
 * the frontend a second, binary protocol for one button.
 *
 * Deliberately no `@tauri-apps/api` import, for the same reason `platform.ts`
 * and `clipboard.ts` avoid it: it would become dead weight in the Pages build.
 */

import { base64Encode, textToHtml, type MailAttachment } from "./gmail";
import { isAndroidApp } from "./platform";

/** The slice of Tauri's IPC bridge this module needs. */
type TauriInternals = {
	invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

export interface GmailDraft {
	/** Recipient. Left empty the To field stays empty rather than blank-filled. */
	to: string;
	subject: string;
	/** Plain-text body; the HTML alternative is derived here. */
	body: string;
	attachments: MailAttachment[];
}

/** True when this target can open Gmail with a pre-filled draft. */
export function canOpenInGmail(): boolean {
	return isAndroidApp();
}

/** Opens Gmail with the draft, attachments included. */
export async function openDraftInGmail(draft: GmailDraft): Promise<void> {
	const internals = (globalThis as unknown as { __TAURI_INTERNALS__?: TauriInternals })
		.__TAURI_INTERNALS__;
	if (!internals?.invoke) {
		throw new Error("Tauri-IPC nicht verfügbar");
	}
	await internals.invoke("open_in_gmail", {
		draft: {
			to: draft.to,
			subject: draft.subject,
			body: draft.body,
			bodyHtml: textToHtml(draft.body),
			attachments: draft.attachments.map((a) => ({
				filename: a.filename,
				data: base64Encode(a.bytes),
			})),
		},
	});
}
