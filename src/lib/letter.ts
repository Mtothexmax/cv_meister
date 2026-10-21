/**
 * Builds the Typst source for a cover letter on top of the vendored
 * `modern-cv-local.typ` template (the same template the reference letters use).
 *
 * The template's `datetime.today()` defaults are unusable in WASM (no clock),
 * so every date is passed in explicitly from here.
 */

export interface WorkSample {
	/** Stable id for per-job filtering. Assigned when created. */
	id?: string;
	title: string;
	description: string;
	/**
	 * English title. A separate field, not a translation — same rule as the
	 * Stammdaten: an English application is not the German one run through a
	 * translator, so both versions are kept and switching never destroys one.
	 */
	titleEn: string;
	/** English description. Empty falls back to the German text. */
	descriptionEn: string;
	/**
	 * Optional external link shown under the description. Deliberately NOT
	 * split per language: it is a URL, and one address serves both versions.
	 */
	link?: string;
	/** File name of a pre-uploaded image in the virtual project, e.g. "sample-1.png". */
	image?: string;
	/**
	 * File name of the English image — the English instance's own picture.
	 * Empty falls back to the German one (same rule as the texts), and
	 * "übernehmen" copies it so the two instances become independent.
	 */
	imageEn?: string;
}

import type { SharedData } from "./shared.js";
import { loc } from "./shared.js";
import type { JobData } from "./job.js";
import type { Language } from "./i18n.js";

export interface LetterData {
	/** Body text; blank lines separate paragraphs. */
	body: string;
	closing: string;

	/**
	 * English body. Only used when the application's language is "en".
	 *
	 * Deliberately a separate field instead of a translation: an English
	 * application is not the German one run through a translator — it is
	 * written again. Keeping both means switching the language never destroys
	 * the other version (same rule as the Stammdaten fields).
	 */
	bodyEn: string;
	/** English closing, e.g. "Sincerely". */
	closingEn: string;
}

export const DEFAULT_LETTER: LetterData = {
	body: `Ich bewerbe mich auf die oben genannte Stelle und möchte mich und meine Motivation in den folgenden Absätzen vorstellen.

Bitte ersetzen Sie diesen Text durch Ihr eigenes Motivationsschreiben. Jede Leerzeile beginnt einen neuen Absatz.`,
	closing: "Mit freundlichen Grüßen",
	bodyEn: "",
	closingEn: "Sincerely",
};

/** Body/closing of a letter in the given language, with a DE fallback. */
export function letterText(data: LetterData, lang: Language): { body: string; closing: string } {
	if (lang === "en") {
		return {
			body: data.bodyEn.trim() ? data.bodyEn : data.body,
			closing: data.closingEn.trim() ? data.closingEn : data.closing,
		};
	}
	return { body: data.body, closing: data.closing };
}

/** Global work-sample pool (edited once, toggled per job). Starts empty. */
export const DEFAULT_SAMPLES: WorkSample[] = [];

/**
 * A work sample's texts in the requested language, falling back to German
 * while the English field is still empty.
 *
 * Only the link is shared: a URL says the same thing in both languages, so
 * everything else (title, description, image) is held twice.
 */
export function sampleText(s: WorkSample, lang: Language): { title: string; description: string } {
	if (lang === "en") {
		return {
			title: s.titleEn?.trim() ? s.titleEn : s.title,
			description: s.descriptionEn?.trim() ? s.descriptionEn : s.description,
		};
	}
	return { title: s.title, description: s.description };
}

/**
 * The "übernehmen" button: copies the OTHER language's instance onto this
 * one — texts and image name alike, so the result is an exact copy and the
 * two instances are independent from then on.
 *
 * Pure: the image bytes live outside the sample (in the per-language file
 * maps), so the caller moves those alongside.
 */
