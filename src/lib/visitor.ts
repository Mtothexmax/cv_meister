/**
 * What we remember about a returning visitor — deliberately **not** app data.
 *
 * Two small facts, and both have to be readable synchronously on the very first
 * line of the boot sequence: whether the newsletter signup was completed (then
 * "/" goes straight to the editor) and whether the JSON/LLM hint was already
 * dismissed. The workspace itself lives in IndexedDB (see storage.ts), which is
 * asynchronous — deciding the redirect from there would render the landing page
 * for a moment and then yank it away. `localStorage` has no such problem, and an
 * e-mail address plus one flag are nowhere near its quota.
 *
 * Best-effort throughout, exactly like storage.ts: with storage disabled or in
 * private mode the app simply behaves as it did before.
 */

const EMAIL_KEY = "cv-meister:visitor-email";
const HINT_KEY = "cv-meister:json-hint-seen";

function read(key: string): string {
	try {
		if (typeof localStorage === "undefined") return "";
		return localStorage.getItem(key) ?? "";
	} catch {
		return "";
	}
}

function write(key: string, value: string): void {
	try {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(key, value);
	} catch {
		/* best effort — a full or blocked localStorage must not break the app */
	}
}

/** The address the visitor signed up with, "" if they never did. */
export function visitorEmail(): string {
	return read(EMAIL_KEY);
}

/**
 * Remembers the address so "/" skips the landing page from then on.
 *
 * Only ever called after the signup actually went out: a remembered address is
 * the proof that this visitor is already on the list, which is what makes
 * sending them through the signup form a second time pointless.
 */
export function rememberVisitor(email: string): void {
	const address = email.trim();
	if (!address) return;
	write(EMAIL_KEY, address);
}

/** True once the JSON/LLM hint has been dismissed. */
export function jsonHintSeen(): boolean {
	return read(HINT_KEY) === "1";
}

export function markJsonHintSeen(): void {
	write(HINT_KEY, "1");
}
