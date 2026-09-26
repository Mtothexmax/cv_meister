/**
 * Sending via the user's own Gmail account (Google Identity Services +
 * Gmail API, scope gmail.send). Pure MIME helpers are unit-testable;
 * browser-only parts (GIS script, fetch) run in +page.svelte context.
 */

export const GOOGLE_CLIENT_ID =
	"945060472570-08dk2hugii9uet9k9f1k1m25olhhutj6.apps.googleusercontent.com";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

declare global {
	interface Window {
		google?: {
			accounts?: {
				oauth2?: {
					initTokenClient: (config: {
						client_id: string;
						scope: string;
						callback: (response: { access_token?: string; error?: string }) => void;
					}) => { requestAccessToken: (opts?: { prompt?: string }) => void };
				};
			};
		};
	}
}

export interface MailAttachment {
	filename: string;
	mimeType: string;
	bytes: Uint8Array;
}

/** Waits until the GIS script (`window.google`) is available. */
export function ensureGisLoaded(timeoutMs = 15000): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			reject(new Error("Nur im Browser verfügbar"));
			return;
		}
		if (window.google?.accounts?.oauth2) {
			resolve();
			return;
		}
		const started = Date.now();
		const timer = setInterval(() => {
			if (window.google?.accounts?.oauth2) {
				clearInterval(timer);
				resolve();
			} else if (Date.now() - started > timeoutMs) {
				clearInterval(timer);
				reject(new Error("Google-Login konnte nicht geladen werden (Internet nötig)"));
			}
		}, 100);
	});
}

/** Maps cryptic GIS failures to actionable messages. */
export function explainGoogleError(raw: string): string {
	const msg = raw.toLowerCase();
	if (msg.includes("popup_closed")) return "Google-Login wurde abgebrochen (Popup geschlossen).";
	if (msg.includes("access_denied") || msg.includes("denied"))
		return "Zugriff verweigert — ggf. muss deine Mail als Testnutzer in der Cloud Console eingetragen sein.";
	if (msg.includes("origin") || msg.includes("redirect_uri") || msg.includes("mismatch"))
		return "Domain nicht freigegeben — in der Cloud Console unter Anmeldedaten diese Herkunft eintragen.";
	if (msg.includes("popup_blocked") || msg.includes("popup"))
		return "Popup wurde blockiert — bitte für diese Seite erlauben.";
	if (msg.includes("deleted_client") || msg.includes("invalid_client"))
		return "Client-ID ungültig oder gelöscht (Cloud Console prüfen).";
	if (msg.includes("disallowed_useragent"))
		return "Dieser Browser wird von Google nicht unterstützt (anderen Browser nutzen).";
	return raw || "Google-Login abgebrochen";
}

/** Opens the Google consent flow and resolves with an access token. */
export function requestGoogleToken(): Promise<string> {
	return ensureGisLoaded().then(
		() =>
			new Promise<string>((resolve, reject) => {
				try {
					const client = window.google!.accounts!.oauth2!.initTokenClient({
						client_id: GOOGLE_CLIENT_ID,
						scope: GMAIL_SCOPE,
						callback: (res) => {
							if (res.access_token) resolve(res.access_token);
							else reject(new Error(explainGoogleError(res.error || "")));
						},
					});
					client.requestAccessToken();
				} catch (e) {
					reject(
						new Error(explainGoogleError(e instanceof Error ? e.message : String(e))),
					);
				}
			}),
	);
}

/** Chunked base64 (btoa on huge strings would blow the stack). */
export function base64Encode(bytes: Uint8Array): string {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	return btoa(binary);
}

/** RFC 2047 encoded-word for non-ASCII header values (e.g. Umlaute im Betreff). */
export function encodeHeaderWords(value: string): string {
	if (/^[\x20-\x7e]*$/.test(value)) return value;
	return `=?UTF-8?B?${base64Encode(new TextEncoder().encode(value))}?=`;
}
/** Base64 in 76-char lines (MIME). */
export function base64Lines(bytes: Uint8Array): string {
	return base64Encode(bytes).replace(/.{76}(?=.)/g, "$&\r\n");
}

