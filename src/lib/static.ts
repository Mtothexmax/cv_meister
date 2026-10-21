/**
 * Static prompt material (Statische Daten): collected once, used for prompts
 * and applications later. Not rendered into any PDF.
 */

import experienceTxt from "./static/experience.txt?raw";
import antriebTxt from "./static/antrieb.txt?raw";
import type { Language } from "./i18n.js";
import { nid } from "./shared.js";

export interface StaticData {
	/** Experience & skills collection (seeded from experience.txt). */
	erfahrung: string;
	/**
	 * The English variant of `erfahrung` — a separate string, not a copy.
	 * Editing the English text never touches the German one, so switching the
	 * language back shows what was there before.
	 */
	erfahrungEn: string;
	/** What drives you (seeded from antrieb.txt). */
	antrieb: string;
	/** Disclaimer above the work samples (editable under Arbeitsproben). */
	samplesDisclaimer: string;
	/**
	 * The English variant of `samplesDisclaimer` — a separate string, not a
	 * copy. Same contract as `erfahrungEn`: editing one never touches the
	 * other, so switching the language back shows what was there before.
	 */
	samplesDisclaimerEn: string;
}

/**
 * An extra PDF that rides along with every application — Zeugnisse, Nachweise,
 * Zertifikate. Unlike work samples it is never rendered into a document; it is
 * only attached (mail preview, .eml, Gmail send) and backed up as base64.
 */
export interface ExtraDocument {
	/** Stable id: keys the file lookup and the {#each} blocks. */
	id: string;
	/**
	 * Display name in the mail preview and the base of the attachment file name.
	 * Pre-filled from the picked file, then editable.
	 */
	name: string;
}

/**
 * Placeholder seeds. `experience.txt` / `antrieb.txt` are deliberately generic
 * template text (no real career history) and only pre-fill the "Erfahrung" tab;
 * they are never rendered into a PDF.
 */
export const DEFAULT_STATIC: StaticData = {
	erfahrung: experienceTxt,
	erfahrungEn: "",
	antrieb: antriebTxt,
	samplesDisclaimer:
		"Hinweis: Platzhaltertext. Hier kannst du einen Hinweis zu deinen Arbeitsproben eintragen — etwa eine Einordnung, wie die Projekte entstanden sind und welche Qualitätsmaßstäbe gelten.",
	samplesDisclaimerEn:
		"Note: placeholder text. Here you can add a note about your work samples — for example some context on how the projects came about and which quality standards apply.",
};

/**
 * The experience text in the requested language, falling back to German while
 * the English field is still empty.
 *
 * Same contract as `loc()` (Stammdaten) and `letterText()` (Anschreiben): the
 * language picks the field, an empty field never produces an empty prompt.
 */
export function erfahrungText(sd: StaticData, lang: Language = "de"): string {
	if (lang === "en" && sd.erfahrungEn.trim()) return sd.erfahrungEn;
	return sd.erfahrung;
}

/**
 * The work-samples disclaimer in the requested language, falling back to
 * German while the English field is still empty.
 *
 * Rendered above the work samples of a cover letter, so it follows the
 * application's language exactly like the letter text and the CV.
 */
export function samplesDisclaimerText(sd: StaticData, lang: Language = "de"): string {
	if (lang === "en" && sd.samplesDisclaimerEn.trim()) return sd.samplesDisclaimerEn;
	return sd.samplesDisclaimer;
}

/**
 * Global pool of extra PDFs, edited once under Statische Daten → PDF.
 * Starts empty: no placeholder document ships with the app.
 */
export const DEFAULT_DOCUMENTS: ExtraDocument[] = [];

/**
 * Assigns missing document ids (keeps existing ones stable). Guarantees the
 * keyed `{#each}` blocks and the file lookup always have a key — a document
 * without an id would otherwise collide with every other id-less one.
 */
export function ensureDocumentIds(list: ExtraDocument[]): ExtraDocument[] {
	for (const d of list) {
		if (!d.id) d.id = nid();
	}
	return list;
}