export function takeoverTexts(s: WorkSample, lang: Language): WorkSample {
	if (lang === "en") {
		// English is on screen: the German instance is the source.
		return { ...s, titleEn: s.title, descriptionEn: s.description, imageEn: s.image };
	}
	// German is on screen: the English instance is the source.
	return { ...s, title: s.titleEn, description: s.descriptionEn, image: s.imageEn };
}

/** Escapes a plain string for use inside a Typst string literal. */
export function typstString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

/**
 * Escapes plain text for use as Typst markup content, so user input like
 * `C#`, `a_b` or `*stars*` renders literally instead of breaking the document.
 */
export function typstContent(value: string): string {
	return (
		value
			// Escape markup-significant characters everywhere. `%` starts a
			// line comment in Typst and would swallow the rest of the line
			// (including closing brackets), so it must be escaped too.
			.replace(/\\/g, "\\\\")
			.replace(/([#$\%*_`\[\]])/g, "\\$1")
			// Headings, lists and terms only trigger at line starts.
			.replace(/^(?==)/gm, "\\=")
			.replace(/^(?=[-+]\s)/gm, "\\")
			.replace(/^(\s*\d+\.\s)/gm, "\\$1")
			.replace(/^(?=\/)/gm, "\\")
			.replace(/^(?=@)/gm, "\\@")
			.replace(/^(?=<)/gm, "\\<")
	);
}

/**
 * Builds the letter body paragraphs. The user's text is NEVER modified —
 * it is only escaped (invisibly) so Typst special chars can't break the
 * document. The personal salutation (`greetRaw`) always stands as its own
 * first paragraph when a contact is set; everything after it comes verbatim
 * from the "Text" textarea.
 */
export function letterBodyParagraphs(body: string, greetRaw: string | null): string {
	const paras = body
		.split(/\r?\n\s*\r?\n/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (greetRaw && greetRaw.trim()) {
		paras.unshift(greetRaw.trim());
	}
	return paras.map((p) => typstContent(p)).join("\n\n");
}

/**
 * Builds a Typst date expression in German order (`27.09.2026`).
 *
 * Two things are easy to get wrong here:
 * - A raw `datetime(...)` renders literally as `datetime(year: ...)` text in
 *   the PDF, so it must be formatted with `.display(...)` (which, unlike
 *   `datetime.today()`, needs no clock and works in WASM).
 * - The pattern order is the display order. `[month].[day].[year]` produces the
 *   US `09.27.2026`; German is `[day].[month].[year]`. Typst does not localise
 *   this from `set text(lang: "de")`.
 *
 * Shared by the Anschreiben and the Lebenslauf so both documents agree.
 */
export function typstDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
	const expr = m
		? `datetime(year: ${Number(m[1])}, month: ${Number(m[2])}, day: ${Number(m[3])})`
		: `datetime(year: 2000, month: 1, day: 1)`;
	return `${expr}.display("[day].[month].[year]")`;
}

/**
 * The letter heading: "Bewerbung als <Rolle>" / "Application for <role>".
 */
export function bewerbungTitel(rolle: string, lang: Language = "de"): string {
	const r = rolle.trim();
	if (lang === "en") return r ? `Application for ${r}` : "Application";
	return r ? `Bewerbung als ${r}` : "Bewerbung";
}

/**
 * Role line under the applicant name: trailing parentheticals are stripped,
 * e.g. "Software Developer (w/m/d)" becomes "Software Developer".
 */
export function cleanRole(rolle: string): string {
	return rolle.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * The surname out of a free-text contact: "Max Mustermann" → "Mustermann".
 *
 * Three normalisations, all on the input side only:
 * - a leading Herr/Frau is dropped, because the salutation adds its own
 *   ("Herr Herr Müller" would otherwise be possible),
 * - of several words the LAST one wins — in a name written the usual way that is
 *   the surname, and the salutation wants exactly that,
 * - a trailing title/degree is dropped, so "Max Mustermann M.Sc." does not greet
 *   "Frau M.Sc.". Parenthesised additions ("(M.Sc.)") go the same way.
 */
export function contactSurname(raw: string): string {
	const words = raw
		.trim()
		// German and English honorifics alike, so a contact typed as
		// "Ms. Jane Doe" greets "Dear Ms. Doe" and not "Dear Ms. Ms.".
		.replace(/^(Herrn?|Frau|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "")
		.replace(/\([^)]*\)/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	while (words.length > 1 && /\.$/.test(words[words.length - 1])) words.pop();
	return words.length ? words[words.length - 1] : "";
}

/**
 * Personal salutation from contact + gender toggle.
 *
 * German: "Sehr geehrte Frau X," / "Sehr geehrter Herr X," / "Guten Tag X,"
 * English: "Dear Ms. X," / "Dear Mr. X," / "Dear X,"
 *
 * Only the surname is used — see `contactSurname()`. Fallback when no contact
 * is the company's hiring team, in the application's own language. Returns
 * null only when neither contact nor firm name are available.
 */
export function contactGreeting(job: JobData): string | null {
	const contactName = contactSurname(job.ansprechpartner);
	const isEn = job.language === "en";
	if (!contactName) {
		const firma = job.firma.trim();
		if (!firma) return null;
		return isEn ? `Dear Hiring Team at ${firma},` : `Sehr geehrte MitarbeiterInnen von ${firma},`;
	}
	if (isEn) {
		if (job.anrede === "herr") return `Dear Mr. ${contactName},`;
		if (job.anrede === "divers") return `Dear ${contactName},`;
		return `Dear Ms. ${contactName},`;
	}
	if (job.anrede === "herr") return `Sehr geehrter Herr ${contactName},`;
	if (job.anrede === "divers") return `Guten Tag ${contactName},`;
	return `Sehr geehrte Frau ${contactName},`;
}

/**
 * Full e-mail body: salutation + mail text + closing/signature.
 * The mail textarea only edits the middle part.
 */
export function composeMailBody(
	shared: SharedData,
	job: JobData,
	letter: LetterData,
): string {
	const parts: string[] = [];
	const greet = contactGreeting(job);
	if (greet) parts.push(greet);
	if (job.emailText.trim()) parts.push(job.emailText.trim());
	// Closing + name belong directly together (single line break, no blank line).
	const text = letterText(letter, job.language);
	const signoff = [text.closing.trim(), loc(shared, "signatureName", job.language).trim()]
		.filter(Boolean)
		.join("\n");
	if (signoff) parts.push(signoff);
	return parts.join("\n\n");
}

/**
 * Today's date as `YYYY-MM-DD`, computed in JavaScript (which has a clock).
 * The Typst WASM compiler has no clock (`datetime.today()` is unusable), so
 * the letter always uses this instead of a user-editable date field.
 */
export function todayISO(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Falls back to a dark olive when the color picker value is not a hex color. */
export function safeAccentColor(value: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#4d3e1d";
}

function renderWorkSamples(samples: WorkSample[], disclaimer: string, lang: Language): string {
	if (samples.length === 0) return "";
	// Each cell is wrapped in `[...]` so the `#block` call sits in content
	// (like the reference letter does). A bare `#block` directly inside the
	// `#grid(...)` argument list would be `#` in code mode and fail with
	// "the character `#` is not valid in code".
	const blocks = samples
		.map((s) => {
			const text = sampleText(s, lang);
			const lines = [
				`  [#block(breakable: false)[`,
				s.image ? `    #image("${s.image}", width: 100%)` : null,
				`    #text(weight: "bold", size: 8pt)[${typstContent(text.title)}]`,
				`    #linebreak()`,
				`    #text(size: 7pt)[${typstContent(text.description)}]`,
				s.link
					? `    #linebreak()\n    #link(${typstString(s.link)})[#text(size: 7pt)[${typstContent(s.link)}]]`
					: null,
				`  ]]`,
			].filter((l): l is string => l !== null);
			return lines.join("\n");
		})
		.join(",\n");

	const note = disclaimer.trim()
		? `#text(size: 7.4pt)[${typstContent(disclaimer.trim())}]\n#v(0.55em)\n`
		: "";

	return `
#pagebreak()

#text(weight: "bold", fill: heading-color, size: 12pt)[${typstContent(
		lang === "en" ? "Selected work samples and side projects" : "Ausgewählte Arbeitsproben und Freizeitprojekte",
	)}]
#v(0.45em)
${note}#set par(justify: false, leading: 0.55em)
#grid(
  columns: (1fr, 1fr),
  gutter: 0.7em,
  row-gutter: 0.8em,
${blocks},
)
`;
}

/**
 * Assembles the full Typst source. Image paths come via opts (never written
 * back into reactive state, so rendering stays side-effect free).
 */
export function buildLetterSource(
	shared: SharedData,
	job: JobData,
	data: LetterData,
	samples: WorkSample[],
	opts: { logoFile?: string; signatureFile?: string; disclaimer?: string },
): string {
	const logo = opts.logoFile
		? `#align(left)[\n  #image("${opts.logoFile}", width: 20%)\n]\n\n#v(1.2em)\n`
		: "";

	// Company name only when there is no logo. Never a "z. Hd." line.
	// The template itself only renders the date, so this is explicit.
	const recipient =
		!opts.logoFile && job.firma.trim()
			? `#text(size: 9pt)[\n  ${typstContent(job.firma.trim())}\n]\n\n`
			: "";

	// Salutation from contact + gender toggle. It always stands as its own
	// first paragraph (with extra space after it); the textarea content
	// follows verbatim.
	const roleLine = cleanRole(job.rolle);
	const greetRaw = contactGreeting(job);
	const greetingBlock = greetRaw ? `${typstContent(greetRaw)}\n\n#v(0.75em)\n` : "";
	const text = letterText(data, job.language);

	// This is inserted into the code arguments of `#stack(...)`, so no `#` prefix.
	const signature = opts.signatureFile
		? `image("${opts.signatureFile}", width: 4cm)`
		: `v(1.2em)`;

	return `#import "modern-cv-local.typ": *

// The fa-version call inside the template module does not propagate to this
// document (proven: icons would resolve FA7 families), so repeat it here.
#fa-version("6")

#let heading-color = rgb(${typstString(safeAccentColor(job.accentColor))})

#show: coverletter.with(
  closing: {
    text()[ ]
  },
  author: (
    firstname: ${typstString(loc(shared, "firstname", job.language))},
    lastname: ${typstString(loc(shared, "lastname", job.language))},
    email: ${typstString(loc(shared, "email", job.language))},
    phone: ${typstString(loc(shared, "phone", job.language))},
    address: ${typstString(loc(shared, "address", job.language))},
    positions: (${roleLine ? `${typstString(roleLine)},` : ""}),
  ),
  profile-picture: box(width: 0pt, height: 0pt),
  accent-color: rgb(heading-color),
  language: ${typstString(job.language)},
  show-footer: false,
)

${logo}${recipient}#hiring-entity-info(
  entity-info: (
    name: ${typstString(job.firma)},
    target: ${typstString(job.ansprechpartner)},
    street-address: "",
    city: "",
  ),
  date: ${typstDate(todayISO())}
)

#letter-heading(job-position: ${typstString(bewerbungTitel(job.rolle, job.language))})

#coverletter-content[
#set text(size: 9.3pt)
#set par(justify: true, leading: 0.55em, first-line-indent: 0pt)
#v(0.25em)
${greetingBlock}${letterBodyParagraphs(text.body, null)}

#v(0.75em)
#v(0.5em)
#align(left)[#stack(
  dir: ttb,
  spacing: 0.2em,
  text[${typstContent(text.closing)}],
  ${signature},
  text(weight: "bold")[${typstContent(loc(shared, "signatureName", job.language))}],
)]
]
${renderWorkSamples(samples, opts.disclaimer ?? "", job.language)}`;
}
