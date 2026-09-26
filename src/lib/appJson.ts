/**
 * The self-describing JSON format (format "cv-meister", version 2).
 *
 * Every editable value is wrapped as `{ label, info?, value }`:
 *   - `label` — the caption exactly as the UI shows it
 *   - `info`  — the hint the UI prints next to that caption: what the field is
 *               for, where the value ends up, and what happens around it
 *               automatically (e.g. "Anrede und Gruß kommen automatisch dazu")
 *   - `value` — the ONLY part read back on import
 *
 * That is the whole point: a reader (human or AI) can edit the file without
 * being told how the app works, because every field explains itself and the
 * `vorschau` block shows what the result actually looks like.
 *
 * Three exports share the format and differ only in scope:
 *   art "bewerbung"      — one application; no image bytes (a logo travels as a
 *                          URL, so an AI can set it), the rest as name refs
 *   art "arbeitsbereich" — everything, incl. every image/document as base64
 *   art "lebenslauf"     — only the CV
 *
 * Import is deliberately forgiving: `label`/`info`/`vorschau` are ignored,
 * unknown keys are dropped, and anything missing keeps its current value.
 */

import type { Anrede, JobData, JobStatus } from "./job.js";
import type { LetterData, WorkSample } from "./letter.js";
import type { SharedData } from "./shared.js";
import type { CvData, CvEntry, CvSection } from "./cv.js";
import { ensureCvIds, skillLines, skillValueKey } from "./cv.js";
import type { ExtraDocument, StaticData } from "./static.js";

export const JSON_FORMAT = "cv-meister";
export const JSON_VERSION = 3;

export type JsonArt = "bewerbung" | "arbeitsbereich" | "lebenslauf";

/**
 * One value as the UI presents it. Only `value` is read back on import.
 *
 * `label` is the stable caption; `_comment` holds the parenthetical the UI puts
 * next to it. That text is descriptive and changes over time ("z. B. Juni 2021 -
 * März 2026"), so keeping it out of the label means a wording change in the UI
 * never looks like a renamed field.
 */
export interface JsonField<T = unknown> {
	label: string;
	/** Parenthetical from the UI caption, e.g. "z. B. Klasse B". */
	_comment?: string;
	info?: string;
	value: T;
}

/** How an uploaded file is referenced in the JSON. */
export interface JsonFileRef {
	/** True when a file is actually stored in the app. */
	vorhanden: boolean;
	name: string | null;
	/**
	 * Source URL — only for the company logo. This is what an AI can set;
	 * image bytes are never part of the per-application export.
	 */
	url?: string | null;
	/** data:-URL (Base64). Only present in the "arbeitsbereich" export. */
	base64?: string | null;
}

/**
 * A file reference with every field resolved — the readers return this, so
 * callers never have to deal with the optional `url`/`base64` of the written
 * form (they are simply `null` when absent).
 */
export interface ResolvedFileRef {
	vorhanden: boolean;
	name: string | null;
	url: string | null;
	base64: string | null;
}

interface Envelope {
	format: typeof JSON_FORMAT;
	version: typeof JSON_VERSION;
	exportiert: string;
	/** Short instructions for whoever reads the file (an AI, usually). */
	anleitung: string[];
}

export interface CvSectionNode {
	titel: JsonField<string>;
	eintraege: {
		titel: JsonField<string>;
		ort: JsonField<string>;
		zeitraum: JsonField<string>;
		firma: JsonField<string>;
		details: JsonField<string>;
	}[];
	kenntnisse: { kategorie: JsonField<string>; werte: JsonField<string> }[];
}

export interface CvNode {
	fuehrerschein: JsonField<string>;
	abschnitte: CvSectionNode[];
}

/**
 * One work sample. No id: samples are matched back by their title, which is
 * also what a reader sees.
 */
export interface SampleNode {
	titel: JsonField<string>;
	beschreibung: JsonField<string>;
	link: JsonField<string>;
	bild: JsonFileRef;
}

/**
 * One extra PDF. Matched back by `dateiname`, which is what the mail actually
 * attaches — so no id is needed and two entries cannot silently collide.
 */
export interface DocumentNode {
	name: JsonField<string>;
	/** File name the PDF will be attached under. */
	dateiname: string;
	vorhanden: boolean;
	base64?: string | null;
}

/** Everything an application needs, minus the per-job filter. */
export interface ApplicationNode {
	felder: {
		firma: JsonField<string>;
		rolle: JsonField<string>;
		stellenLink: JsonField<string>;
		firmenEmail: JsonField<string>;
		emailText: JsonField<string>;
		ansprechpartner: JsonField<string>;
		anrede: JsonField<Anrede>;
		akzentfarbe: JsonField<string>;
		firmenlogo: JsonField<JsonFileRef>;
		stellenausschreibung: JsonField<string>;
		motivation: JsonField<string>;
		status: JsonField<JobStatus>;
	};
	anschreiben: {
		text: JsonField<string>;
		grussformel: JsonField<string>;
	};
	/**
	 * ONLY the switch state of THIS application — the CV content itself is
	 * global and deliberately not repeated here. Everything absent is on.
	 * Mapped back by text, never by ids.
	 */
	auswahl: {
		hinweis: string;
		fuehrerschein: JsonField<boolean>;
		ausgeschalteteArbeitsproben: string[];
		ausgeschalteteKenntnisse: { bereich: string; kategorie: string }[];
		ausgeschalteteWerte: { bereich: string; kategorie: string; wert: string }[];
	};
}

