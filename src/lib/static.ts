/**
 * Static prompt material (Statische Daten): collected once, used for prompts
 * and applications later. Not rendered into any PDF.
 */

import experienceTxt from "./static/experience.txt?raw";
import antriebTxt from "./static/antrieb.txt?raw";

export interface StaticData {
	/** Experience & skills collection (seeded from experience.txt). */
	erfahrung: string;
	/** What drives you (seeded from antrieb.txt). */
	antrieb: string;
	/** Disclaimer above the work samples (editable under Arbeitsproben). */
	samplesDisclaimer: string;
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
