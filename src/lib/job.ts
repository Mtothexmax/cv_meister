/**
 * A job (Stelle/Firma): everything that belongs to one application lives here.
 * Each job owns its own cover-letter instance plus CV filter choices; the CV
 * content itself and the shared Stammdaten stay global across jobs.
 */

import { DEFAULT_LETTER, type LetterData } from "./letter.js";

export type JobStatus = "Entwurf" | "In Bearbeitung" | "Verschickt";

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
	/** CV skill-group ids excluded from this job's CV. */
	hiddenSkillIds: string[];
	/** Single skill values excluded, as "groupId::value". */
	hiddenSkillValues: string[];
	/** Work-sample ids excluded from this job's letter. */
	hiddenSampleIds: string[];

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
		hiddenSkillIds: [],
		hiddenSampleIds: [],
		hiddenSkillValues: [],
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