/** Base64URL without padding (what the Gmail API expects). */
export function base64UrlEncode(bytes: Uint8Array): string {
	return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Renders a plain-text body as minimal, safe HTML.
 *
 * Why this exists: the message bytes can be perfectly RFC-conform (CRLF
 * throughout, base64 text part) and classic Outlook will *still* show the body
 * as one line, because "Remove extra line breaks in plain text messages" is
 * enabled by default and strips every single line break (two or more successive
 * breaks survive). The characters are not lost, so copying the text into another
 * program brings the breaks back — which is exactly the confusing symptom users
 * report. Outlook only does this to `text/plain`, so the durable fix is to offer
 * an HTML alternative it can render instead; the plain part stays for
 * text-only clients.
 */
export function textToHtml(text: string): string {
	const escaped = text
		.replace(/\r\n?/g, "\n")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	// Blank lines separate paragraphs, single breaks stay hard breaks.
	const blocks = escaped
		.split(/\n{2,}/)
		.map((p) => `<p style="margin:0 0 1em 0;">${p.replace(/\n/g, "<br>")}</p>`);
	return (
		'<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
		'<body style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;' +
		`line-height:1.45;color:#111111;">${blocks.join("")}</body></html>`
	);
}

/**
 * Builds an RFC 2822 multipart message (UTF-8 text + attachments).
 *
 * Shape: multipart/mixed → [ multipart/alternative (text, html), attachments ].
 * Both bodies are base64 so charset and line endings survive the wire untouched.
 */
export function buildMimeMessage(
	to: string,
	subject: string,
	bodyText: string,
	attachments: MailAttachment[],
): string {
	const tag = () => Math.floor(Math.random() * 1e6).toString(36);
	const boundary = `CVMEISTER-${Date.now().toString(36)}-${tag()}`;
	const alt = `CVMEISTER-ALT-${tag()}`;
	// One CRLF-normalised body, rendered twice (plain text + HTML).
	const crlfBody = bodyText.replace(/\r?\n/g, "\r\n");
	const textBody = base64Lines(new TextEncoder().encode(crlfBody));
	const htmlBody = base64Lines(new TextEncoder().encode(textToHtml(crlfBody)));
	const lines = [
		`To: ${to}`,
		`Subject: ${encodeHeaderWords(subject)}`,
		"MIME-Version: 1.0",
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
		"",
		`--${boundary}`,
		`Content-Type: multipart/alternative; boundary="${alt}"`,
		"",
		`--${alt}`,
		'Content-Type: text/plain; charset="UTF-8"',
		"Content-Transfer-Encoding: base64",
		"",
		textBody,
		"",
		`--${alt}`,
		'Content-Type: text/html; charset="UTF-8"',
		"Content-Transfer-Encoding: base64",
		"",
		htmlBody,
		"",
		`--${alt}--`,
		"",
	];
	for (const a of attachments) {
		lines.push(
			`--${boundary}`,
			`Content-Type: ${a.mimeType}; name="${a.filename}"`,
			`Content-Disposition: attachment; filename="${a.filename}"`,
			"Content-Transfer-Encoding: base64",
			"",
			base64Lines(a.bytes),
			"",
		);
	}
	lines.push(`--${boundary}--`, "");
	return lines.join("\r\n");
}

export interface SendResult {
	ok: boolean;
	message: string;
}

/** Sends a MIME message through gmail.users.messages.send. */
export async function sendGmail(
	accessToken: string,
	to: string,
	subject: string,
	bodyText: string,
	attachments: MailAttachment[],
	fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
	const mime = buildMimeMessage(to, subject, bodyText, attachments);
	const raw = base64UrlEncode(new TextEncoder().encode(mime));
	let response: Response;
	try {
		response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ raw }),
		});
	} catch (e) {
		return { ok: false, message: `Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}` };
	}
	if (response.ok) return { ok: true, message: "E-Mail wurde über Gmail versendet." };
	try {
		const err = (await response.json()) as { error?: { message?: string } };
		return { ok: false, message: `Fehler beim Senden: ${err.error?.message ?? response.status}` };
	} catch {
		return { ok: false, message: `Fehler beim Senden (Status ${response.status})` };
	}
}
