/**
 * Data shared between the cover letter (Anschreiben) and the CV (Lebenslauf).
 * Everything personal that both documents need lives here exactly once —
 * name, contact details, signature name and the accent color.
 */

import type { Language } from "./i18n.js";

export interface SharedData {
	firstname: string;
	lastname: string;
	email: string;
	phone: string;
	address: string;
	signatureName: string;

	/** Accent color as "#rrggbb", used by both documents. */
	accentColor: string;

	/** Expected salary (free text, e.g. "65.000 € bei 40h"). */
	gehalt: string;
	/** Start-date mode: exact date or "in N months". */
	einstiegArt: "datum" | "monate";
	/** Exact start date as YYYY-MM-DD (when einstiegArt is "datum"). */
	einstiegDatum: string;
	/** Months from now (when einstiegArt is "monate"). */
	einstiegMonate: string;

	/** UI and document language. */
	language: Language;

	/** English variants of text fields (used when language === "en"). */
	firstnameEn: string;
	lastnameEn: string;
	emailEn: string;
	phoneEn: string;
	addressEn: string;
	signatureNameEn: string;
}

/**
 * Returns the localized value of a shared field.
 * When language is "en" and an English variant exists, it wins;
 * otherwise the German default is returned.
 *
 * `lang` overrides `shared.language`: an application carries its own language,
 * and its documents must use the matching name/contact data even when the
 * Stammdaten editor is currently showing the other language.
 */
export function loc(
	shared: SharedData,
	key: "firstname" | "lastname" | "email" | "phone" | "address" | "signatureName",
	lang: Language = shared.language,
): string {
	if (lang === "en") {
		const en = shared[`${key}En` as keyof SharedData] as string;
		if (en && en.trim()) return en;
	}
	return shared[key];
}

/**
 * Placeholder defaults (Max Mustermann) — deliberately NOT real personal data,
 * so a fresh install / reset never ships anyone's actual contact details.
 */
export const DEFAULT_SHARED: SharedData = {
	firstname: "Max",
	lastname: "Mustermann",
	email: "max.mustermann@beispiel.de",
	phone: "+49 123 456789",
	address: "Musterstraße 1, 12345 Musterstadt, Deutschland",
	signatureName: "Max Mustermann",

	accentColor: "#4d3e1d",

	gehalt: "",
	einstiegArt: "monate",
	einstiegDatum: "",
	einstiegMonate: "2",

	language: "de",

	firstnameEn: "",
	lastnameEn: "",
	emailEn: "",
	phoneEn: "",
	addressEn: "",
	signatureNameEn: "",
};

/** Earliest start as display text ("ab 01.08.2026" / "in 2 Monaten" / "immediately"). */
export function einstiegText(shared: SharedData): string {
	const isEn = shared.language === "en";
	if (shared.einstiegArt === "datum") {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shared.einstiegDatum.trim());
		if (!m) return "";
		return isEn ? `${m[3]}.${m[2]}.${m[1]}` : `ab ${m[3]}.${m[2]}.${m[1]}`;
	}
	const n = Number(shared.einstiegMonate);
	if (!Number.isFinite(n) || n < 0) return "";
	if (n === 0) return isEn ? "immediately" : "ab sofort";
	if (n === 1) return isEn ? "in 1 month" : "in 1 Monat";
	return isEn ? `in ${Math.floor(n)} months` : `in ${Math.floor(n)} Monaten`;
}

/** New stable id for filterable parts (skills, work samples). */
export function nid(): string {
	return Math.random().toString(36).slice(2, 10);
}
