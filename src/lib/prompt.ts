/**
 * Builds the copy-paste prompt that drafts the "Warum diese Firma?" note:
 * role + company + what brings joy, with instructions to research the
 * company first and to output only plain flowing text (~800 chars).
 */

import type { Language } from "./i18n.js";

export interface MotivationPromptInput {
	firma: string;
	rolle: string;
	/** "Was mich antreibt" (static data). */
	antrieb: string;
}

export function buildMotivationPrompt(input: MotivationPromptInput): string {
	const firma = input.firma.trim() || "die Firma";
	const rolle = input.rolle.trim() || "die Stelle";
	const antrieb = input.antrieb.trim() || "(keine Angaben)";
	return [
		"Du hilfst mir bei einer Bewerbung.",
		"",
		`Firma: ${firma}`,
		`Stelle/Rolle: ${rolle}`,
		"",
		"Das macht mir Spaß (berücksichtige das):",
		antrieb,
		"",
		"Recherchiere zuerst selbstständig die Firma (Webseite, Produkte, Mission).",
		'Schreibe danach AUSSCHLIESSLICH den Fließtext für das Feld "Warum diese Firma?" — also warum ich mich für genau diese Firma entschieden habe und was mir daran gefällt.',
		"",
		"Regeln für deine Antwort:",
		"- nur Fließtext, ca. 800 Zeichen",
		"- keine Formatierung (kein Markdown, keine Aufzählung, keine Überschriften)",
		"- gib nichts anderes aus als diesen Text",
	].join("\n");
}

export interface CoverPromptInput {
	firma: string;
	rolle: string;
	/** Full job ad text. */
	adText: string;
	/** Experience collection (static data). */
	erfahrung: string;
	/** What brings joy (static data). */
	antrieb: string;
	/** Why this company (per-job notes). */
	motivation: string;
	/** Expected salary (already formatted, e.g. "65.000 € bei 40h"). */
	gehalt: string;
	/** Earliest start (already formatted, e.g. "ab 01.08.2026"). */
	einstieg: string;
	/**
	 * Language of the application being drafted. A German prompt around English
	 * applicant data yields German prose, which then lands in an application
	 * that is otherwise English — the instruction has to match the output.
	 */
	language?: Language;
}

export function buildCoverPrompt(input: CoverPromptInput): string {
	const en = input.language === "en";
	const pick = (v: string) => (v.trim() ? v.trim() : en ? "(no information)" : "(keine Angaben)");
	return [
		en
			? "You are helping me write a cover letter."
			: "Du hilfst mir bei einer Bewerbung als Motivationsschreiben-Autor.",
		"",
		`${en ? "Company" : "Firma"}: ${pick(input.firma)}`,
		`${en ? "Role / position" : "Stelle/Rolle"}: ${pick(input.rolle)}`,
		`${en ? "Salary expectation" : "Gehaltsvorstellung"}: ${pick(input.gehalt)}`,
		`${en ? "Earliest possible start" : "Frühestmöglicher Einstieg"}: ${pick(input.einstieg)}`,
		"",
		en ? "Job advertisement:" : "Stellenausschreibung:",
		pick(input.adText),
		"",
		en ? "My experience:" : "Meine Erfahrung:",
		pick(input.erfahrung),
		"",
		en ? "What I enjoy:" : "Das macht mir Spaß:",
		pick(input.antrieb),
		"",
		en ? "Why I want to work at exactly this company:" : "Warum ich bei genau dieser Firma arbeiten will:",
		pick(input.motivation),
		"",
		en
			? "Research the company yourself first (website, products, mission)."
			: "Recherchiere zuerst selbstständig die Firma (Webseite, Produkte, Mission).",
		en
			? "Then write ONLY the flowing text of the cover letter (no salutation, no closing — just the middle part)."
			: "Schreibe danach AUSSCHLIESSLICH den Fließtext des Motivationsschreibens (ohne Anrede, ohne Grußformel — nur den Mittelteil).",
		"",
		en ? "Rules for your answer:" : "Regeln für deine Antwort:",
		en ? "- flowing prose only, approx. 2000 characters" : "- nur Fließtext, ca. 2000 Zeichen",
		en
			? "- no formatting (no markdown, no bullet lists, no headings)"
			: "- keine Formatierung (kein Markdown, keine Aufzählung, keine Überschriften)",
		// Named twice on purpose: the text lands in a field that the app wraps
		// in its own salutation and sign-off, so writing them here duplicates
		// them in the PDF. A single "no salutation" in the task line was easy
		// to skim past.
		en
			? '- do NOT write the salutation ("Dear …") or the sign-off ("Sincerely") — the app adds both, so they would appear twice'
			: '- keine Anrede ("Sehr geehrte …") und keine Grußformel ("Mit freundlichen Grüßen") — beides setzt die App selbst davor und dahinter, sonst steht es doppelt im PDF',
		en ? "- output nothing but this text" : "- gib nichts anderes aus als diesen Text",
	].join("\n");
}

/** Known job platforms by hostname fragment. */
const PLATFORMS: [string, string][] = [
	["jobboerse", "Jobbörse der Arbeitsagentur"],
	["stepstone", "StepStone"],
	["indeed", "Indeed"],
	["linkedin", "LinkedIn"],
	["xing", "Xing"],
	["monster", "Monster"],
	["meinestadt", "meinestadt.de"],
	["arbeitsagentur", "Arbeitsagentur"],
	["kleinanzeigen", "Kleinanzeigen"],
	["glassdoor", "Glassdoor"],
	["get-in-it", "get in IT"],
	["kununu", "kununu"],
	["totaljobs", "Totaljobs"],
	["stellenanzeigen", "stellenanzeigen.de"],
];

/** Detects a job platform from a URL ("https://...stepstone.../" -> "StepStone"). */
export function jobPlatformName(url: string): string | null {
	try {
		const host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
		for (const [frag, name] of PLATFORMS) {
			if (host.includes(frag)) return name;
		}
		return null;
	} catch {
		return null;
	}
}

export interface MailPromptInput {
	firma: string;
	rolle: string;
	/** Job ad URL (may be empty). */
	link: string;
}

export function buildMailPrompt(input: MailPromptInput): string {
	const firma = input.firma.trim() || "die Firma";
	const rolle = input.rolle.trim() || "die Stelle";
	const link = input.link.trim();
	const platform = link ? jobPlatformName(link) : null;
	const linkLines = link ? ["", `Stellenanzeige: ${link}`] : [];
	const platformLine = platform
		? `Erwähne, dass ich über ${platform} auf ${firma === "die Firma" ? "die Firma" : "sie"} aufmerksam geworden bin.`
		: "";
	return [
		"Du hilfst mir bei einer Bewerbungs-E-Mail.",
		"",
		`Firma: ${firma}`,
		`Stelle/Rolle: ${rolle}`,
		...linkLines,
		...(platformLine ? ["", platformLine] : []),
		"",
		'Anrede ("Sehr geehrte …") und Grußformel ("Mit freundlichen Grüßen" + mein Name) werden automatisch ergänzt.',
		"",
		"Regeln für deine Antwort:",
		"- schreibe NUR den Mittelteil — keine Anrede, keine Grußformel, kein Betreff",
		"- nur Fließtext, ca. 500 Zeichen",
		"- keine Formatierung (kein Markdown, keine Aufzählung, keine Überschriften)",
		"- gib nichts anderes aus als diesen Text",
	].join("\n");
}