/**
 * Derived, read-only: the two texts the application produces.
 *
 * The CV listing that used to live here is gone — it only repeated the switch
 * state above.
 */
export interface PreviewNode {
	hinweis: string;
	mail: { an: string; betreff: string; text: string; anhaenge: string[] };
	anschreiben: { anrede: string | null; text: string; grussformel: string; name: string };
}

/**
 * The opened application — a fill-in template for one prompt.
 *
 * Deliberately WITHOUT the global data: the CV (Stammdaten) and the work-sample
 * pool are already complete and are not what the AI has to write. Only the
 * switch state is carried, so importing never overwrites global content.
 */
export interface ApplicationDoc extends Envelope {
	art: "bewerbung";
	bewerbung: ApplicationNode;
	stammdaten: Record<string, JsonField<string>>;
	dokumente: DocumentNode[];
	vorschau: PreviewNode;
}

export interface WorkspaceDoc extends Envelope {
	art: "arbeitsbereich";
	/** Index into `bewerbungen` — no ids anywhere. */
	aktiveBewerbung: number;
	bewerbungen: ApplicationNode[];
	stammdaten: Record<string, JsonField<string>>;
	lebenslauf: CvNode;
	dokumente: DocumentNode[];
	/** Statische Daten (Erfahrung, Antrieb, Arbeitsproben-Hinweis). */
	statischeDaten: Record<string, JsonField<string>>;
	/** The global work-sample pool — only this export carries its images. */
	arbeitsproben: SampleNode[];
	bilder: {
		hinweis: string;
		foto: JsonFileRef;
		unterschrift: JsonFileRef;
	};
	/** Kept for restoring the UI position. */
	oberflaeche: { ansicht: string; statischeDatenReiter: string };
}

export interface CvDoc extends Envelope {
	art: "lebenslauf";
	lebenslauf: CvNode;
}

export type AnyDoc = ApplicationDoc | WorkspaceDoc | CvDoc;

// ---------------------------------------------------------------------------
// field helpers
// ---------------------------------------------------------------------------

/**
 * Splits a trailing "(…)" out of a UI caption.
 *
 * Only a trailing parenthetical is split, so a caption that legitimately
 * contains brackets mid-sentence stays intact.
 */
function splitLabel(label: string): { label: string; comment?: string } {
	const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(label);
	if (!m || !m[1]) return { label };
	return { label: m[1].trim(), comment: m[2].trim() };
}

/**
 * Wraps a value the way the UI presents it.
 *
 * The caption is passed through verbatim as it appears in the markup; a
 * trailing parenthetical is lifted into `_comment` (see `JsonField`).
 */
export function field<T>(label: string, value: T, info?: string): JsonField<T> {
	const split = splitLabel(label);
	const head: Omit<JsonField<T>, "value"> = { label: split.label };
	if (split.comment) head._comment = split.comment;
	if (info) head.info = info;
	return { ...head, value };
}

/**
 * Reads the payload of a `{ label, info, value }` node.
 *
 * Falls back to the node itself when it is not a wrapper: several places carry
 * plain records instead of wrapped fields (`lebenslaufFilter` entries are
 * `{ bereich, kategorie, wert }`, file refs are `{ vorhanden, name, … }`).
 * Without that fallback those values read back as empty strings and the
 * per-job filter was silently lost on every re-import.
 */
function unwrap(node: unknown): unknown {
	if (node && typeof node === "object" && "value" in (node as Record<string, unknown>)) {
		return (node as Record<string, unknown>).value;
	}
	return node;
}

function readString(node: unknown, fallback = ""): string {
	const v = unwrap(node);
	return typeof v === "string" ? v : fallback;
}

function readBool(node: unknown, fallback = false): boolean {
	const v = unwrap(node);
	return typeof v === "boolean" ? v : fallback;
}

