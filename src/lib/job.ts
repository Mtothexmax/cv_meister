/**
 * A job (Stelle/Firma): everything that belongs to one application lives here.
 * Each job owns its own cover-letter instance plus CV filter choices; the CV
 * content itself and the shared Stammdaten stay global across jobs.
 */

import type { CvData } from "./cv.js";
import { DEFAULT_LETTER, type LetterData } from "./letter.js";

export type JobStatus = "Entwurf" | "In Bearbeitung" | "Verschickt";

/**
 * The selectable statuses, in workflow order — one source for the dropdown, the
 * JSON export and the JSON import (which falls back to "Entwurf" for anything
 * unrecognised).
 */
export const JOB_STATUSES: readonly JobStatus[] = ["Entwurf", "In Bearbeitung", "Verschickt"];

/** Salutation gender for the contact person (♀️ / ♂️ / ⚧️). */
export type Anrede = "frau" | "herr" | "divers";

export interface JobData {
	id: string;
	/** Company name. */
	firma: string;
	/** Contact e-mail at the company (optional). */
	email: string;
	/** Accompanying e-mail text, editable once an e-mail address is set. */
	emailText: string;
	/** Why this company: what made you choose it, what you like (notes only). */
	motivation: string;
	/** Full job ad text (reference material, not rendered into PDFs). */
	adText: string;
	/** Contact person, used as salutation in the cover letter. */
	ansprechpartner: string;
	/** Salutation for the contact person ("Sehr geehrte Frau X" / "Sehr geehrter Herr X"). */
	anrede: Anrede;

	/** Job ad URL (Stellen-Link). */
	link: string;
	/** Application status. */
	status: JobStatus;
	/** Role at the company; heading becomes "Bewerbung als <Rolle>". */
	rolle: string;

	/** Accent color as "#rrggbb", one per job. */
	accentColor: string;

	/** Show the driver's license section in this job's CV. */
	fuehrerschein: boolean;
	/**
	 * Route this job's work-sample images through `compressForPdf()` before they
	 * are rendered — for the preview and for every PDF alike. The stored original
	 * is never modified, only the copy that goes into the output.
	 */
	compressImages: boolean;
	/**
	 * Single CV skill entries excluded from this job's CV, keyed by
	 * `skillValueKey()` (`<groupId>::<value>`). Only values inside a category
	 * marked as switchable can appear here.
	 */
	hiddenSkillValues: string[];
	/** Work-sample ids excluded from this job's letter. */
	hiddenSampleIds: string[];

	/**
	 * A CV that belongs to this application alone. `null` means "none yet";
	 * turning the switch on seeds it with a copy of the global CV, so nobody
	 * starts from an empty page.
	 *
	 * Kept when the switch is turned off again — an accidental click must not
	 * destroy the work. `ownCvEnabled` alone decides which CV is rendered.
	 */
	ownCv: CvData | null;
	/**
	 * Render `ownCv` for this application instead of the global CV.
	 *
	 * A CV is the one document that genuinely differs between applications
	 * (different emphasis, different order, a different summary line), so the
	 * option has to exist per application — but it must stay optional, because
	 * maintaining a second full CV for every application is exactly the work
	 * this tool is meant to avoid.
	 */
	ownCvEnabled: boolean;

	/**
	 * Render Anschreiben and Lebenslauf into a *single* PDF named
	 * "Bewerbung <Name>.pdf" instead of two separate files.
	 *
	 * Some application portals accept exactly one upload, and two PDFs are then
	 * a manual merge away from being useless. Off by default: the two separate
	 * documents stay the normal case, and a single file is the exception a
	 * portal forces on you.
	 */
	combinedPdf: boolean;

	/** This job's cover-letter instance. */
	letter: LetterData;
}

function newId(): string {
	return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createJob(partial: Partial<JobData> = {}): JobData {
	return {
		id: newId(),
		firma: "",
		email: "",
		emailText: "",
		motivation: "",
		adText: "",
		ansprechpartner: "",
		anrede: "frau",
		link: "",
		status: "Entwurf",
		rolle: "",
		accentColor: "#4d3e1d",
		fuehrerschein: false,
		// On by default: a full-resolution phone photo is the one thing that
		// reliably blows up an application PDF, and nobody looks at it at that
		// size. Turn it off when a sample must keep every pixel.
		compressImages: true,
		hiddenSkillValues: [],
		hiddenSampleIds: [],
		ownCv: null,
		ownCvEnabled: false,
		combinedPdf: false,
		letter: structuredClone(DEFAULT_LETTER),
		...partial,
	};
}

/** Placeholder default job — never a real company, so nothing personal ships. */
export const DEFAULT_JOBS: JobData[] = [
	createJob({
		firma: "Template Firma",
		status: "In Bearbeitung",
		accentColor: "#4d3e1d",
		rolle: "Senior Frontend Engineer",
	}),
];
