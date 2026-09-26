/**
 * Builds the Typst source for a CV (Lebenslauf) on top of the vendored
 * `modern-cv-local.typ` template (the same template the reference CVs use).
 *
 * Markup conventions for user text:
 * - Detail lines starting with "- " become bullet points.
 * - `*text*` renders bold (strong), everything else is escaped literally,
 *   so `C#`, `a_b` or `50%` can't break the document.
 * - Skill values are one per line; `*value*` renders bold.
 */

import { typstString, typstContent, todayISO, safeAccentColor } from "./letter.js";
import type { SharedData } from "./shared.js";
import { nid } from "./shared.js";
import type { JobData } from "./job.js";

export interface CvEntry {
	title: string;
	location: string;
	/** Free-text period, e.g. "April 2026 - September 2026". */
	date: string;
	description: string;
	/** Lines starting with "- " become bullets, blank lines split paragraphs. */
	details: string;
}

export interface CvSkillGroup {
	/** Stable id for per-job filtering. Assigned via ensureCvIds(). */
	id?: string;
	category: string;
	/** One value per line; `*value*` renders bold. */
	values: string;
}

export interface CvSection {
	/** Stable id for keyed rendering. Assigned via ensureCvIds(). */
	id?: string;
	title: string;
	entries: CvEntry[];
	skills: CvSkillGroup[];
}

export interface CvData {
	/** Driver's license text (e.g. "Klasse B"), shown per-job when enabled. */
	fuehrerschein: string;

	sections: CvSection[];
}

/** Assigns missing section / skill-group ids (keeps existing ones stable). */
export function ensureCvIds(cv: CvData): CvData {
	for (const s of cv.sections) {
		if (!s.id) s.id = nid();
		for (const g of s.skills) {
			if (!g.id) g.id = nid();
		}
	}
	return cv;
}

/**
 * Placeholder CV content — fully generic template data in the Max-Mustermann
 * style. No real employers, institutions, dates, topics, skills or interests.
 * Real data belongs in the user's own workspace (IndexedDB / JSON import).
 */
export const DEFAULT_CV: CvData = {
	fuehrerschein: "",

	sections: [
		{
			title: "Berufserfahrung",
			entries: [
				{
					title: "Software-Entwickler",
					location: "Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "Template Firma 1",
					details: "- Aufgabe 1\n- Aufgabe 2",
				},
				{
					title: "Software-Entwickler",
					location: "Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "Template Firma 2",
					details: "- Aufgabe 1\n- Aufgabe 2",
				},
			],
			skills: [],
		},
		{
			title: "Sprachen",
			entries: [],
			skills: [
				{ category: "Sprache 1", values: "Muttersprache" },
				{ category: "Sprache 2", values: "C1 (schriftlich), B2 (mündlich)" },
				{ category: "Sprache 3", values: "B1" },
			],
		},
		{
			title: "Programmierkenntnisse",
			entries: [],
			skills: [
				{ category: "Erweiterte Kenntnisse", values: "*Programmiersprache 1*\n*Programmiersprache 2*" },
				{ category: "Grundkenntnisse", values: "Programmiersprache 3\nProgrammiersprache 4" },
			],
		},
		{
			title: "Software und Tools",
			entries: [],
			skills: [{ category: "Kategorie 1", values: "Tool 1\nTool 2\nTool 3" }],
		},
		{
			title: "Interessen",
			entries: [],
			skills: [
				{ category: "Interesse 1", values: "Stichwort 1\nStichwort 2" },
				{ category: "Interesse 2", values: "Stichwort 3" },
			],
		},
		{
			title: "Akademische Ausbildung",
			entries: [
				{
					title: "Master-Studiengang",
					location: "Mustermann-Universität, Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "",
					details: "Abschlussarbeit: *Thema der Abschlussarbeit*, Note X,X. Gesamtnote X,X.",
				},
				{
					title: "Auslandssemester",
					location: "Mustermann-Universität, Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "",
					details: "Studium im Rahmen des Masterprogramms.",
				},
				{
					title: "Bachelor-Studiengang",
					location: "Mustermann-Universität, Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "",
					details: "Abschlussarbeit: *Thema der Abschlussarbeit*, Note X,X. Gesamtnote X,X.",
				},
			],
			skills: [],
		},
		{
			title: "Praktische Erfahrungen",
			entries: [
				{
					title: "Praktikum",
					location: "Template Firma 1, Musterstadt",
					date: "Monat Jahr",
					description: "",
					details: "Aufgabenbeschreibung (Dauer).",
				},
				{
					title: "Tutor",
					location: "Mustermann-Universität, Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "",
					details: "- Leitung einer Übungsgruppe.\n- Teilnahme an Tutorenschulung.",
				},
			],
			skills: [],
		},
		{
			title: "Ausbildung",
			entries: [
				{
					title: "Allgemeine Hochschulreife (Abitur)",
					location: "Mustermann-Gymnasium, Musterstadt",
					date: "Monat Jahr - Monat Jahr",
					description: "",
					details: "Abschluss: Monat Jahr.",
				},
			],
			skills: [],
		},
	],
};

/**
 * Renders inline text where paired `*...*` stays bold (strong) and
 * everything else is escaped literally.
 */
export function richInline(value: string): string {
	const spans: string[] = [];
	const protectedText = value.replace(/\*([^*]+)\*/g, (_m: string, inner: string) => {
		spans.push(`*${typstContent(inner)}*`);
		return `${spans.length - 1}`;
	});
	return typstContent(protectedText).replace(/(\d+)/g, (_, i: string) => spans[Number(i)]);
}