function readOneOf<T extends string>(node: unknown, allowed: readonly T[], fallback: T): T {
	const v = unwrap(node);
	return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function readFileRef(node: unknown): ResolvedFileRef {
	const v = unwrap(node);
	if (v && typeof v === "object") {
		const r = v as Partial<JsonFileRef>;
		return {
			vorhanden: r.vorhanden === true,
			name: typeof r.name === "string" ? r.name : null,
			url: typeof r.url === "string" ? r.url : null,
			base64: typeof r.base64 === "string" ? r.base64 : null,
		};
	}
	return { vorhanden: false, name: null, url: null, base64: null };
}

const JOB_STATUS: readonly JobStatus[] = ["Entwurf", "In Bearbeitung", "Verschickt"];
const ANREDE: readonly Anrede[] = ["frau", "herr", "divers"];

// ---------------------------------------------------------------------------
// export — building the document
// ---------------------------------------------------------------------------

const ANLEITUNG_HEAD = [
	"Selbstbeschreibendes Format. Jedes bearbeitbare Feld ist { label, _comment, info, value }:",
	"  label    = Beschriftung genau wie in der Oberfläche (stabil)",
	"  _comment = der Klammerzusatz aus der Beschriftung (z. B. \"z. B. Klasse B\") — nur erklärend",
	"  info     = Zusatzhinweis aus der Oberfläche (was das Feld bewirkt, was automatisch passiert)",
	"  value    = der eigentliche Wert. NUR value wird beim Import gelesen.",
	"Zum Ausfüllen also ausschließlich die value-Felder setzen; label, _comment und info ändern nichts.",
	'Der Abschnitt "vorschau" ist abgeleitet (das ist das Ergebnis, das die Oberfläche zeigt) und wird beim Import ignoriert.',
	"Es gibt keine IDs: Zuordnungen laufen über die sichtbaren Texte (Titel, Dateiname, Abschnitt/Kategorie/Wert).",
];

const ANLEITUNG_APP_TAIL = [
	"Das ist eine Vorlage zum Ausfüllen: Felder mit leerem value sind die, die noch fehlen.",
	"Absichtlich NICHT enthalten sind Lebenslauf und Arbeitsproben selbst — die sind global (Stammdaten)",
	"und schon vollständig. Aus ihnen steht hier nur, was für DIESE Bewerbung an- oder ausgeschaltet ist (bewerbung.auswahl).",
	"Bilder sind nicht als Base64 enthalten, sondern nur als Referenz (Name/Vorhanden). Einzige Ausnahme: das Firmenlogo —",
	"es steht als URL in firmenlogo.value.url und kann dort gesetzt werden; die App lädt das Bild dann von dieser URL.",
	"Beim Import werden die Felder, das Anschreiben, die Auswahl und die Stammdaten übernommen. Lebenslauf, Arbeitsproben",
	"und die Dokumentliste bleiben unangetastet (global bzw. lokal hochgeladen), lokal vorhandene Bilder ebenfalls;",
	"nur das Logo wird aus der URL neu geladen.",
];

const ANLEITUNG_WORKSPACE_TAIL = [
	"Das ist der vollständige Arbeitsbereich (Sicherung), nicht die Vorlage für eine einzelne Bewerbung.",
	'Bilder und Dokumente liegen als data:-URL (Base64) unter "bilder", arbeitsproben[].bild.base64 und dokumente[].base64.',
	"Zuordnungen laufen über die Indizes in bewerbungen[] und die sichtbaren Namen — es gibt keine IDs.",
];

export interface ApplicationInput {
	job: JobData;
	shared: SharedData;
	cv: CvData;
	samples: WorkSample[];
	documents: ExtraDocument[];
	/** Logo source URL, or null when the logo came from a local file. */
	logoUrl: string | null;
	logoName: string | null;
	photoName: string | null;
	signatureName: string | null;
	/** Whether an uploaded PDF is present, and the name it will be attached as. */
	documentHasFile: (id: string) => boolean;
	documentFileName: (doc: ExtraDocument) => string;
	/** Present only for the workspace export. */
	logoBase64?: string | null;
	photoBase64?: string | null;
	signatureBase64?: string | null;
	sampleBase64?: Record<string, string>;
	documentBase64?: Record<string, string>;
	/** Derived data the UI shows. */
	preview: {
		mail: { an: string; betreff: string; text: string; anhaenge: string[] };
		anschreiben: { anrede: string | null; text: string; grussformel: string; name: string };
	};
}

/**
 * The global work-sample pool.
 *
 * The per-application switch lives in `applicationNode().auswahl`, not here —
 * repeating it per sample is exactly the redundancy that made the application
 * export hard to read.
 */
function sampleNodes(
	samples: WorkSample[],
	sampleBase64?: Record<string, string>,
): SampleNode[] {
	return samples.map((s) => {
		const ref: JsonFileRef = {
			vorhanden: !!s.image,
			name: s.image ?? null,
		};
		if (sampleBase64 && s.id) {
			const b64 = sampleBase64[s.id];
			if (b64) ref.base64 = b64;
		}
		return {
			titel: field("Titel", s.title),
			beschreibung: field("Beschreibung", s.description),
			link: field("Link (optional)", s.link ?? ""),
			bild: ref,
		};
	});
}

function documentNodes(
	documents: ExtraDocument[],
	hasFile: (id: string) => boolean,
	fileName: (doc: ExtraDocument) => string,
	documentBase64?: Record<string, string>,
): DocumentNode[] {
	return documents.map((d) => {
		const node: DocumentNode = {
			name: field("Name (z. B. Zeugnis Abitur)", d.name),
			dateiname: fileName(d),
			vorhanden: hasFile(d.id),
		};
		if (documentBase64) {
			const b64 = documentBase64[d.id];
			if (b64) node.base64 = b64;
		}
		return node;
	});
}

/** The CV with every value described. Global — the per-job filter is separate. */
export function cvNode(cv: CvData): CvNode {
	return {
		fuehrerschein: field(
			"Führerschein (z. B. Klasse B)",
			cv.fuehrerschein,
			'Erscheint im Lebenslauf nur, wenn in der Bewerbung "Führerschein anzeigen" aktiv ist.',
		),
		abschnitte: cv.sections.map((s) => ({
			titel: field("Abschnittstitel", s.title),
			eintraege: s.entries.map((e) => ({
				titel: field("Titel (z. B. Software-Entwickler)", e.title),
				ort: field("Ort", e.location),
				zeitraum: field("Zeitraum (z. B. Juni 2021 - März 2026)", e.date),
				firma: field("Firma / Beschreibung", e.description),
				details: field("Details", e.details, 'Zeile mit "- " = Aufzählung, *Wort* = fett'),
			})),
			kenntnisse: s.skills.map((g) => ({
				kategorie: field("Kategorie (z. B. Sprachen)", g.category),
				werte: field("Werte", g.values, "Ein Wert pro Zeile, *Wert* = fett"),
			})),
		})),
	};
}

/** Stammdaten: the personal data both documents share. */
export function sharedNode(shared: SharedData): Record<string, JsonField<string>> {
	return {
		vorname: field("Vorname", shared.firstname),
		nachname: field("Nachname", shared.lastname),
		email: field("E-Mail", shared.email),
		telefon: field("Telefon", shared.phone),
		adresse: field("Adresse", shared.address),
		signaturName: field("Signatur-Name", shared.signatureName, "Steht unter der Grußformel."),
		gehalt: field("Gehaltsvorstellung (bei 40h/Woche)", shared.gehalt),
		einstiegArt: field(
			"Frühestmöglicher Einstiegstermin",
			shared.einstiegArt,
			'"datum" = festes Datum in einstiegDatum (YYYY-MM-DD), "monate" = Anzahl Monate in einstiegMonate.',
		),
		einstiegDatum: field("Einstieg als Datum (YYYY-MM-DD)", shared.einstiegDatum),
		einstiegMonate: field("Einstieg in Monaten", shared.einstiegMonate),
	};
}

/**
 * Statische Daten: collected prompt material. Never rendered into a PDF, but
 * part of the workspace export because it cannot be regenerated.
 */
export function staticNode(sd: StaticData): Record<string, JsonField<string>> {
	return {
		erfahrung: field(
			"Erfahrung & Kenntnisse",
			sd.erfahrung,
			"Nur Referenzmaterial für die KI — wird in kein PDF gerendert.",
		),
		antrieb: field(
			"Was mich antreibt",
			sd.antrieb,
			"Nur Referenzmaterial für die KI — wird in kein PDF gerendert.",
		),
		arbeitsprobenHinweis: field(
			"Hinweis über den Proben",
			sd.samplesDisclaimer,
			"Erscheint als Hinweiszeile über den Arbeitsproben im Anschreiben.",
		),
	};
}

/**
 * The per-job filter expressed **by text** — the form `applyFilters` consumes.
 *
 * Text, not ids, is the only stable currency here: a re-import rebuilds the CV
 * (and therefore all ids), so an id-based filter would silently stop matching.
 */
export function filterAsText(
	job: JobData,
	cv: CvData,
	samples: WorkSample[],
): Pick<ParsedApplication, "hiddenSkills" | "hiddenValues" | "hiddenSampleTitles"> {
	return {
		hiddenSkills: cv.sections.flatMap((s) =>
			s.skills
				.filter((g) => g.id && job.hiddenSkillIds.includes(g.id))
				.map((g) => ({ bereich: s.title, kategorie: g.category })),
		),
		hiddenValues: cv.sections.flatMap((s) =>
			s.skills.flatMap((g) =>
				skillLines(g.values)
					.filter((v) => job.hiddenSkillValues.includes(skillValueKey(g.id, v)))
					.map((v) => ({ bereich: s.title, kategorie: g.category, wert: v })),
			),
		),
		hiddenSampleTitles: samples
			.filter((s) => s.id && job.hiddenSampleIds.includes(s.id))
			.map((s) => s.title),
	};
}

export const AUSWAHL_HINWEIS =
	"Was in DIESEM Lebenslauf ausgeblendet ist. Alles, was hier NICHT steht, ist eingeschaltet. Die Zuordnung passiert beim Import über die Texte (Abschnitt/Kategorie/Wert bzw. Probentitel), nicht über IDs — Umbenennen setzt die Auswahl für den Eintrag zurück.";

/**
 * One application.
 *
 * `withImages` adds the logo bytes; only the workspace export sets it. The
 * CV content and the work-sample pool are NOT repeated here — they are global
 * Stammdaten, and an AI filling in a single prompt only has to write what is
 * actually per-application.
 */
function applicationNode(input: ApplicationInput, withImages = false) {
	const { job, samples, logoUrl, logoName } = input;
	const filter = filterAsText(job, input.cv, samples);
	const logo: JsonFileRef = {
		vorhanden: !!logoName,
		name: logoName,
		url: logoUrl,
	};
	if (withImages) logo.base64 = input.logoBase64 ?? null;
	return {
		felder: {
			firma: field("Firmenname", job.firma),
			rolle: field(
				"Rolle in der Firma",
				job.rolle,
				'Bestimmt die Überschrift "Bewerbung als <Rolle>" in Anschreiben und E-Mail-Betreff.',
			),
			stellenLink: field("Stellen-Link (URL)", job.link),
			firmenEmail: field(
				"E-Mail (optional)",
				job.email,
				"Empfänger der Bewerbungs-Mail. Ohne E-Mail-Adresse gibt es keine Mail-Vorschau und keinen Versand.",
			),
			emailText: field(
				"E-Mail-Text",
				job.emailText,
				"Anrede und Gruß kommen automatisch dazu",
			),
			ansprechpartner: field(
				"Ansprechpartner (Anrede im Anschreiben)",
				job.ansprechpartner,
				'Leer = "Sehr geehrte MitarbeiterInnen von <Firmenname>,"',
			),
			anrede: field(
				"Anrede",
				job.anrede,
				'frau = "Sehr geehrte Frau …", herr = "Sehr geehrter Herr …", divers = "Guten Tag …"',
			),
			akzentfarbe: field(
				"Akzentfarbe (aus Logo)",
				job.accentColor,
				"Hex #rrggbb. Färbt Überschriften und Linien in Anschreiben und Lebenslauf.",
			),
			firmenlogo: field(
				"Firmenlogo",
				logo,
				"Nur die URL, keine Bilddaten. Wird eine URL gesetzt, lädt die App das Bild von dort.",
			),
			stellenausschreibung: field(
				"Stellenausschreibungstext",
				job.adText,
				"Nur Referenzmaterial für die KI — wird in kein PDF gerendert.",
			),
			motivation: field(
				"Warum diese Firma? Was gefällt dir? (nur Notizen)",
				job.motivation,
				"Nur Notizen für die KI — wird in kein PDF gerendert.",
			),
			status: field("Status", job.status, "Entwurf | In Bearbeitung | Verschickt"),
		},
		anschreiben: {
			text: field("Text", job.letter.body, "Leerzeile = neuer Absatz"),
			grussformel: field("Grußformel", job.letter.closing),
		},
		auswahl: {
			hinweis: AUSWAHL_HINWEIS,
			fuehrerschein: field(
				"Führerschein anzeigen",
				job.fuehrerschein,
				"Blendet den Führerschein aus dem globalen Lebenslauf in dieser Bewerbung ein oder aus.",
			),
			ausgeschalteteArbeitsproben: filter.hiddenSampleTitles,
			ausgeschalteteKenntnisse: filter.hiddenSkills,
			ausgeschalteteWerte: filter.hiddenValues,
		},
	};
}

/**
 * The two texts the application produces, so a reader sees the result without
 * running the app. Purely derived: ignored on import.
 */
function previewNode(input: ApplicationInput): PreviewNode {
	return {
		hinweis:
			"Abgeleitet — so sieht das Ergebnis aus. Wird beim Import ignoriert; maßgeblich sind die value-Felder oben.",
		mail: input.preview.mail,
		anschreiben: input.preview.anschreiben,
	};
}

/**
 * The opened application — a fill-in template for one prompt.
 *
 * No CV content and no work-sample pool: both are global Stammdaten and only
 * their switch state matters per application (`bewerbung.auswahl`). No image
 * bytes either, except the logo as a URL an AI can actually write.
 */
export function buildApplicationJson(input: ApplicationInput): ApplicationDoc {
	return {
		format: JSON_FORMAT,
		version: JSON_VERSION,
		art: "bewerbung",
		exportiert: new Date().toISOString(),
		anleitung: [...ANLEITUNG_HEAD, ...ANLEITUNG_APP_TAIL],
		bewerbung: applicationNode(input),
		stammdaten: sharedNode(input.shared),
		dokumente: documentNodes(
			input.documents,
			input.documentHasFile,
			input.documentFileName,
			input.documentBase64,
		),
		vorschau: previewNode(input),
	};
}

/** The whole workspace, same format, with every file as base64. */
export function buildWorkspaceJson(
	inputs: ApplicationInput[],
	activeJobId: string,
	view: string,
	staticTab: string,
	staticData: StaticData,
	documentNames: (doc: ExtraDocument) => string,
	documentHasFile: (id: string) => boolean,
): WorkspaceDoc {
	const first = inputs[0];
	const activeIndex = Math.max(
		0,
		inputs.findIndex((i) => i.job.id === activeJobId),
	);
	return {
		format: JSON_FORMAT,
		version: JSON_VERSION,
		art: "arbeitsbereich",
		exportiert: new Date().toISOString(),
		anleitung: [...ANLEITUNG_HEAD, ...ANLEITUNG_WORKSPACE_TAIL],
		aktiveBewerbung: activeIndex,
		bewerbungen: inputs.map((i) => applicationNode(i, true)),
		stammdaten: sharedNode(first.shared),
		lebenslauf: cvNode(first.cv),
		dokumente: documentNodes(first.documents, documentHasFile, documentNames, first.documentBase64),
		statischeDaten: staticNode(staticData),
		arbeitsproben: sampleNodes(first.samples, first.sampleBase64),
		bilder: {
			hinweis:
				"Bilddaten als data:-URL (Base64). Nur in diesem Export — der Bewerbungs-Export enthält keine Bilddaten.",
			foto: { vorhanden: !!first.photoBase64, name: first.photoName, base64: first.photoBase64 ?? null },
			unterschrift: {
				vorhanden: !!first.signatureBase64,
				name: first.signatureName,
				base64: first.signatureBase64 ?? null,
			},
		},
		oberflaeche: { ansicht: view, statischeDatenReiter: staticTab },
	};
}

/** Only the CV, in the same language as the other exports. */
export function buildCvJson(cv: CvData): CvDoc {
	return {
		format: JSON_FORMAT,
		version: JSON_VERSION,
		art: "lebenslauf",
		exportiert: new Date().toISOString(),
		anleitung: [
			...ANLEITUNG_HEAD,
			"Nur der Lebenslauf (global, gilt für alle Bewerbungen). Was pro Bewerbung ein-/ausgeschaltet ist, steht im Bewerbungs-Export unter bewerbung.auswahl.",
		],
		lebenslauf: cvNode(cv),
	};
}

// ---------------------------------------------------------------------------
// import — reading a document back
// ---------------------------------------------------------------------------

/**
 * One application read back from JSON.
 *
 * The switch state arrives as text (`hidden*`) and is turned into the app's
 * id-based arrays by `applyFilters` — against the *live* CV and sample pool,
 * which the file deliberately does not carry.
 */
export interface ParsedApplication {
	job: Partial<JobData> & { id: string };
	letter: LetterData;
	hiddenSampleTitles: string[];
	hiddenSkills: { bereich: string; kategorie: string }[];
	hiddenValues: { bereich: string; kategorie: string; wert: string }[];
	shared: SharedData | null;
	logoUrl: string | null;
	logoName: string | null;
	logoBase64: string | null;
}

/** True when this looks like a cv-meister document of any art. */
export function isAppJson(v: unknown): v is AnyDoc {
	if (!v || typeof v !== "object") return false;
	const d = v as Partial<Envelope> & { art?: unknown };
	return d.format === JSON_FORMAT && d.version === JSON_VERSION && typeof d.art === "string";
}

export function readArt(v: unknown): JsonArt | null {
	return isAppJson(v) ? (v as AnyDoc).art : null;
}

function readSharedNode(node: unknown, fallback: SharedData): SharedData {
	if (!node || typeof node !== "object") return fallback;
	const n = node as Record<string, unknown>;
	return {
		firstname: readString(n.vorname, fallback.firstname),
		lastname: readString(n.nachname, fallback.lastname),
		email: readString(n.email, fallback.email),
		phone: readString(n.telefon, fallback.phone),
		address: readString(n.adresse, fallback.address),
		signatureName: readString(n.signaturName, fallback.signatureName),
		accentColor: fallback.accentColor,
		gehalt: readString(n.gehalt, fallback.gehalt),
		einstiegArt: readOneOf(n.einstiegArt, ["datum", "monate"] as const, fallback.einstiegArt),
		einstiegDatum: readString(n.einstiegDatum, fallback.einstiegDatum),
		einstiegMonate: readString(n.einstiegMonate, fallback.einstiegMonate),
	};
}

function readStaticNode(node: unknown, fallback: StaticData): StaticData {
	if (!node || typeof node !== "object") return fallback;
	const n = node as Record<string, unknown>;
	return {
		erfahrung: readString(n.erfahrung, fallback.erfahrung),
		antrieb: readString(n.antrieb, fallback.antrieb),
		samplesDisclaimer: readString(n.arbeitsprobenHinweis, fallback.samplesDisclaimer),
	};
}

/**
 * The extra-PDF list of any document art, as plain `{ id, name }`.
 *
 * Fresh ids are handed out: the format carries none, and the uploaded bytes
 * travel as base64 instead. `dateiname` is the attachment name the file was
 * saved under — used only when `name` is empty.
 */
export function readDocumentList(doc: { dokumente?: DocumentNode[] }): ExtraDocument[] {
	return (Array.isArray(doc.dokumente) ? doc.dokumente : []).map((d, i) => {
		const name = readString(d.name) || readString(d.dateiname).replace(/\.pdf$/i, "");
		return { id: `doc-${i}`, name };
	});
}

function readCvSection(node: unknown): CvSection {
	const n = (node ?? {}) as Record<string, unknown>;
	const entries = Array.isArray(n.eintraege) ? n.eintraege : [];
	const groups = Array.isArray(n.kenntnisse) ? n.kenntnisse : [];
	return {
		title: readString(n.titel),
		entries: entries.map((raw): CvEntry => {
			const e = (raw ?? {}) as Record<string, unknown>;
			return {
				title: readString(e.titel),
				location: readString(e.ort),
				date: readString(e.zeitraum),
				description: readString(e.firma),
				details: readString(e.details),
			};
		}),
		skills: groups.map((raw) => {
			const g = (raw ?? {}) as Record<string, unknown>;
			return { category: readString(g.kategorie), values: readString(g.werte) };
		}),
	};
}

function readCvNode(node: unknown): CvData | null {
	if (!node || typeof node !== "object") return null;
	const n = node as Record<string, unknown>;
	if (!Array.isArray(n.abschnitte)) return null;
	return ensureCvIds({
		fuehrerschein: readString(n.fuehrerschein),
		sections: n.abschnitte.map(readCvSection),
	});
}

/**
 * The global work-sample pool.
 *
 * Samples get fresh ids (`s0`, `s1`, …) — the format has none, samples are
 * matched by title. Images travel as base64 keyed by that fresh id, which is
 * only produced by the workspace export.
 */
function readSamples(node: unknown): { samples: WorkSample[]; base64: Record<string, string> } {
	const list = Array.isArray(node) ? node : [];
	const samples: WorkSample[] = [];
	const base64: Record<string, string> = {};
	list.forEach((raw, i) => {
		const n = (raw ?? {}) as Record<string, unknown>;
		const bild = readFileRef(n.bild);
		const id = `s${i}`;
		samples.push({
			id,
			title: readString(n.titel),
			description: readString(n.beschreibung),
			link: readString(n.link),
			image: bild.name ?? undefined,
		});
		if (bild.base64) base64[id] = bild.base64;
	});
	return { samples, base64 };
}

/** Reads one application node (shared by both document arts). */
export function readApplicationNode(node: unknown, fallbackJobId: string): ParsedApplication | null {
	if (!node || typeof node !== "object") return null;
	const n = node as Record<string, unknown>;
	const felder = (n.felder ?? {}) as Record<string, unknown>;
	const anschreiben = (n.anschreiben ?? {}) as Record<string, unknown>;
	// `lebenslaufFilter` is the pre-3.0 name of `auswahl`; both are accepted.
	const auswahl = (n.auswahl ?? n.lebenslaufFilter ?? {}) as Record<string, unknown>;

	const logo = readFileRef(felder.firmenlogo);

	const job: Partial<JobData> & { id: string } = {
		// No id in the file: the caller keeps the application's own id.
		id: fallbackJobId,
		firma: readString(felder.firma),
		rolle: readString(felder.rolle),
		link: readString(felder.stellenLink),
		email: readString(felder.firmenEmail),
		emailText: readString(felder.emailText),
		ansprechpartner: readString(felder.ansprechpartner),
		anrede: readOneOf(felder.anrede, ANREDE, "frau"),
		accentColor: readString(felder.akzentfarbe, "#4d3e1d"),
		adText: readString(felder.stellenausschreibung),
		motivation: readString(felder.motivation),
		status: readOneOf(felder.status, JOB_STATUS, "Entwurf"),
		letter: {
			body: readString(anschreiben.text),
			closing: readString(anschreiben.grussformel, "Mit freundlichen Grüßen"),
		},
		hiddenSkillIds: [],
		hiddenSkillValues: [],
		hiddenSampleIds: [],
		fuehrerschein: readBool(auswahl.fuehrerschein, false),
	};

	// Both the current and the legacy key names are read.
	const sampleTitles = auswahl.ausgeschalteteArbeitsproben ?? auswahl.ausgeblendeteProben;
	const skillEntries = auswahl.ausgeschalteteKenntnisse ?? auswahl.ausgeblendeteKenntnisse;
	const valueEntries = auswahl.ausgeschalteteWerte ?? auswahl.ausgeblendeteWerte;

	const hiddenSampleTitles = Array.isArray(sampleTitles)
		? sampleTitles.filter((t): t is string => typeof t === "string")
		: [];
	const hiddenSkills = Array.isArray(skillEntries)
		? (skillEntries as Record<string, unknown>[]).map((e) => ({
				bereich: readString(e.bereich),
				kategorie: readString(e.kategorie),
			}))
		: [];
	const hiddenValues = Array.isArray(valueEntries)
		? (valueEntries as Record<string, unknown>[]).map((e) => ({
				bereich: readString(e.bereich),
				kategorie: readString(e.kategorie),
				wert: readString(e.wert),
			}))
		: [];

	return {
		job,
		letter: job.letter as LetterData,
		hiddenSampleTitles,
		hiddenSkills,
		hiddenValues,
		shared: null,
		logoUrl: logo.url,
		logoName: logo.name,
		logoBase64: logo.base64,
	};
}

/**
 * Reads a full "bewerbung" document.
 *
 * `fallbackShared` is the live Stammdaten state: a field that the file does not
 * carry keeps what the app already has, rather than being reset to a placeholder.
 * The CV is not part of this document — it is global and stays untouched.
 */
export function readApplicationJson(
	doc: ApplicationDoc,
	fallbackJobId: string,
	fallbackShared: SharedData,
): ParsedApplication | null {
	const parsed = readApplicationNode(doc.bewerbung, fallbackJobId);
	if (!parsed) return null;
	parsed.shared = readSharedNode(doc.stammdaten, fallbackShared);
	return parsed;
}

export function readCvJson(doc: CvDoc): CvData | null {
	return readCvNode(doc.lebenslauf);
}

export interface ParsedWorkspace {
	jobs: ParsedApplication[];
	/** Index into `jobs` — the file carries no ids. */
	activeIndex: number | null;
	shared: SharedData | null;
	cv: CvData | null;
	view: string | null;
	staticTab: string | null;
	staticData: StaticData | null;
	/** Fresh ids (`doc-0`, `doc-1`, …); the bytes travel as base64. */
	documents: ExtraDocument[];
	documentBase64: Record<string, string>;
	/** Fresh ids (`s0`, `s1`, …); the images travel as base64. */
	samples: WorkSample[];
	sampleBase64: Record<string, string>;
	images: {
		foto: { base64: string | null; name: string | null };
		unterschrift: { base64: string | null; name: string | null };
	};
}

export function readWorkspaceJson(
	doc: WorkspaceDoc,
	fallbackShared: SharedData,
	fallbackStatic: StaticData,
): ParsedWorkspace {
	const jobs = (Array.isArray(doc.bewerbungen) ? doc.bewerbungen : [])
		.map((n, i) => readApplicationNode(n, `import-${i}`))
		.filter((x): x is ParsedApplication => x !== null);

	const pool = readSamples(doc.arbeitsproben);
	const bilder = doc.bilder ?? ({} as WorkspaceDoc["bilder"]);
	const foto = readFileRef(bilder.foto);
	const unterschrift = readFileRef(bilder.unterschrift);

	const documents = readDocumentList(doc);
	const documentBase64: Record<string, string> = {};
	(Array.isArray(doc.dokumente) ? doc.dokumente : []).forEach((d, i) => {
		if (typeof d.base64 === "string" && d.base64) documentBase64[`doc-${i}`] = d.base64;
	});

	const oberflaeche = (doc.oberflaeche ?? {}) as Record<string, unknown>;
	const active = doc.aktiveBewerbung;
	return {
		jobs,
		activeIndex: active >= 0 && active < jobs.length ? active : null,
		shared: readSharedNode(doc.stammdaten, fallbackShared),
		cv: readCvNode(doc.lebenslauf),
		view: typeof oberflaeche.ansicht === "string" ? oberflaeche.ansicht : null,
		staticTab: typeof oberflaeche.statischeDatenReiter === "string" ? oberflaeche.statischeDatenReiter : null,
		staticData: readStaticNode(doc.statischeDaten, fallbackStatic),
		documents,
		documentBase64,
		samples: pool.samples,
		sampleBase64: pool.base64,
		images: {
			foto: { base64: foto.base64, name: foto.name },
			unterschrift: { base64: unterschrift.base64, name: unterschrift.name },
		},
	};
}

/**
 * Applies a parsed application onto a CV and sample list by text, rebuilding
 * the per-job filter arrays. Anything that no longer exists is skipped.
 */
export function applyFilters(
	job: JobData,
	cv: CvData,
	samples: WorkSample[],
	parsed: Pick<ParsedApplication, "hiddenSkills" | "hiddenValues" | "hiddenSampleTitles">,
): void {
	job.hiddenSkillIds = [];
	job.hiddenSkillValues = [];
	job.hiddenSampleIds = [];

	for (const { bereich, kategorie } of parsed.hiddenSkills) {
		for (const s of cv.sections) {
			if (s.title !== bereich) continue;
			for (const g of s.skills) {
				if (g.category === kategorie && g.id) job.hiddenSkillIds.push(g.id);
			}
		}
	}
	for (const { bereich, kategorie, wert } of parsed.hiddenValues) {
		for (const s of cv.sections) {
			if (s.title !== bereich) continue;
			for (const g of s.skills) {
				if (g.category !== kategorie) continue;
				if (!skillLines(g.values).includes(wert)) continue;
				job.hiddenSkillValues.push(skillValueKey(g.id, wert));
			}
		}
	}
	for (const title of parsed.hiddenSampleTitles) {
		for (const s of samples) {
			if (s.title === title && s.id) job.hiddenSampleIds.push(s.id);
		}
	}
}
