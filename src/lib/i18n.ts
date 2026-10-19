/**
 * Minimal translation system for CV Meister.
 *
 * All UI text lives here in one place. The active language is stored in
 * SharedData.language and resolved at runtime via $derived in the page.
 *
 * Adding a language means adding a record to TRANSLATIONS. No other file
 * needs to change.
 */

export type Language = "de" | "en";

export const DEFAULT_LANGUAGE: Language = "de";

export const LANGUAGE_LABELS: Record<Language, string> = {
	de: "Deutsch",
	en: "English",
};

interface TranslationDict {
	// Tabs
	"tab.stammdaten": string;
	"tab.lebenslauf": string;
	"tab.erfahrung": string;
	"tab.proben": string;
	"tab.pdf": string;
	"tab.bewerbung": string;
	"tab.anschreiben": string;
	"tab.mail": string;
	"tab.einstellungen": string;

	// Stammdaten fields
	"field.vorname": string;
	"field.nachname": string;
	"field.email": string;
	"field.telefon": string;
	"field.adresse": string;
	"field.signaturName": string;
	"field.gehalt": string;
	"field.einstiegArt": string;
	"field.einstiegDatum": string;
	"field.einstiegMonate": string;
	"field.akzentfarbe": string;
	"field.sprache": string;

	// Buttons / Actions
	"btn.jsonKopieren": string;
	"btn.jsonImportieren": string;
	"btn.downloadJson": string;
	"btn.kopiert": string;
	"btn.speichern": string;
	"btn.zuruecksetzen": string;
	"btn.neu": string;
	"btn.loeschen": string;
	"btn.bearbeiten": string;
	"btn.abbrechen": string;
	"btn.uebernehmen": string;

	// Labels
	"label.deutsch": string;
	"label.englisch": string;
	"label.personalien": string;
	"label.kontakt": string;
	"label.einstieg": string;
	"label.anschreiben": string;
	"label.motivation": string;
	"label.stellenLink": string;
	"label.firmenname": string;
	"label.rolle": string;
	"label.status": string;
	"label.anrede": string;
	"label.ansprechpartner": string;
	"label.emailText": string;
	"label.grussformel": string;

	// Status
	"status.entwurf": string;
	"status.inBearbeitung": string;
	"status.verschickt": string;

	// Anrede
	"anrede.frau": string;
	"anrede.herr": string;
	"anrede.divers": string;

	// Errors / Info
	"info.clipboardBlockiert": string;
	"info.jsonNichtLesbar": string;
	"info.keinCvMeisterJson": string;
	"info.nurMittlererTeil": string;

	// Einstieg
	"einstieg.datum": string;
	"einstieg.monate": string;
	"einstieg.sofort": string;
}

const DE: TranslationDict = {
	"tab.stammdaten": "Stammdaten",
	"tab.lebenslauf": "Lebenslauf",
	"tab.erfahrung": "Erfahrung",
	"tab.proben": "Arbeitsproben",
	"tab.pdf": "PDF",
	"tab.bewerbung": "Bewerbung",
	"tab.anschreiben": "Anschreiben",
	"tab.mail": "E-Mail",
	"tab.einstellungen": "Einstellungen",

	"field.vorname": "Vorname",
	"field.nachname": "Nachname",
	"field.email": "E-Mail",
	"field.telefon": "Telefon",
	"field.adresse": "Adresse",
	"field.signaturName": "Signatur-Name",
	"field.gehalt": "Gehaltsvorstellung (bei 40h/Woche)",
	"field.einstiegArt": "Frühestmöglicher Einstiegstermin",
	"field.einstiegDatum": "Einstieg als Datum (YYYY-MM-DD)",
	"field.einstiegMonate": "Einstieg in Monaten",
	"field.akzentfarbe": "Akzentfarbe (aus Logo)",
	"field.sprache": "Sprache",

	"btn.jsonKopieren": "JSON kopieren",
	"btn.jsonImportieren": "JSON importieren",
	"btn.downloadJson": "JSON herunterladen",
	"btn.kopiert": "✓ Kopiert!",
	"btn.speichern": "Speichern",
	"btn.zuruecksetzen": "Zurücksetzen",
	"btn.neu": "Neu",
	"btn.loeschen": "Löschen",
	"btn.bearbeiten": "Bearbeiten",
	"btn.abbrechen": "Abbrechen",
	"btn.uebernehmen": "Übernehmen",

	"label.deutsch": "Deutsch",
	"label.englisch": "Englisch",
	"label.personalien": "Personalien",
	"label.kontakt": "Kontakt",
	"label.einstieg": "Einstieg",
	"label.anschreiben": "Anschreiben",
	"label.motivation": "Warum diese Firma?",
	"label.stellenLink": "Stellen-Link (URL)",
	"label.firmenname": "Firmenname",
	"label.rolle": "Rolle in der Firma",
	"label.status": "Status",
	"label.anrede": "Anrede",
	"label.ansprechpartner": "Ansprechpartner",
	"label.emailText": "E-Mail-Text",
	"label.grussformel": "Grußformel",

	"status.entwurf": "Entwurf",
	"status.inBearbeitung": "In Bearbeitung",
	"status.verschickt": "Verschickt",

	"anrede.frau": "Sehr geehrte Frau",
	"anrede.herr": "Sehr geehrter Herr",
	"anrede.divers": "Guten Tag",

	"info.clipboardBlockiert": "Kopieren fehlgeschlagen (Clipboard blockiert).",
	"info.jsonNichtLesbar": "Die Zwischenablage ist leer — zuerst „JSON kopieren“.",
	"info.keinCvMeisterJson": "Kein cv-meister-JSON in der Zwischenablage.",
	"info.nurMittlererTeil":
		'Nur der MITTLERE Teil der Mail. Anrede und Grußformel werden automatisch ergänzt.',

	"einstieg.datum": "Datum",
	"einstieg.monate": "Monate",
	"einstieg.sofort": "ab sofort",
};