/**
 * Converts a details textarea into `#resume-item` body content: blocks of
 * "- " lines become bullet lists, other blocks become plain paragraphs.
 */
export function cvDetails(text: string): string {
	const blocks = text
		.split(/\r?\n\s*\r?\n/)
		.map((b) => b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
		.filter((lines) => lines.length > 0);
	return blocks
		.map((lines) => {
			if (lines.every((l) => l.startsWith("- "))) {
				return lines.map((l) => `- ${richInline(l.slice(2).trim())}`).join("\n");
			}
			return lines.map((l) => richInline(l)).join(" ");
		})
		.join("\n\n");
}

/** Stable key for one skill value inside a group (per-job filtering). */
export function skillValueKey(groupId: string | undefined, value: string): string {
	return `${groupId ?? ""}::${value.trim()}`;
}

/**
 * One entry per non-empty line, duplicates collapsed.
 *
 * Duplicates have to go: a value listed twice would otherwise break the keyed
 * `{#each}` that renders the per-job skill toggles (`each_key_duplicate`) and
 * could never be switched off as a whole. Shared by the UI and the PDF/JSON
 * rendering so both always agree on what "one value" means.
 */
export function skillLines(values: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of values.split(/\r?\n/)) {
		const value = line.trim();
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}

/** Visible raw values of a skill group after per-job filtering. */
function visibleSkillValues(
	text: string,
	groupId: string | undefined,
	hiddenValues: string[],
): string[] {
	return skillLines(text).filter((v) => !hiddenValues.includes(skillValueKey(groupId, v)));
}

/** Splits values into a Typst array (trailing comma: `("x",)` is an array, `("x")` is a string). */
function skillValuesArray(values: string[]): string {
	const items = values.map((v) => {
		const m = /^\*(.+)\*$/.exec(v);
		return m ? `strong(${typstString(m[1])})` : typstString(v);
	});
	return `(${items.join(", ")},)`;
}

function renderEntry(e: CvEntry): string {
	const parts = [
		`#resume-entry(`,
		`  title: ${typstString(e.title)},`,
		`  location: ${typstString(e.location)},`,
		`  date: ${typstString(e.date)},`,
		e.description.trim() ? `  description: ${typstString(e.description)},` : null,
		`)`,
	].filter((l): l is string => l !== null);
	const details = cvDetails(e.details);
	const body = details
		? `${parts.join("\n")}\n\n#resume-item[\n${details}\n]`
		: parts.join("\n");
	// Keep heading and details together: no orphan heading at a page bottom.
	// Extra air below each entry.
	return `#block(breakable: false)[\n${body}\n]\n#v(0.4em)`;
}

function renderSection(s: CvSection, job: JobData): string | null {
	const skills = s.skills
		.filter((g) => !(g.id && job.hiddenSkillIds.includes(g.id)))
		.map((g) => ({ group: g, values: visibleSkillValues(g.values, g.id, job.hiddenSkillValues) }))
		.filter(({ values }) => values.length > 0);
	if (s.entries.length === 0 && skills.length === 0) return null;
	const parts: string[] = s.entries.map((e) => renderEntry(e));
	for (const { group, values } of skills) {
		parts.push(
			`#resume-skill-item(${typstString(group.category)}, ${skillValuesArray(values)})`,
		);
	}
	// Keep the section heading together with the first block so the title
	// never strands at a page bottom while entry 1 starts on the next page.
	const [first, ...rest] = parts;
	const chunks = [`#block(breakable: false)[\n= ${typstContent(s.title)}\n\n${first}\n]`, ""];
	for (const p of rest) chunks.push(p, "");
	if (skills.length > 0) chunks.push("#block(below: 0.65em)");
	return chunks.join("\n");
}

/** A Typst `datetime` for the template (only used in the hidden footer). */
function cvDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
	if (!m) return "datetime(year: 2000, month: 1, day: 1)";
	return `datetime(year: ${Number(m[1])}, month: ${Number(m[2])}, day: ${Number(m[3])})`;
}

/**
 * Assembles the full Typst source for the CV. The photo path comes via opts
 * (never written back into reactive state, so rendering stays side-effect free).
 */
export function buildCvSource(
	shared: SharedData,
	job: JobData,
	data: CvData,
	opts: { profileFile?: string },
): string {
	const profile = opts.profileFile
		? `box(image(${typstString(opts.profileFile)}, width: 100%, height: 100%))`
		: `none`;

	return `#import "modern-cv-local.typ": *

// The fa-version call inside the template module does not propagate to this
// document (proven: icons would resolve FA7 families), so repeat it here.
#fa-version("6")

#let heading-color = rgb(${typstString(safeAccentColor(job.accentColor))})

#show: resume.with(
  accent-color: rgb(heading-color),
  author: (
    firstname: ${typstString(shared.firstname)},
    lastname: ${typstString(shared.lastname)},
    email: ${typstString(shared.email)},
    phone: ${typstString(shared.phone)},
    address: ${typstString(shared.address)},
    positions: (),
  ),
  profile-picture: ${profile},
  date: ${cvDate(todayISO())},
  language: "de",
  colored-headers: true,
  show-footer: false,
  show-address-icon: true,
  paper-size: "a4",
)

${data.sections.map((s) => renderSection(s, job)).filter((x): x is string => x !== null).join("\n")}${renderFuehrerschein(data, job)}`;
}

function renderFuehrerschein(data: CvData, job: JobData): string {
	if (!job.fuehrerschein || !data.fuehrerschein.trim()) return "";
	return `\n= Führerschein\n\n#resume-item[\n${richInline(data.fuehrerschein.trim())}\n]`;
}
