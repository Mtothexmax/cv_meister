/**
 * Data shared between the cover letter (Anschreiben) and the CV (Lebenslauf).
 * Everything personal that both documents need lives here exactly once —
 * name, contact details, signature name and the accent color.
 */

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
};

/** Earliest start as display text ("ab 01.08.2026" / "in 2 Monaten"). */
export function einstiegText(shared: SharedData): string {
	if (shared.einstiegArt === "datum") {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shared.einstiegDatum.trim());
		if (!m) return "";
		return `ab ${m[3]}.${m[2]}.${m[1]}`;
	}
	const n = Number(shared.einstiegMonate);
	if (!Number.isFinite(n) || n < 0) return "";
	if (n === 0) return "ab sofort";
	if (n === 1) return "in 1 Monat";
	return `in ${Math.floor(n)} Monaten`;
}

/** New stable id for filterable parts (skills, work samples). */
export function nid(): string {
	return Math.random().toString(36).slice(2, 10);
}