const EN: TranslationDict = {
	"tab.stammdaten": "Personal Data",
	"tab.lebenslauf": "CV",
	"tab.erfahrung": "Experience",
	"tab.proben": "Work Samples",
	"tab.pdf": "PDF",
	"tab.bewerbung": "Application",
	"tab.anschreiben": "Cover Letter",
	"tab.mail": "E-Mail",
	"tab.einstellungen": "Settings",

	"field.vorname": "First Name",
	"field.nachname": "Last Name",
	"field.email": "E-Mail",
	"field.telefon": "Phone",
	"field.adresse": "Address",
	"field.signaturName": "Signature Name",
	"field.gehalt": "Salary Expectation (40h/week)",
	"field.einstiegArt": "Earliest Start Date",
	"field.einstiegDatum": "Start Date (YYYY-MM-DD)",
	"field.einstiegMonate": "Start in Months",
	"field.akzentfarbe": "Accent Color (from logo)",
	"field.sprache": "Language",

	"btn.jsonKopieren": "Copy JSON",
	"btn.jsonImportieren": "Import JSON",
	"btn.downloadJson": "Download JSON",
	"btn.kopiert": "✓ Copied!",
	"btn.speichern": "Save",
	"btn.zuruecksetzen": "Reset",
	"btn.neu": "New",
	"btn.loeschen": "Delete",
	"btn.bearbeiten": "Edit",
	"btn.abbrechen": "Cancel",
	"btn.uebernehmen": "Apply",

	"label.deutsch": "German",
	"label.englisch": "English",
	"label.personalien": "Personal Details",
	"label.kontakt": "Contact",
	"label.einstieg": "Start Date",
	"label.anschreiben": "Cover Letter",
	"label.motivation": "Why this company?",
	"label.stellenLink": "Job Posting URL",
	"label.firmenname": "Company Name",
	"label.rolle": "Role at Company",
	"label.status": "Status",
	"label.anrede": "Salutation",
	"label.ansprechpartner": "Contact Person",
	"label.emailText": "E-Mail Text",
	"label.grussformel": "Closing",

	"status.entwurf": "Draft",
	"status.inBearbeitung": "In Progress",
	"status.verschickt": "Sent",

	"anrede.frau": "Dear Ms.",
	"anrede.herr": "Dear Mr.",
	"anrede.divers": "Dear Sir or Madam",

	"info.clipboardBlockiert": "Copy failed (clipboard blocked).",
	"info.jsonNichtLesbar": "Clipboard empty — first use 'Copy JSON'.",
	"info.keinCvMeisterJson": "No cv-meister JSON in clipboard.",
	"info.nurMittlererTeil":
		"Only the MIDDLE part of the e-mail. Salutation and closing are added automatically.",

	"einstieg.datum": "Date",
	"einstieg.monate": "Months",
	"einstieg.sofort": "immediately",
};

const TRANSLATIONS: Record<Language, TranslationDict> = { de: DE, en: EN };

/**
 * Translate a key into the given language. Missing keys fall back to German.
 */
export function t(key: keyof TranslationDict, lang: Language = "de"): string {
	const dict = TRANSLATIONS[lang] ?? DE;
	return dict[key] ?? DE[key] ?? key;
}

/**
 * Translate a key using the language from SharedData. This is a convenience
 * for use inside Svelte components where `shared.language` is available.
 */
export function tShared(key: keyof TranslationDict, shared: { language?: Language }): string {
	return t(key, shared.language ?? "de");
}

/**
 * Job statuses in the selected language.
 */
export function jobStatus(status: string, lang: Language = "de"): string {
	if (lang === "en") {
		if (status === "Entwurf") return "Draft";
		if (status === "In Bearbeitung") return "In Progress";
		if (status === "Verschickt") return "Sent";
		return status;
	}
	return status;
}

/**
 * Anrede display text in the selected language.
 */
export function anredeLabel(a: "frau" | "herr" | "divers", lang: Language = "de"): string {
	return t(`anrede.${a}` as keyof TranslationDict, lang);
}
