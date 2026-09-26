/**
 * Static prompt material (Statische Daten): collected once, used for prompts
 * and applications later. Not rendered into any PDF.
 */

import experienceTxt from "./static/experience.txt?raw";
import antriebTxt from "./static/antrieb.txt?raw";
import { nid } from "./shared.js";

export interface StaticData {
	/** Experience & skills collection (seeded from experience.txt). */
	erfahrung: string;
	/** What drives you (seeded from antrieb.txt). */
	antrieb: string;
	/** Disclaimer above the work samples (editable under Arbeitsproben). */
	samplesDisclaimer: string;
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
	antrieb: antriebTxt,
	samplesDisclaimer:
		"Hinweis: Platzhaltertext. Hier kannst du einen Hinweis zu deinen Arbeitsproben eintragen — etwa eine Einordnung, wie die Projekte entstanden sind und welche Qualitätsmaßstäbe gelten.",
};

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
