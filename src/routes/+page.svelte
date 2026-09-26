<script lang="ts">
	import { onMount } from "svelte";
	import { compileLetter, compileLetterPdf, compileCv, compileCvPdf } from "$lib/letterCompiler";
	import { DEFAULT_LETTER, DEFAULT_SAMPLES, bewerbungTitel, composeMailBody, contactGreeting, safeAccentColor, type LetterData, type WorkSample } from "$lib/letter";
	import { DEFAULT_CV, ensureCvIds, skillLines, skillValueKey, type CvData } from "$lib/cv";
	import { DEFAULT_SHARED, einstiegText, nid, type SharedData } from "$lib/shared";
	import {
		DEFAULT_DOCUMENTS,
		DEFAULT_STATIC,
		ensureDocumentIds,
		type ExtraDocument,
		type StaticData,
	} from "$lib/static";
	import {
		blobToDataUrl,
		dataUrlToFile,
		imageFilenameFromUrl,
		sniffImage,
	} from "$lib/binary";
	import {
		JSON_VERSION,
		applyFilters,
		buildApplicationJson,
		buildCvJson,
		buildWorkspaceJson,
		filterAsText,
		isAppJson,
		readApplicationJson,
		readArt,
		readCvJson,
		readWorkspaceJson,
		type AnyDoc,
		type ApplicationDoc,
		type ApplicationInput,
		type WorkspaceDoc,
	} from "$lib/appJson";
	import { DEFAULT_JOBS, createJob, type JobData, type JobStatus } from "$lib/job";
	import { extractAccentColor } from "$lib/colors";
	import { buildMotivationPrompt, buildCoverPrompt, buildMailPrompt } from "$lib/prompt";
	import { requestGoogleToken, sendGmail, type MailAttachment } from "$lib/gmail";
	import { loadState, saveState, type PersistedState } from "$lib/storage";
	import Landing from "$lib/Landing.svelte";

	type View = "dashboard" | "detail" | "static";
	type StaticTab = "stammdaten" | "lebenslauf" | "erfahrung" | "proben" | "pdf";

	const staticTabs: { id: StaticTab; label: string }[] = [
		{ id: "stammdaten", label: "Stammdaten" },
		{ id: "lebenslauf", label: "Lebenslauf" },
		{ id: "erfahrung", label: "Erfahrung" },
		{ id: "proben", label: "Arbeitsproben" },
		{ id: "pdf", label: "PDF" },
	];

	/**
	 * Single source of truth for "is this a tab we still know about" — used for
	 * both the persisted state and the JSON import. A dropped/renamed tab id
	 * falls back to Stammdaten instead of rendering an empty pane.
	 */
	function isStaticTab(v: unknown): v is StaticTab {
		return typeof v === "string" && staticTabs.some((t) => t.id === v);
	}

	let view = $state<View>("dashboard");
	let shared = $state<SharedData>(structuredClone(DEFAULT_SHARED));
	let jobs = $state<JobData[]>(structuredClone(DEFAULT_JOBS));
	let cv = $state<CvData>(ensureCvIds(structuredClone(DEFAULT_CV)));
	let samples = $state<WorkSample[]>(structuredClone(DEFAULT_SAMPLES));
	/** Extra PDFs attached to every application (Statische Daten → PDF). */
	let documents = $state<ExtraDocument[]>(structuredClone(DEFAULT_DOCUMENTS));
	let staticData = $state<StaticData>(structuredClone(DEFAULT_STATIC));
	let staticTab = $state<StaticTab>("stammdaten");
	let activeJobId = $state<string>("");
	let activeJob = $derived(jobs.find((j) => j.id === activeJobId) ?? jobs[0]);
	let photoFile = $state<File | null>(null);
	/** Signature image (global, from Stammdaten). */
	let signatureFile = $state<File | null>(null);
	/** Sample images by sample id (global pool). */
	let sampleFiles = $state<Record<string, File>>({});
	/** Uploaded PDFs by document id (global pool, attached to every mail). */
	let documentFiles = $state<Record<string, File>>({});

	interface JobFiles {
		logo: File | null;
		/**
		 * Set only when the logo was loaded from a URL ("URL wählen" or a JSON
		 * import). `logo` then holds the fetched bytes; this is the origin, and
		 * it is what the application JSON exports instead of image data.
		 */
		logoUrl: string | null;
	}

	let jobFiles = $state<Record<string, JobFiles>>({});

	function filesFor(id: string): JobFiles {
		let f = jobFiles[id];
		if (!f) {
			f = { logo: null, logoUrl: null };
			jobFiles[id] = f;
		}
		return f;
	}

	let pages = $state<string[]>([]);
	let warnings = $state<string[]>([]);
	let error = $state("");
	let rendering = $state(false);
	let busy = $state<string | null>(null);
	let sending = $state(false);
	let sendStatus = $state<{ ok: boolean; message: string } | null>(null);
	let ready = $state(false);
	let previewCollapsed = $state(false);
	let backupOpen = $state(false);
	let stagedBackup = $state<{ name: string; data: WorkspaceDoc } | null>(null);
	/** Two-step confirm for "reset workspace to placeholder defaults". */
	let confirmReset = $state(false);
	/**
	 * An application JSON read from the clipboard, waiting for the "replace the
	 * open application" confirmation. Nothing is touched until the user
	 * confirms — importing rewrites the application's fields and its switch
	 * state.
	 */
	let stagedAppImport = $state<{ quelle: string; doc: ApplicationDoc } | null>(null);
	let appImportError = $state("");
	let appJsonCopied = $state(false);
	let appJsonTimer: ReturnType<typeof setTimeout> | undefined;
	/** URL prompt for "URL wählen" next to the logo picker. */
	let logoUrlOpen = $state(false);
	let logoUrlInput = $state("");
	let logoUrlBusy = $state(false);
	type PreviewDoc = "letter" | "cv" | "mail";
	let previewDoc = $state<PreviewDoc>("letter");
	let mailAvailable = $derived(activeJob.emailText.trim().length > 0);
	let lastSaved = $state("");
	let hydrated = false;
	let mailCopied = $state(false);
	let mailTimer: ReturnType<typeof setTimeout> | undefined;
	let promptCopied = $state(false);
	let promptTimer: ReturnType<typeof setTimeout> | undefined;
	let coverCopied = $state(false);
	let coverTimer: ReturnType<typeof setTimeout> | undefined;
	let mailPromptCopied = $state(false);
	let mailPromptTimer: ReturnType<typeof setTimeout> | undefined;
	let cvCopied = $state(false);
	let cvCopyTimer: ReturnType<typeof setTimeout> | undefined;
	let cvImportError = $state("");
	let logoNote = $state("");

	// --- Landing page / editor routing -------------------------------------
	// The whole app is one route. "/" (or "#start") shows the marketing
	// landing page, "#editor" shows the editor — so the editor can be
	// bookmarked and shared as a direct link.
	/** True while "#editor" (also accepts "#/editor") is in the URL. */
	let editorActive = $state(false);
	/** Hydration promise, shared by the landing and the editor. */
	let hydratePromise: Promise<void> | null = null;
	/** Set once the first PDF compile was kicked off. */
	let editorRendered = false;
	/** Job-ad URL handed over from the landing page, applied after hydrate. */
	let pendingJobLink: string | null = null;

	function wantsEditor(): boolean {
		return /^#\/?editor\b/i.test(window.location.hash);
	}

	/**
	 * Loads the stored workspace exactly once. Both routes need it, and the
	 * landing should not pay for the Typst compile — only for the (cheap)
	 * IndexedDB read, so switching to the editor feels instant.
	 */
	function ensureHydrated(): Promise<void> {
		if (!hydratePromise) {
			hydratePromise = (async () => {
				await hydrate();
				hydrated = true;
			})();
		}
		return hydratePromise;
	}

	/** Starts the editor (idempotent): hydrate, then compile the preview once. */
	async function startEditor() {
		await ensureHydrated();
		if (pendingJobLink) {
			applyPendingJobLink(); // selectJob() already triggers a render
			return;
		}
		if (editorRendered) return;
		editorRendered = true;
		render();
	}

	/** Turns a handed-over Stellen-Link into a fresh Bewerbung. */
	function applyPendingJobLink() {
		const link = pendingJobLink;
		pendingJobLink = null;
		if (!link) return;
		const job = createJob({ link, status: "Entwurf" });
		jobs.unshift(job);
		filesFor(job.id);
		selectJob(job.id);
	}

	/** Landing page → editor. Optionally carries a pasted job-ad URL. */
	function startFromLanding(link?: string) {
		if (link) pendingJobLink = link;
		editorActive = true;
		if (wantsEditor()) void startEditor();
		else window.location.hash = "editor";
	}

	/** Reacts to hash changes (back/forward, in-page anchors, CTAs). */
	function syncRoute() {
		const next = wantsEditor();
		editorActive = next;
		if (next) void startEditor();
	}

	let renderToken = 0;
	let renderCount = $state(0);

	// --- Debug log (render loop diagnosis) ---
	// NOTE: dlog must not read any $state (callers would subscribe to it
	// and self-invalidate). Plain buffer + tick counter only.
	let debugOn = $state(false);
	let debugOnPlain = false;
	let logBuf: string[] = [];
	let debugLines = $state<string[]>([]);
	function dlog(msg: string) {
		const now = new Date();
		const t =
			now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
			"." +
			String(now.getMilliseconds()).padStart(3, "0");
		// Always mirror to the console (no reactivity involved).
		console.log(`[dbg] ${t} ${msg}`);
		if (!debugOnPlain) return;
		logBuf = [...logBuf.slice(-99), `${t} ${msg}`];
		debugLines = logBuf;
	}

	function setDebug(v: boolean) {
		debugOn = v;
		debugOnPlain = v;
		if (!v) {
			logBuf = [];
			debugLines = [];
		}
	}

	/** Compares pages ignoring Typst's random per-compile SVG ids. */
	function samePages(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		const norm = (p: string) => p.replace(/(url\(#[cg]|id="[cg])[0-9A-Fa-f]{16,}/g, "$1X");
		return a.every((p, i) => norm(p) === norm(b[i]));
	}
	async function render() {
		const token = ++renderToken;
		renderCount++;
		dlog(`render #${renderCount} start [${previewDoc}]`);
		rendering = true;
		error = "";
		try {
			const job = activeJob;
			if (previewDoc === "mail") {
				// Mail preview needs no compilation.
				if (token !== renderToken) return;
				pages = [];
				warnings = [];
				ready = true;
				dlog(`render #${renderCount} done (mail)`);
				return;
			}
			const jf = jobFiles[job.id];
			const result =
				previewDoc === "cv"
					? await compileCv(shared, job, cv, photoFile)
					: await compileLetter(
							shared,
							job,
							job.letter,
							samples,
							{
								logo: jf?.logo ?? null,
								signature: signatureFile,
								sampleFiles,
							},
							staticData.samplesDisclaimer,
						);
			if (token !== renderToken) return;
			// Only touch the DOM when content actually changed (avoids flicker).
			const changed = !samePages(result.pages, pages);
			if (changed) pages = result.pages;
			warnings = result.warnings;
			ready = true;
			dlog(`render #${renderCount} done pages=${result.pages.length} changed=${changed}`);
		} catch (e) {
			if (token !== renderToken) return;
			const diags =
				(e as { diagnostics?: { formatted: string }[] })?.diagnostics ??
				(e as { cause?: { cause?: { payload?: { diagnostics?: { formatted: string }[] } } } })
					?.cause?.cause?.payload?.diagnostics ??
				[];
			error = diags.length
				? diags.map((d) => d.formatted).join("\n")
				: e instanceof Error
					? e.message
					: String(e);
			dlog(`render #${renderCount} ERROR ${error.slice(0, 80)}`);
		} finally {
			if (token === renderToken) rendering = false;
		}
	}

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	function scheduleRender() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(render, 400);
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	/** Snapshot of everything worth persisting. Uses $state.snapshot() because
	 * raw $state proxies cannot pass structured serialization (IndexedDB). */
	function collectState(): PersistedState {
		const logos: Record<string, Blob | null> = {};
		const logoUrls: Record<string, string | null> = {};
		for (const [id, f] of Object.entries(jobFiles)) {
			logos[id] = f.logo;
			logoUrls[id] = f.logoUrl;
		}
		const snap = $state.snapshot({
			shared,
			jobs,
			cv,
			samples,
			documents,
			staticData,
			files: {
				photo: photoFile,
				signature: signatureFile,
				samples: { ...sampleFiles },
				documents: { ...documentFiles },
				logos,
				logoUrls,
			},
		});
		return {
			version: 1,
			savedAt: new Date().toISOString(),
			shared: snap.shared,
			jobs: snap.jobs,
			cv: snap.cv,
			samples: snap.samples,
			documents: snap.documents,
			staticData: snap.staticData,
			activeJobId,
			view,
			staticTab,
			files: snap.files,
		};
	}

	let saveError = $state("");

	async function flushSave(): Promise<void> {
		if (!hydrated) return;
		clearTimeout(saveTimer);
		try {
			const ok = await saveState(collectState());
			if (ok) {
				saveError = "";
				lastSaved = new Date().toLocaleTimeString("de-DE", {
					hour: "2-digit",
					minute: "2-digit",
				});
			} else {
				saveError = "Speichern fehlgeschlagen";
			}
		} catch (e) {
			saveError = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
		}
	}

	function scheduleSave() {
		if (!hydrated) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void flushSave();
		}, 500);
	}

	function fmtSavedAt(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
		} catch {
			return "";
		}
	}

	async function hydrate() {
		try {
			const s = await loadState();
			if (!s) return;
			if (s.shared && typeof s.shared === "object") shared = s.shared as SharedData;
			if (typeof shared.gehalt !== "string") shared.gehalt = "";
			if (shared.einstiegArt !== "datum" && shared.einstiegArt !== "monate")
				shared.einstiegArt = "monate";
			if (typeof shared.einstiegDatum !== "string") shared.einstiegDatum = "";
			if (typeof shared.einstiegMonate !== "string") shared.einstiegMonate = "2";
			if (Array.isArray(s.jobs) && s.jobs.length > 0) {
				jobs = s.jobs as JobData[];
				for (const j of jobs) {
					if (!j.letter) j.letter = structuredClone(DEFAULT_LETTER);
					if (!Array.isArray(j.hiddenSkillIds)) j.hiddenSkillIds = [];
					if (!Array.isArray(j.hiddenSampleIds)) j.hiddenSampleIds = [];
					if (!Array.isArray(j.hiddenSkillValues)) j.hiddenSkillValues = [];
					if (typeof j.emailText !== "string") j.emailText = "";
					if (typeof j.motivation !== "string") j.motivation = "";
					if (typeof j.adText !== "string") j.adText = "";
					if (typeof j.link !== "string") j.link = "";
					if (typeof j.rolle !== "string") j.rolle = "";
					if (j.anrede !== "frau" && j.anrede !== "herr" && j.anrede !== "divers")
						j.anrede = "frau";
					if (typeof j.accentColor !== "string") j.accentColor = "#4d3e1d";
					if (typeof j.fuehrerschein !== "boolean") j.fuehrerschein = false;
				}
			}
			if (s.cv && typeof s.cv === "object") cv = ensureCvIds(s.cv as CvData);
			if (Array.isArray(s.samples)) samples = s.samples as WorkSample[];
			if (Array.isArray(s.documents)) documents = ensureDocumentIds(s.documents as ExtraDocument[]);
			if (s.staticData && typeof s.staticData === "object")
				staticData = s.staticData as StaticData;
			if (typeof staticData.samplesDisclaimer !== "string")
				staticData.samplesDisclaimer = structuredClone(DEFAULT_STATIC).samplesDisclaimer;
			if (typeof s.activeJobId === "string" && jobs.some((j) => j.id === s.activeJobId))
				activeJobId = s.activeJobId;
			if (s.view === "dashboard" || s.view === "detail" || s.view === "static") view = s.view;
			if (isStaticTab(s.staticTab)) staticTab = s.staticTab;
			const f = s.files;
			if (f && typeof f === "object") {
				if (f.photo instanceof Blob) photoFile = f.photo as File;
				if (f.signature instanceof Blob) signatureFile = f.signature as File;
				if (f.samples && typeof f.samples === "object") {
					for (const [k, v] of Object.entries(f.samples)) {
						if (v instanceof Blob) sampleFiles[k] = v as File;
					}
				}
				if (f.documents && typeof f.documents === "object") {
					for (const [k, v] of Object.entries(f.documents)) {
						if (v instanceof Blob) documentFiles[k] = v as File;
					}
				}
				if (f.logos && typeof f.logos === "object") {
					for (const [id, v] of Object.entries(f.logos)) {
						if (v instanceof Blob) filesFor(id).logo = v as File;
					}
				}
				if (f.logoUrls && typeof f.logoUrls === "object") {
					for (const [id, v] of Object.entries(f.logoUrls)) {
						if (typeof v === "string" && v) filesFor(id).logoUrl = v;
					}
				}
			}
			if (typeof s.savedAt === "string" && s.savedAt) lastSaved = fmtSavedAt(s.savedAt);
		} catch {
			/* keep defaults */
		}
	}

	function switchView(v: View) {
		dlog(`ui switchView ${v}`);
		view = v;
		previewDoc = v === "static" && staticTab === "lebenslauf" ? "cv" : "letter";
		render();
	}

	function selectPreview(d: PreviewDoc) {
		if (d === "mail" && !mailAvailable) return;
		dlog(`ui selectPreview ${d}`);
		previewDoc = d;
		render();
	}

	function selectJob(id: string) {
		dlog(`ui selectJob ${id.slice(-4)}`);
		activeJobId = id;
		view = "detail";
		logoNote = "";
		render();
	}

	function downloadBlob(pdf: Uint8Array, filename: string, mime = "application/pdf") {
		// Copy into a fresh buffer so the Blob owns plain ArrayBuffer bytes.
		const blob = new Blob([pdf.slice().buffer as ArrayBuffer], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// --- Self-describing JSON (format lives in $lib/appJson.ts) --------------
	// One format for all three exports: Bewerbung, Arbeitsbereich, Lebenslauf.
	// Every editable value is wrapped as { label, _comment, info, value } so the
	// file explains itself and an AI can edit it without knowing the app.
	//
	// Bewerbung and Lebenslauf go through the CLIPBOARD both ways — the whole
	// point is copy → paste into a prompt → paste the answer back. Only the
	// Arbeitsbereich (the full backup, with every image as base64) is a file.

	/** Downloads a document as pretty-printed JSON. */
	function downloadJson(doc: unknown, filename: string): void {
		downloadBlob(
			new TextEncoder().encode(JSON.stringify(doc, null, 2)),
			filename,
			"application/json",
		);
	}

	/**
	 * The cv-meister document currently in the clipboard, validated.
	 *
	 * Every failure mode gets its own message: an unreadable clipboard, an empty
	 * one, a plain-text answer an AI forgot to wrap in a code block, and a JSON
	 * that is not ours are four very different mistakes.
	 *
	 * The envelope check lives in here on purpose: the return type is `AnyDoc`,
	 * not `unknown`, so a caller that forgets the `await` gets a compile error
	 * (`doc.art` on a Promise) instead of a confusing "not a cv-meister JSON".
	 */
	async function parseClipboardJson(kind: string): Promise<AnyDoc> {
		let raw = "";
		try {
			raw = await navigator.clipboard.readText();
		} catch {
			throw new Error("Zwischenablage nicht lesbar (Zugriff verweigert).");
		}
		if (!raw.trim()) {
			throw new Error(`Die Zwischenablage ist leer — zuerst „JSON kopieren“ (${kind}).`);
		}
		let data: unknown;
		try {
			data = JSON.parse(raw);
		} catch {
			throw new Error("Der Inhalt der Zwischenablage ist kein JSON.");
		}
		if (!isAppJson(data)) {
			throw new Error(
				`Kein cv-meister-JSON in der Zwischenablage (format/version ${JSON_VERSION} erwartet).`,
			);
		}
		return data;
	}

	/** Name tag used in export file names: applicant, else firm, else generic. */
	function jsonTag(job: JobData | null = null): string {
		const name = `${shared.firstname} ${shared.lastname}`.trim();
		return name || job?.firma.trim() || "cv-meister";
	}

	function jsonFilename(kind: string, job: JobData | null = null): string {
		const day = new Date().toISOString().slice(0, 10);
		return `${kind} ${jsonTag(job)} ${day}.json`;
	}

	/**
	 * Everything the JSON builders need, read from live state.
	 *
	 * `withBase64` is the single difference between the exports: the
	 * application export references images by name (and the logo by URL) so the
	 * file stays hand-editable, the workspace export carries their bytes.
	 */
	async function jsonInput(job: JobData, withBase64: boolean): Promise<ApplicationInput> {
		const files = jobFiles[job.id];
		const input: ApplicationInput = {
			job,
			shared,
			cv,
			samples,
			documents,
			logoUrl: files?.logoUrl ?? null,
			logoName: files?.logo?.name ?? null,
			photoName: photoFile?.name ?? null,
			signatureName: signatureFile?.name ?? null,
			documentHasFile: (id) => !!documentFiles[id],
			documentFileName: documentFilename,
			preview: {
				mail: {
					an: job.email.trim(),
					betreff: bewerbungTitel(job.rolle),
					text: composeMailBody(shared, job, job.letter),
					anhaenge: mailAttachments(job).map((a) => a.name),
				},
				anschreiben: {
					anrede: contactGreeting(job),
					text: job.letter.body,
					grussformel: job.letter.closing,
					name: shared.signatureName,
				},
			},
		};
		if (!withBase64) return input;
		input.logoBase64 = files?.logo ? await blobToDataUrl(files.logo) : null;
		input.photoBase64 = photoFile ? await blobToDataUrl(photoFile) : null;
		input.signatureBase64 = signatureFile ? await blobToDataUrl(signatureFile) : null;
		input.sampleBase64 = {};
		for (const [id, f] of Object.entries(sampleFiles)) {
			input.sampleBase64[id] = await blobToDataUrl(f);
		}
		input.documentBase64 = {};
		for (const [id, f] of Object.entries(documentFiles)) {
			input.documentBase64[id] = await blobToDataUrl(f);
		}
		return input;
	}

	/**
	 * Copies the open application to the clipboard.
	 *
	 * That is the intended flow: paste the JSON into a prompt, let an AI fill in
	 * the empty `value` fields, paste it back into the import dialog. No image
	 * bytes travel — the logo is a URL an AI can actually write.
	 */
	async function copyApplicationJson(): Promise<void> {
		error = "";
		try {
			const payload = JSON.stringify(
				buildApplicationJson(await jsonInput(activeJob, false)),
				null,
				2,
			);
			await navigator.clipboard.writeText(payload);
			appJsonCopied = true;
			clearTimeout(appJsonTimer);
			appJsonTimer = setTimeout(() => (appJsonCopied = false), 1500);
		} catch {
			error = "Kopieren fehlgeschlagen (Clipboard blockiert).";
		}
	}

	/**
	 * Reads an application JSON from the clipboard — the counterpart to
	 * "JSON kopieren". No file picker: copy, paste into a prompt, paste the
	 * answer back, import.
	 *
	 * Nothing is applied yet: the document is only staged, and the confirm
	 * dialog does the replacing.
	 */
	async function importApplicationJson(): Promise<void> {
		appImportError = "";
		error = "";
		try {
			const doc = await parseClipboardJson("Bewerbung");
			if (doc.art !== "bewerbung") {
				throw new Error(`Erwartet wird eine einzelne Bewerbung, gefunden: "${doc.art}".`);
			}
			stagedAppImport = { quelle: "Zwischenablage", doc };
		} catch (e) {
			error = e instanceof Error ? e.message : "Zwischenablage konnte nicht gelesen werden.";
		}
	}

	/**
	 * Replaces the open application with the staged file.
	 *
	 * Only what belongs to *this* application is touched: its fields, the
	 * Anschreiben and its switch state. The CV, the work-sample pool and the
	 * extra-PDF list are global and stay as they are — the file deliberately
	 * carries no CV content, no sample data and no document bytes.
	 *
	 * The switch state travels as text (section/category/value, sample titles),
	 * so it is resolved against the live CV and sample pool by `applyFilters`.
	 */
	function applyApplicationImport(): void {
		const staged = stagedAppImport;
		if (!staged) return;
		const job = activeJob;
		const parsed = readApplicationJson(staged.doc, job.id, shared);
		if (!parsed) {
			appImportError = "Die Datei enthält keine Bewerbung.";
			return;
		}
		appImportError = "";
		stagedAppImport = null;

		if (parsed.shared) shared = parsed.shared;

		Object.assign(job, { ...job, ...parsed.job, id: job.id, letter: parsed.letter });
		applyFilters(job, cv, samples, parsed);

		filesFor(job.id).logoUrl = parsed.logoUrl;
		if (parsed.logoUrl) {
			logoNote = "Logo wird von der URL geladen …";
			void loadLogoFromUrl(parsed.logoUrl, job);
		} else {
			logoNote = "";
		}

		view = "detail";
		render();
		scheduleSave();
	}

	/** Loads a logo from a URL and stores the bytes as the job's logo file. */
	async function loadLogoFromUrl(url: string, job: JobData, quiet = false): Promise<void> {
		const target = filesFor(job.id);
		try {
			const res = await fetch(url, { mode: "cors", credentials: "omit" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			// Validate the bytes, not the Content-Type header: a page URL returns
			// HTML, which Typst would hand to its SVG parser and fail on with a
			// message about `<head>` and `<link>`. Nothing is stored on failure,
			// so a previously loaded logo survives a bad attempt.
			const bytes = new Uint8Array(await res.arrayBuffer());
			const kind = sniffImage(bytes);
			if (!kind) {
				const type = res.headers.get("content-type")?.split(";")[0].trim() || "unbekannt";
				throw new Error(
					`kein Bild — die URL liefert ${type}. Bitte einen direkten Link zur ` +
						"Bilddatei verwenden (PNG, JPG, GIF, WebP, SVG).",
				);
			}
			const file = new File([bytes], imageFilenameFromUrl(url, kind.ext), {
				type: kind.mime,
			});
			target.logo = file;
			target.logoUrl = url;
			const color = await extractAccentColor(file);
			if (!quiet) {
				logoNote = color
					? `Logo von der URL geladen, Farbe ${color} übernommen.`
					: "Logo von der URL geladen — keine Farbe gefunden.";
			}
			if (color) job.accentColor = color;
		} catch (e) {
			// A failure is always reported, even on a quiet (JSON-import) load —
			// otherwise the note stays on "wird geladen …" forever.
			logoNote = `Logo-URL nicht ladbar: ${e instanceof Error ? e.message : String(e)}`;
		}
		render();
		scheduleSave();
	}

	function openLogoUrl() {
		logoUrlInput = filesFor(activeJob.id).logoUrl ?? "";
		logoUrlOpen = true;
	}

	async function applyLogoUrl(): Promise<void> {
		const url = logoUrlInput.trim();
		if (!url) return;
		logoUrlBusy = true;
		logoNote = "Logo wird geladen …";
		await loadLogoFromUrl(url, activeJob);
		logoUrlBusy = false;
		logoUrlOpen = false;
	}

	function docFilename(kind: "Motivationsschreiben" | "Lebenslauf", job: JobData): string {
		const tag =
			`${shared.firstname} ${shared.lastname}`.trim() || job.firma.trim() || "dokument";
		return `${kind} ${tag}.pdf`;
	}

	function emlFilename(job: JobData): string {
		const tag =
			`${shared.firstname} ${shared.lastname}`.trim() || job.firma.trim() || "dokument";
		return `Bewerbung ${tag}.eml`;
	}

	async function copyMailText() {
		try {
			await navigator.clipboard.writeText(composeMailBody(shared, activeJob, activeJob.letter));
			mailCopied = true;
			clearTimeout(mailTimer);
			mailTimer = setTimeout(() => (mailCopied = false), 1500);
		} catch {
			error = "Kopieren nicht möglich (Clipboard blockiert).";
		}
	}

	async function copyMotivationPrompt() {
		const prompt = buildMotivationPrompt({
			firma: activeJob.firma,
			rolle: activeJob.rolle,
			antrieb: staticData.antrieb,
		});
		try {
			await navigator.clipboard.writeText(prompt);
			promptCopied = true;
			clearTimeout(promptTimer);
			promptTimer = setTimeout(() => (promptCopied = false), 1500);
		} catch {
			error = "Kopieren nicht möglich (Clipboard blockiert).";
		}
	}

	async function copyCoverPrompt() {
		const prompt = buildCoverPrompt({
			firma: activeJob.firma,
			rolle: activeJob.rolle,
			adText: activeJob.adText,
			erfahrung: staticData.erfahrung,
			antrieb: staticData.antrieb,
			motivation: activeJob.motivation,
			gehalt: shared.gehalt ? `${shared.gehalt} bei 40h` : "",
			einstieg: einstiegText(shared),
		});
		try {
			await navigator.clipboard.writeText(prompt);
			coverCopied = true;
			clearTimeout(coverTimer);
			coverTimer = setTimeout(() => (coverCopied = false), 1500);
		} catch {
			error = "Kopieren nicht möglich (Clipboard blockiert).";
		}
	}

	async function copyMailPrompt() {
		const prompt = buildMailPrompt({
			firma: activeJob.firma,
			rolle: activeJob.rolle,
			link: activeJob.link,
		});
		try {
			await navigator.clipboard.writeText(prompt);
			mailPromptCopied = true;
			clearTimeout(mailPromptTimer);
			mailPromptTimer = setTimeout(() => (mailPromptCopied = false), 1500);
		} catch {
			error = "Kopieren nicht möglich (Clipboard blockiert).";
		}
	}

	async function copyCvJson() {
		try {
			const payload = JSON.stringify(buildCvJson($state.snapshot(cv)), null, 2);
			await navigator.clipboard.writeText(payload);
			cvCopied = true;
			clearTimeout(cvCopyTimer);
			cvCopyTimer = setTimeout(() => (cvCopied = false), 1500);
		} catch {
			error = "Kopieren fehlgeschlagen (Clipboard blockiert).";
		}
	}

	/**
	 * Reads a CV JSON from the clipboard — the counterpart to "JSON kopieren".
	 *
	 * No file picker: the workflow is copy → paste into a prompt → paste the
	 * answer back. The new CV gets fresh section/group ids, so every job's
	 * switch state has to be re-resolved by text, or it would silently stop
	 * matching.
	 */
	async function importCvJson(): Promise<void> {
		cvImportError = "";
		try {
			const doc = await parseClipboardJson("Lebenslauf");
			if (doc.art !== "lebenslauf") {
				throw new Error(`Erwartet wird ein Lebenslauf-Export, gefunden: "${doc.art}".`);
			}
			const next = readCvJson(doc);
			if (!next) throw new Error("Fehlendes Feld: abschnitte");
			const filtersByJob = new Map(
				jobs.map((j) => [j.id, filterAsText(j, cv, samples)] as const),
			);
			cv = next;
			for (const j of jobs) {
				const saved = filtersByJob.get(j.id);
				if (saved) applyFilters(j, cv, samples, saved);
			}
			scheduleRender();
		} catch (e) {
			cvImportError = e instanceof Error ? e.message : "Import fehlgeschlagen";
		}
	}

	async function downloadLetterPdf(job: JobData) {
		const key = `${job.id}:letter`;
		busy = key;
		error = "";
		try {
			const jf = jobFiles[job.id];
			const pdf = await compileLetterPdf(
				shared,
				job,
				job.letter,
				samples,
				{
					logo: jf?.logo ?? null,
					signature: signatureFile,
					sampleFiles,
				},
				staticData.samplesDisclaimer,
			);
			downloadBlob(pdf, docFilename("Motivationsschreiben", job));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (busy === key) busy = null;
		}
	}

	async function downloadCvPdf(job: JobData) {
		const key = `${job.id}:cv`;
		busy = key;
		error = "";
		try {
			const pdf = await compileCvPdf(shared, job, cv, photoFile);
			downloadBlob(pdf, docFilename("Lebenslauf", job));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (busy === key) busy = null;
		}
	}

	/** Compiles both PDFs for a job (sequential: one shared compiler instance). */
	async function compileBothPdfs(job: JobData): Promise<{ letterPdf: Uint8Array; cvPdf: Uint8Array }> {
		const jf = jobFiles[job.id];
		const assets = { logo: jf?.logo ?? null, signature: signatureFile, sampleFiles };
		const letterPdf = await compileLetterPdf(
			shared,
			job,
			job.letter,
			samples,
			assets,
			staticData.samplesDisclaimer,
		);
		const cvPdf = await compileCvPdf(shared, job, cv, photoFile);
		return { letterPdf, cvPdf };
	}

	/**
	 * Which PDF is attached to the application e-mail: one of the two generated
	 * documents, or an uploaded extra PDF (`doc:<document id>`).
	 */
	type MailAttKind = "letter" | "cv" | `doc:${string}`;

	/** Prefix that turns a document id into a `MailAttKind`. */
	const DOC_PREFIX = "doc:";

	function docKind(id: string): MailAttKind {
		return `${DOC_PREFIX}${id}`;
	}

	function docIdOf(kind: MailAttKind): string {
		return kind.slice(DOC_PREFIX.length);
	}

	/** Busy key while one attachment action runs. */
	function attKey(kind: MailAttKind, action: "open" | "download"): string {
		return `${activeJob.id}:att-${action}-${kind}`;
	}

	/**
	 * The picker is not the only way a document can arrive (JSON import), so
	 * anything that is not a PDF is rejected rather than attached under a
	 * wrong MIME type.
	 */
	function isPdf(file: File): boolean {
		return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
	}

	/**
	 * Attachment file name of an extra document: the edited name, normalised to
	 * a single `.pdf` suffix so "Zeugnis" and "Zeugnis.pdf" both come out right.
	 * Path separators are stripped — they would corrupt the MIME header.
	 */
	function documentFilename(doc: ExtraDocument): string {
		const base = doc.name
			.trim()
			.replace(/\.pdf$/i, "")
			.replace(/[\\/:*?"<>|]+/g, "-")
			.trim();
		return `${base || "Dokument"}.pdf`;
	}

	/** File name of one mail attachment. */
	function attFilename(kind: MailAttKind, job: JobData): string {
		if (kind === "letter") return docFilename("Motivationsschreiben", job);
		if (kind === "cv") return docFilename("Lebenslauf", job);
		const doc = documents.find((d) => d.id === docIdOf(kind));
		return doc ? documentFilename(doc) : "Dokument.pdf";
	}

	/**
	 * Every PDF attached to the application mail: the two generated documents
	 * plus the uploaded extra PDFs, with their sizes. `size` is null for the
	 * generated ones until the background computation has finished.
	 */
	function mailAttachments(
		job: JobData = activeJob,
	): { kind: MailAttKind; name: string; size: number | null }[] {
		// Sizes are only measured for the open application; elsewhere the name is
		// what matters (the JSON export lists attachment names).
		const sizes = job.id === activeJob.id ? mailSizes : { letter: null, cv: null };
		const list: { kind: MailAttKind; name: string; size: number | null }[] = [
			{ kind: "letter", name: attFilename("letter", job), size: sizes.letter },
			{ kind: "cv", name: attFilename("cv", job), size: sizes.cv },
		];
		for (const doc of documents) {
			// A row without a file has nothing to attach; the PDF tab says so.
			const file = doc.id ? documentFiles[doc.id] : undefined;
			if (!file) continue;
			list.push({ kind: docKind(doc.id), name: documentFilename(doc), size: file.size });
		}
		return list;
	}

	/** Bytes of one uploaded document — no compilation involved. */
	async function readDocumentBytes(id: string): Promise<Uint8Array> {
		const file = documentFiles[id];
		if (!file) throw new Error("Für dieses Dokument ist keine PDF-Datei hinterlegt.");
		return new Uint8Array(await file.arrayBuffer());
	}

	/** Produces the single PDF behind one mail attachment. */
	function compileAttachment(kind: MailAttKind, job: JobData): Promise<Uint8Array> {
		if (kind === "letter") {
			const jf = jobFiles[job.id];
			return compileLetterPdf(
				shared,
				job,
				job.letter,
				samples,
				{ logo: jf?.logo ?? null, signature: signatureFile, sampleFiles },
				staticData.samplesDisclaimer,
			);
		}
		if (kind === "cv") return compileCvPdf(shared, job, cv, photoFile);
		return readDocumentBytes(docIdOf(kind));
	}

	/** Downloads one attachment of the mail preview. */
	async function downloadAttachment(kind: MailAttKind) {
		const job = activeJob;
		const key = attKey(kind, "download");
		busy = key;
		error = "";
		try {
			const pdf = await compileAttachment(kind, job);
			if (busy !== key) return;
			downloadBlob(pdf, attFilename(kind, job));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (busy === key) busy = null;
		}
	}

	/** Opens one attachment of the mail preview in the current tab. */
	async function openAttachment(kind: MailAttKind) {
		const job = activeJob;
		const key = attKey(kind, "open");
		busy = key;
		error = "";
		try {
			const pdf = await compileAttachment(kind, job);
			if (busy !== key) return;
			const blob = new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" });
			// Same tab: the blob URL must stay alive while the browser replaces
			// this page with its PDF viewer, so it is deliberately not revoked.
			window.location.href = URL.createObjectURL(blob);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (busy === key) busy = null;
		}
	}

	/**
	 * Attachments for an outgoing mail, in order: the two generated PDFs, then
	 * the uploaded extra documents. A document whose file is missing is skipped
	 * rather than failing the whole send — mailAttachments() hides it too.
	 */
	async function mailAttachmentPayloads(job: JobData): Promise<MailAttachment[]> {
		const { letterPdf, cvPdf } = await compileBothPdfs(job);
		const list: MailAttachment[] = [
			{
				filename: docFilename("Motivationsschreiben", job),
				mimeType: "application/pdf",
				bytes: letterPdf,
			},
			{ filename: docFilename("Lebenslauf", job), mimeType: "application/pdf", bytes: cvPdf },
		];
		for (const doc of documents) {
			if (!doc.id || !documentFiles[doc.id]) continue;
			list.push({
				filename: documentFilename(doc),
				mimeType: "application/pdf",
				bytes: await readDocumentBytes(doc.id),
			});
		}
		return list;
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}

	let mailSizes = $state<{ letter: number | null; cv: number | null }>({
		letter: null,
		cv: null,
	});
	let mailSizeToken = 0;
	let mailSizeTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleMailSizes() {
		if (previewDoc !== "mail") return;
		clearTimeout(mailSizeTimer);
		mailSizeTimer = setTimeout(() => {
			void refreshMailSizes();
		}, 1500);
	}

	/** Computes attachment sizes in the background (display only). */
	async function refreshMailSizes() {
		const token = ++mailSizeToken;
		const job = activeJob;
		try {
			const { letterPdf, cvPdf } = await compileBothPdfs(job);
			if (token !== mailSizeToken) return;
			mailSizes = { letter: letterPdf.length, cv: cvPdf.length };
		} catch {
			/* keep old sizes */
		}
	}

	/** Downloads a complete .eml (text + every attachment) for a mail program. */
	async function downloadEml() {
		const job = activeJob;
		const key = `${job.id}:eml`;
		busy = key;
		error = "";
		try {
			const attachments = await mailAttachmentPayloads(job);
			if (busy !== key) return;
			const { buildMimeMessage } = await import("$lib/gmail");
			const mime = buildMimeMessage(
				job.email.trim(),
				bewerbungTitel(job.rolle),
				composeMailBody(shared, job, job.letter),
				attachments,
			);
			downloadBlob(new TextEncoder().encode(mime), emlFilename(job), "message/rfc822");
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (busy === key) busy = null;
		}
	}

	/** Sends every attachment to the company's configured e-mail via the user's Gmail. */
	async function sendViaGmail() {
		const job = activeJob;
		const to = job.email.trim();
		if (!to || sending) return;
		sending = true;
		sendStatus = null;
		error = "";
		try {
			const token = await requestGoogleToken();
			const attachments = await mailAttachmentPayloads(job);
			sendStatus = await sendGmail(
				token,
				to,
				bewerbungTitel(job.rolle),
				composeMailBody(shared, job, job.letter),
				attachments,
			);
		} catch (e) {
			sendStatus = { ok: false, message: e instanceof Error ? e.message : String(e) };
		} finally {
			sending = false;
		}
	}

	// --- Jobs ---

	/**
	 * Downloads the whole workspace in the same format — the only export that
	 * carries image and PDF bytes, because none of them can be regenerated.
	 */
	async function exportWorkspace() {
		error = "";
		try {
			const inputs: ApplicationInput[] = [];
			for (const job of jobs) inputs.push(await jsonInput(job, true));
			const doc = buildWorkspaceJson(
				inputs,
				activeJobId,
				view,
				staticTab,
				staticData,
				documentFilename,
				(id) => !!documentFiles[id],
			);
			downloadJson(doc, jsonFilename("Arbeitsbereich"));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function importBackupFile(files: FileList | null) {
		const f = files?.[0];
		if (!f) return;
		try {
			const data: unknown = JSON.parse(await f.text());
			if (!isAppJson(data)) {
				error = "Keine gültige cv-meister-JSON-Datei.";
				return;
			}
			const art = readArt(data);
			if (art !== "arbeitsbereich") {
				error = `Das ist ein "${art}"-Export. Hier wird ein Arbeitsbereich-Export erwartet.`;
				return;
			}
			stagedBackup = { name: f.name, data: data as WorkspaceDoc };
		} catch {
			error = "Datei konnte nicht gelesen werden.";
		}
	}

	/** Replaces the whole workspace with the staged file (two-step confirm). */
	function applyBackup() {
		const staged = stagedBackup;
		if (!staged) return;
		const p = readWorkspaceJson(staged.data, shared, staticData);

		if (p.shared) shared = p.shared;
		if (p.cv) cv = p.cv;
		if (p.staticData) staticData = p.staticData;

		// The work-sample pool is global and stored once, at the top level.
		samples = p.samples;

		jobs = p.jobs.map((parsed) =>
			createJob({ ...parsed.job, id: parsed.job.id, letter: parsed.letter }),
		);

		// The switch state travels as text, so it can be applied straight onto
		// the new CV and the new sample pool.
		p.jobs.forEach((parsed, i) => {
			const job = jobs[i];
			if (job) applyFilters(job, cv, samples, parsed);
		});

		documents = p.documents;
		documentFiles = {};
		for (const doc of documents) {
			const b64 = p.documentBase64[doc.id];
			if (!b64) continue;
			const file = dataUrlToFile(b64, documentFilename(doc));
			if (file) documentFiles[doc.id] = file;
		}

		photoFile = dataUrlToFile(p.images.foto.base64, p.images.foto.name ?? "profil.png");
		signatureFile = dataUrlToFile(
			p.images.unterschrift.base64,
			p.images.unterschrift.name ?? "unterschrift.png",
		);
		sampleFiles = {};
		for (const [id, b64] of Object.entries(p.sampleBase64)) {
			const file = dataUrlToFile(b64, `probe-${id}.png`);
			if (file) sampleFiles[id] = file;
		}

		jobFiles = {};
		p.jobs.forEach((parsed, i) => {
			const job = jobs[i];
			if (!job) return;
			const jf = filesFor(job.id);
			jf.logoUrl = parsed.logoUrl;
			const file = dataUrlToFile(parsed.logoBase64, parsed.logoName ?? `logo-${job.id}.png`);
			if (file) jf.logo = file;
			// A logo that travelled as a URL only still has to be fetched.
			else if (parsed.logoUrl) void loadLogoFromUrl(parsed.logoUrl, job, true);
		});

		activeJobId =
			p.activeIndex !== null && jobs[p.activeIndex]
				? jobs[p.activeIndex].id
				: (jobs[0]?.id ?? "");
		if (p.view === "dashboard" || p.view === "detail" || p.view === "static") view = p.view;
		if (isStaticTab(p.staticTab)) staticTab = p.staticTab;

		logoNote = "";
		stagedBackup = null;
		backupOpen = false;
		render();
		scheduleSave();
	}

	/**
	 * Wipes the workspace back to the shipped placeholder defaults
	 * (Max Mustermann / Template Firma). This is the only way to get rid of a
	 * persisted state that still contains real data — defaults alone never
	 * overwrite an already-saved state.
	 */
	function resetToPlaceholders() {
		shared = structuredClone(DEFAULT_SHARED);
		jobs = structuredClone(DEFAULT_JOBS);
		cv = ensureCvIds(structuredClone(DEFAULT_CV));
		samples = structuredClone(DEFAULT_SAMPLES);
		documents = structuredClone(DEFAULT_DOCUMENTS);
		staticData = structuredClone(DEFAULT_STATIC);
		activeJobId = jobs[0]?.id ?? "";
		view = "dashboard";
		staticTab = "stammdaten";
		photoFile = null;
		signatureFile = null;
		sampleFiles = {};
		documentFiles = {};
		jobFiles = {};
		logoNote = "";
		error = "";
		sendStatus = null;
		stagedBackup = null;
		confirmReset = false;
		backupOpen = false;
		render();
		scheduleSave();
	}

	/** Creates a blank Bewerbung and jumps straight into its detail view. */
	function addJob() {
		const job = createJob();
		jobs.unshift(job);
		filesFor(job.id);
		selectJob(job.id);
	}

	function removeJob(id: string) {
		if (jobs.length <= 1) return;
		const idx = jobs.findIndex((j) => j.id === id);
		jobs.splice(idx, 1);
		delete jobFiles[id];
		if (activeJobId === id) activeJobId = jobs[Math.min(idx, jobs.length - 1)].id;
		if (view === "detail") render();
		else scheduleRender();
	}

	function markSent() {
		activeJob.status = "Verschickt";
	}

	async function onLogoSelect(files: FileList | null) {
		const picked = files?.[0] ?? null;
		const f = filesFor(activeJob.id);
		if (!picked) {
			f.logo = null;
			f.logoUrl = null;
			logoNote = "";
			render();
			return;
		}
		// Same guard as the URL path: a file that is not really an image would be
		// fed to Typst and fail there with an unrelated message.
		if (!sniffImage(new Uint8Array(await picked.arrayBuffer()))) {
			logoNote = "Keine Bilddatei — bitte PNG, JPG, GIF, WebP oder SVG wählen.";
			render();
			return;
		}
		// A picked file supersedes any URL origin — otherwise the export would
		// claim a URL that no longer describes what is rendered.
		f.logoUrl = null;
		// SVGs are used natively (vector-sharp); rasterization happens only
		// internally for color extraction.
		f.logo = picked;
		logoNote = "";
		// Auto-adopt the dominant logo color (white-filtered), manual picker overrides.
		const color = await extractAccentColor(f.logo);
		if (color) {
			activeJob.accentColor = color;
			logoNote = `Farbe ${color} übernommen.`;
		} else {
			logoNote = "Keine Farbe gefunden — bitte manuell wählen.";
		}
		render();
	}

	// --- Work samples (global pool, toggled per job) ---

	function addSample() {
		samples.push({ id: nid(), title: "Neues Projekt", description: "" });
	}

	function removeSample(id: string | undefined) {
		const i = samples.findIndex((s) => s.id === id);
		if (i >= 0) samples.splice(i, 1);
		if (id) {
			delete sampleFiles[id];
			for (const j of jobs) {
				const k = j.hiddenSampleIds.indexOf(id);
				if (k >= 0) j.hiddenSampleIds.splice(k, 1);
			}
		}
	}

	function onSampleImage(id: string | undefined, files: FileList | null) {
		if (!id) return;
		if (files?.[0]) sampleFiles[id] = files[0];
		else delete sampleFiles[id];
		render();
	}

	function toggleSample(id: string | undefined) {
		if (!id) return;
		const h = activeJob.hiddenSampleIds;
		const i = h.indexOf(id);
		if (i >= 0) h.splice(i, 1);
		else h.push(id);
	}

	function sampleVisible(id: string | undefined): boolean {
		return !id || !activeJob.hiddenSampleIds.includes(id);
	}

	// --- Extra PDFs (global pool, attached to every application) ---

	function addDocument() {
		documents.push({ id: nid(), name: "" });
	}

	function removeDocument(id: string | undefined) {
		const i = documents.findIndex((d) => d.id === id);
		if (i >= 0) documents.splice(i, 1);
		if (id) delete documentFiles[id];
	}

	/**
	 * Picking a PDF. Anything else is refused: it would be attached under the
	 * wrong MIME type and could not be opened from the mail preview.
	 */
	function onDocumentFile(id: string | undefined, files: FileList | null) {
		if (!id) return;
		const file = files?.[0];
		if (!file) {
			delete documentFiles[id];
			return;
		}
		if (!isPdf(file)) {
			error = `„${file.name}“ ist keine PDF-Datei.`;
			return;
		}
		error = "";
		documentFiles[id] = file;
		// Pre-fill the name from the file so the attachment is recognisable in
		// the mail preview; a name the user already typed is left alone.
		const doc = documents.find((d) => d.id === id);
		if (doc && !doc.name.trim()) doc.name = file.name.replace(/\.pdf$/i, "");
	}

	/** A row without a file has nothing to attach — flagged in the PDF tab. */
	function documentReady(id: string | undefined): boolean {
		return !!id && !!documentFiles[id];
	}

	// --- CV helpers (global CV, per-job filter) ---

	function move<T>(arr: T[], i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= arr.length) return;
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}

	function addSection() {
		cv.sections.push({ id: nid(), title: "Neuer Abschnitt", entries: [], skills: [] });
	}

	function removeSection(i: number) {
		cv.sections.splice(i, 1);
		scheduleRender();
	}

	function addEntry(si: number) {
		cv.sections[si].entries.push({ title: "", location: "", date: "", description: "", details: "" });
	}

	function removeEntry(si: number, ei: number) {
		cv.sections[si].entries.splice(ei, 1);
	}

	function addSkill(si: number) {
		cv.sections[si].skills.push({ id: nid(), category: "", values: "" });
	}

	function removeSkill(si: number, gi: number) {
		cv.sections[si].skills.splice(gi, 1);
	}

	function toggleSkill(id: string | undefined) {
		if (!id) return;
		const h = activeJob.hiddenSkillIds;
		const i = h.indexOf(id);
		if (i >= 0) h.splice(i, 1);
		else h.push(id);
	}

	function skillVisible(id: string | undefined): boolean {
		return !id || !activeJob.hiddenSkillIds.includes(id);
	}

	function toggleSkillValue(groupId: string | undefined, value: string) {
		const key = skillValueKey(groupId, value);
		const h = activeJob.hiddenSkillValues;
		const i = h.indexOf(key);
		if (i >= 0) h.splice(i, 1);
		else h.push(key);
	}

	function skillValueVisible(groupId: string | undefined, value: string): boolean {
		return !activeJob.hiddenSkillValues.includes(skillValueKey(groupId, value));
	}

	function initials(name: string): string {
		return (
			name
				.split(/\s+/)
				.map((w) => w[0])
				.join("")
				.substring(0, 2)
				.toUpperCase() || "?"
		);
	}

	function userInitials(): string {
		return (initials(shared.firstname) + initials(shared.lastname)).substring(0, 2) || "?";
	}

	function statusCls(s: JobStatus): string {
		return s === "Verschickt"
			? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
			: s === "In Bearbeitung"
				? "bg-blue-500/20 text-blue-400 border-blue-500/30"
				: "bg-amber-500/20 text-amber-400 border-amber-500/30";
	}

	onMount(() => {
		// Deep link: "#editor" starts the editor straight away, everything else
		// shows the landing page and only hydrates the stored workspace.
		editorActive = wantsEditor();
		if (editorActive) void startEditor();
		else void ensureHydrated();
		window.addEventListener("hashchange", syncRoute);
		document.addEventListener("visibilitychange", handleVisibility);
		window.addEventListener("pagehide", handlePageHide);
		return () => {
			clearTimeout(debounceTimer);
			clearTimeout(mailTimer);
			clearTimeout(promptTimer);
			clearTimeout(coverTimer);
			clearTimeout(mailPromptTimer);
			clearTimeout(saveTimer);
			clearTimeout(mailSizeTimer);
			window.removeEventListener("hashchange", syncRoute);
			document.removeEventListener("visibilitychange", handleVisibility);
			window.removeEventListener("pagehide", handlePageHide);
		};
	});

	// Re-render after any tracked change once the first render is done.
	// Saving is independent of rendering so nothing is lost while the
	// compiler is still loading.
	$effect(() => {
		void JSON.stringify(shared);
		void JSON.stringify(jobs);
		void JSON.stringify(cv);
		void JSON.stringify(samples);
		void JSON.stringify(documents);
		void JSON.stringify(staticData);
		void JSON.stringify(jobFiles);
		// The file maps have to be read here as well: they are otherwise only
		// touched inside collectState(), so picking a file scheduled neither a
		// save nor a re-render and the upload was lost until some other edit.
		void JSON.stringify(sampleFiles);
		void JSON.stringify(documentFiles);
		dlog("effect fired");
		if (ready) scheduleRender();
		scheduleSave();
		if (previewDoc === "mail") scheduleMailSizes();
	});

	function handleVisibility() {
		if (document.visibilityState === "hidden") void flushSave();
	}

	function handlePageHide() {
		void flushSave();
	}

	// Fall back to the letter preview when the mail text is deleted.
	$effect(() => {
		if (previewDoc === "mail" && !mailAvailable) previewDoc = "letter";
	});

	const inputCls =
		"w-full px-2.5 py-1.5 bg-[#0a0f1d] border border-[#1e293b] rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500";
	const labelCls = "block text-[10px] font-semibold text-slate-400 mb-1";
	const cardCls = "bg-[#131b2e] border border-[#1e293b] rounded-lg p-4";
	const hCls = "text-xs font-bold text-slate-200 border-b border-[#1e293b] pb-2";
</script>

<svelte:head>
	<title
		>{editorActive
			? "CV Meister — Bewerbungen"
			: "CV Meister Pro — Bewerbungen automatisiert erstellen"}</title
	>
</svelte:head>

{#if editorActive}
	<div class="min-h-screen bg-[#090d16] text-slate-100 flex h-screen overflow-hidden">
	{#snippet fileButton(
		currentName: string | null,
		onchange: (files: FileList | null) => void,
		accept = "image/*",
		label = "Datei wählen",
	)}
		<div class="flex items-center gap-2">
			<label
				class="cursor-pointer text-xs font-medium px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition shrink-0"
			>
				{label}
				<input
					type="file"
					{accept}
					class="hidden"
					onchange={(e) => {
						onchange(e.currentTarget.files);
						// Reset so picking the same file again still fires `change`.
						e.currentTarget.value = "";
					}}
				/>
			</label>
			<span class="text-[10px] text-slate-500 truncate"
				>{currentName ?? "Keine Datei gewählt"}</span
			>
		</div>
	{/snippet}
	<!-- Sidebar -->
	<aside class="w-60 bg-[#0e1422] border-r border-[#1e293b] flex flex-col justify-between shrink-0 select-none">
		<div>
			<a
				href="#start"
				title="Zurück zur Startseite"
				class="h-14 px-5 border-b border-[#1e293b] flex items-center space-x-2 hover:bg-slate-800/40 transition group"
			>
				<div class="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
					CV
				</div>
				<span class="text-xs font-bold uppercase tracking-wider text-slate-200">CV Meister</span>
				<span
					class="ml-auto text-[10px] text-slate-500 group-hover:text-slate-300 transition whitespace-nowrap"
					>Startseite</span
				>
			</a>

			<div class="p-3 space-y-1">
				<button
					onclick={() => switchView("dashboard")}
					class="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition {view === 'dashboard' || view === 'detail'
						? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
						: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'}"
				>
					<span>Bewerbungen</span>
					<span class="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-mono"
						>{jobs.length}</span
					>
				</button>

				<div class="pl-4 space-y-0.5">
					{#each jobs as j (j.id)}
						<button
							onclick={() => selectJob(j.id)}
							class="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition {j.id === activeJobId && (view === 'detail' || view === 'dashboard')
								? 'text-blue-300 bg-blue-600/10'
								: 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'}"
						>
							<span
								class="w-6 h-6 rounded border flex items-center justify-center font-bold text-[10px] shrink-0"
								style="background: {safeAccentColor(j.accentColor)}22; border-color: {safeAccentColor(j.accentColor)}55; color: {safeAccentColor(j.accentColor)};"
							>
								{initials(j.firma.trim() || "?")}
							</span>
							<span class="truncate flex-1 text-left">{j.firma.trim() || "Neue Firma"}</span>
							<span
								class="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono border shrink-0 {statusCls(
									j.status,
								)}">{j.status}</span
							>
						</button>
					{/each}
					<button
						onclick={addJob}
						class="w-full text-left px-3 py-1.5 rounded-md text-xs text-slate-600 hover:text-slate-300 hover:bg-slate-800/50 transition"
					>
						+ Neu
					</button>
				</div>

				<button
					onclick={() => switchView("static")}
					class="w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition {view === 'static'
						? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
						: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'}"
				>
					<span>Statische Daten</span>
				</button>
			</div>
		</div>

		<button
			onclick={() => {
				stagedBackup = null;
				backupOpen = true;
			}}
			title="Arbeitsbereich als JSON exportieren / importieren"
			class="w-full p-3 border-t border-[#1e293b] flex items-center space-x-2.5 text-left hover:bg-slate-800/50 transition"
		>
			<span
				class="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0"
			>
				{userInitials()}
			</span>
			<span class="overflow-hidden block">
				<span class="text-xs font-semibold text-slate-200 truncate block">
					{[shared.firstname, shared.lastname].filter(Boolean).join(" ") || "Name"}
				</span>
				<span class="text-[9px] text-slate-500 truncate block">
					Singleton aktiv{lastSaved && !saveError ? ` · gespeichert ${lastSaved}` : ""}
				</span>
				{#if saveError}
					<span class="text-[9px] text-red-400 truncate block" title={saveError}>
						{saveError.length > 40 ? saveError.slice(0, 40) + "…" : saveError}
					</span>
				{/if}
			</span>
		</button>
	</aside>

	<!-- Main -->
	<main class="flex-1 flex flex-col h-screen overflow-hidden">
		<header
			class="h-14 px-6 border-b border-[#1e293b] flex items-center justify-between shrink-0 bg-[#090d16]/80 z-10"
		>
			<div class="text-xs font-mono text-slate-400 flex items-center space-x-1.5">
				{#if view === "dashboard"}
					<span class="text-slate-200 font-semibold">Bewerbungen</span>
				{:else if view === "detail"}
					<button onclick={() => switchView("dashboard")} class="hover:text-slate-200 transition"
						>Bewerbungen</button
					>
					<span>/</span>
					<span class="text-slate-200 font-semibold">{activeJob.firma || "Neue Firma"}</span>
				{:else}
					<span class="text-slate-200 font-semibold">Statische Daten</span>
				{/if}
			</div>
			<div class="flex gap-2">
				<button
					onclick={() => (previewCollapsed = !previewCollapsed)}
					class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-1.5 px-3 rounded transition-colors"
				>
					{previewCollapsed ? "Vorschau einblenden" : "Vorschau ausblenden"}
				</button>
				<button
					onclick={() => setDebug(!debugOn)}
					class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-1.5 px-3 rounded transition-colors {debugOn
						? 'ring-1 ring-amber-500'
						: ''}"
				>
					Debug
				</button>
			</div>
		</header>

		<div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
			<!-- Editor -->
			<div class="flex-1 overflow-y-auto p-6 min-h-0">
				{#if view === "dashboard"}
					<div class="space-y-4 max-w-5xl">
						<div class="flex items-center justify-between">
							<h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">
								Aktive Bewerbungen
							</h2>
							<button
								onclick={addJob}
								class="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-md text-xs transition"
							>
								+ Neue Bewerbung
							</button>
						</div>

						<div class="bg-[#131b2e] border border-[#1e293b] rounded-lg overflow-hidden">
							<table class="w-full text-left border-collapse">
								<thead>
									<tr
										class="border-b border-[#1e293b] text-[10px] font-semibold text-slate-400 uppercase bg-slate-900/40"
									>
										<th class="py-3 px-4">Unternehmen & Position</th>
										<th class="py-3 px-4">Stellen-Link</th>
										<th class="py-3 px-4">Status</th>
										<th class="py-3 px-4 text-right">Aktion</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-[#1e293b] text-xs">
									{#each jobs as j (j.id)}
										<tr class="hover:bg-slate-800/40 cursor-pointer" onclick={() => selectJob(j.id)}>
											<td class="py-3 px-4 font-semibold text-slate-100">
												{j.firma || "Neue Firma"}
												<span class="block text-[10px] text-blue-400 font-normal"
													>{j.rolle.trim() ? bewerbungTitel(j.rolle) : "—"}</span
												>
											</td>
											<td class="py-3 px-4">
												{#if j.link}
													<a
														href={j.link}
														target="_blank"
														rel="noreferrer"
														onclick={(e) => e.stopPropagation()}
														class="text-blue-400 hover:underline font-mono text-[11px] truncate block max-w-[180px]"
														>{j.link}</a
													>
												{:else}
													<span class="text-slate-600">—</span>
												{/if}
											</td>
											<td class="py-3 px-4">
												<span
													class="px-2 py-0.5 rounded text-[9px] font-mono border {statusCls(
														j.status,
													)}">{j.status}</span
												>
											</td>
											<td class="py-3 px-4 text-right whitespace-nowrap">
												<button
													onclick={(e) => {
														e.stopPropagation();
														downloadLetterPdf(j);
													}}
													disabled={busy !== null}
													class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded text-[11px] mr-1"
													title="Motivationsschreiben als PDF"
												>
													{busy === `${j.id}:letter` ? "…" : "Anschreiben"}
												</button>
												<button
													onclick={(e) => {
														e.stopPropagation();
														downloadCvPdf(j);
													}}
													disabled={busy !== null}
													class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded text-[11px] mr-1"
													title="Lebenslauf als PDF"
												>
													{busy === `${j.id}:cv` ? "…" : "Lebenslauf"}
												</button>
												<button
													onclick={(e) => {
														e.stopPropagation();
														selectJob(j.id);
													}}
													class="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px]"
												>
													Öffnen
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else if view === "detail"}
					<div class="space-y-4 max-w-5xl mx-auto">
						<div class="flex items-center justify-between bg-[#131b2e] border border-[#1e293b] rounded-lg p-3">
							<button
								onclick={() => switchView("dashboard")}
								class="text-xs text-blue-400 hover:text-blue-300 font-semibold"
							>
								← Zurück zur Übersicht
							</button>
							<div class="flex items-center space-x-2.5">
								<button
									onclick={() => void copyApplicationJson()}
									title="Diese Bewerbung als JSON in die Zwischenablage kopieren — selbstbeschreibend, ohne Bilddaten. Zum Einfügen in einen Prompt."
									class="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
								>
									{appJsonCopied ? "✓ Kopiert!" : "JSON kopieren"}
								</button>
								<button
									onclick={() => void importApplicationJson()}
									title="JSON aus der Zwischenablage einlesen — ersetzt diese Bewerbung (Felder, Anschreiben, Auswahl)"
									class="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
								>
									JSON importieren
								</button>
								<span class="w-px h-5 bg-[#1e293b]"></span>
								<span
									class="px-2.5 py-0.5 rounded text-[10px] font-mono border {statusCls(
										activeJob.status,
									)}">{activeJob.status}</span
								>
								{#if activeJob.status !== "Verschickt"}
									<button
										onclick={markSent}
										class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-md text-xs transition"
									>
										Abschicken
									</button>
								{/if}
								{#if jobs.length > 1}
									<button
										onclick={() => removeJob(activeJob.id)}
										class="text-xs text-red-400 hover:underline"
									>
										Löschen
									</button>
								{/if}
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
							<div class="md:col-span-7 space-y-4">
								<div class="{cardCls} space-y-3">
									<div class="flex items-center space-x-3">
										<div
											class="w-9 h-9 rounded border flex items-center justify-center font-bold text-xs"
											style="background: {safeAccentColor(activeJob.accentColor)}22; border-color: {safeAccentColor(activeJob.accentColor)}55; color: {safeAccentColor(activeJob.accentColor)};"
										>
											{initials(activeJob.firma || "?")}
										</div>
										<div class="flex-1">
											<h3 class="text-xs font-bold text-slate-100">
												{activeJob.firma || "Neue Firma"}
											</h3>
											<p class="text-[11px] text-blue-400">{bewerbungTitel(activeJob.rolle)}</p>
										</div>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<label class="col-span-2">
											<span class={labelCls}>Firmenname</span>
											<input bind:value={activeJob.firma} class={inputCls} />
										</label>
										<label class="col-span-2">
											<span class={labelCls}>Rolle in der Firma</span>
											<input
												bind:value={activeJob.rolle}
												class={inputCls}
												placeholder="z. B. Senior Frontend Engineer"
											/>
										</label>
										<label class="col-span-2">
											<span class={labelCls}>Stellen-Link (URL)</span>
											<input
												bind:value={activeJob.link}
												class="{inputCls} font-mono"
												placeholder="https://…"
											/>
										</label>
										<label class="col-span-2">
											<span class={labelCls}>E-Mail (optional)</span>
											<input bind:value={activeJob.email} class={inputCls} />
										</label>
										{#if activeJob.email.trim()}
											<div class="col-span-2 flex flex-col gap-2">
												<label class="flex flex-col gap-1">
													<span class="flex items-center justify-between gap-2">
														<span class={labelCls}>E-Mail-Text (Anrede und Gruß kommen automatisch dazu)</span>
														<button
															onclick={copyMailPrompt}
															title="Prompt für LLM kopieren"
															class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition shrink-0"
														>
															<span class="material-symbols-outlined text-lg leading-none"
																>{mailPromptCopied ? "check" : "content_copy"}</span
															>
														</button>
													</span>
													<textarea
														bind:value={activeJob.emailText}
														rows="6"
														placeholder="anbei sende ich Ihnen meine Bewerbungsunterlagen …"
														class="{inputCls} leading-relaxed resize-y"
													></textarea>
												</label>
											</div>
										{/if}
										<div class="col-span-2">
											<span class={labelCls}>Ansprechpartner (Anrede im Anschreiben)</span>
											<div class="flex gap-2">
												<input
													bind:value={activeJob.ansprechpartner}
													class="{inputCls} flex-1"
													placeholder="Frau Muster"
												/>
												<div class="inline-flex gap-1 rounded-md border border-[#1e293b] bg-[#0a0f1d] p-0.5 shrink-0">
													<button
														onclick={() => (activeJob.anrede = "frau")}
														title="weiblich"
														aria-label="Anrede weiblich"
														class="px-3 py-1 rounded text-base leading-none transition-colors {activeJob.anrede === 'frau'
															? 'bg-blue-600 text-white'
															: 'text-slate-400 hover:text-slate-200'}"
													>
														♀️
													</button>
													<button
														onclick={() => (activeJob.anrede = "herr")}
														title="männlich"
														aria-label="Anrede männlich"
														class="px-3 py-1 rounded text-base leading-none transition-colors {activeJob.anrede === 'herr'
															? 'bg-blue-600 text-white'
															: 'text-slate-400 hover:text-slate-200'}"
													>
														♂️
													</button>
													<button
														onclick={() => (activeJob.anrede = "divers")}
														title="divers"
														aria-label="Anrede divers"
														class="px-3 py-1 rounded text-base leading-none transition-colors {activeJob.anrede === 'divers'
															? 'bg-blue-600 text-white'
															: 'text-slate-400 hover:text-slate-200'}"
													>
														⚧️
													</button>
												</div>
											</div>
										</div>
										<label>
											<span class={labelCls}>Akzentfarbe (aus Logo)</span>
											<input
												type="color"
												bind:value={activeJob.accentColor}
												class="h-9 w-full rounded border border-[#1e293b] bg-[#0a0f1d]"
											/>
										</label>
										<div class="col-span-2">
											<span class={labelCls}>Firmenlogo</span>
											{@render fileButton(
												jobFiles[activeJob.id]?.logo?.name ?? null,
												(f) => onLogoSelect(f),
											)}
											<div class="flex items-center gap-2 mt-1.5">
												<button
													onclick={openLogoUrl}
													title="Logo von einer URL laden (das ist der Weg, den eine KI im JSON setzen kann)"
													class="text-[11px] font-medium px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition shrink-0"
												>
													URL wählen
												</button>
												<span class="text-[10px] text-slate-500 truncate">
													{jobFiles[activeJob.id]?.logoUrl ?? "Keine URL"}
												</span>
											</div>
											{#if logoNote}
												<p class="text-[10px] text-slate-500 mt-1">{logoNote}</p>
											{/if}
										</div>
										<label class="col-span-2">
											<span class={labelCls}>Stellenausschreibungstext</span>
											<textarea
												bind:value={activeJob.adText}
												rows="10"
												placeholder="Hier die komplette Stellenausschreibung einfügen …"
												class="{inputCls} font-mono leading-relaxed resize-y"
											></textarea>
										</label>
										<label class="col-span-2">
											<span class="flex items-center justify-between gap-2">
												<span class={labelCls}
													>Warum diese Firma? Was gefällt dir? (nur Notizen)</span
												>
												<button
													onclick={copyMotivationPrompt}
													title="Prompt für LLM kopieren"
													class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition shrink-0"
												>
													<span class="material-symbols-outlined text-lg leading-none"
														>{promptCopied ? "check" : "content_copy"}</span
													>
												</button>
											</span>
											<textarea
												bind:value={activeJob.motivation}
												rows="4"
												class="{inputCls} leading-relaxed resize-y"
											></textarea>
										</label>
									</div>
								</div>

								<div class="{cardCls} space-y-3">
									<h4 class={hCls}>Motivationsschreiben</h4>
									<div>
										<span class="flex items-center justify-between gap-2">
											<span class={labelCls}>Text (Leerzeile = neuer Absatz)</span>
											<button
												onclick={copyCoverPrompt}
												title="Prompt für LLM kopieren"
												class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition shrink-0"
											>
												<span class="material-symbols-outlined text-lg leading-none"
													>{coverCopied ? "check" : "content_copy"}</span
												>
											</button>
										</span>
										<textarea
											bind:value={activeJob.letter.body}
											rows="12"
											class="{inputCls} font-mono leading-relaxed resize-y"
										></textarea>
									</div>
									<div>
										<span class={labelCls}>Grußformel</span>
										<input bind:value={activeJob.letter.closing} class={inputCls} />
									</div>
								</div>

								<div class="{cardCls} space-y-3">
									<h4 class={hCls}>Arbeitsproben (für diese Bewerbung)</h4>
									{#if samples.length === 0}
										<p class="text-xs text-slate-500">
											Noch keine Proben — anlegen unter Arbeitsproben.
										</p>
									{/if}
									{#each samples as sample (sample.id)}
										<label
											class="bg-[#0a0f1d] p-2 rounded border border-[#1e293b] flex items-center justify-between text-xs cursor-pointer"
										>
											<span class="text-slate-300">{sample.title || "Ohne Titel"}</span>
											<input
												type="checkbox"
												checked={sampleVisible(sample.id)}
												onchange={() => toggleSample(sample.id)}
												class="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
											/>
										</label>
									{/each}
								</div>
							</div>

							<div class="md:col-span-5 space-y-4">
								<div class="{cardCls} space-y-4">
									<h4 class={hCls}>Lebenslauf-Filter (für diese Bewerbung)</h4>

									<label
										class="bg-[#0a0f1d] p-2.5 rounded border border-[#1e293b] flex items-center justify-between cursor-pointer"
									>
										<span class="text-xs text-slate-200">Führerschein anzeigen</span>
										<input
											type="checkbox"
											bind:checked={activeJob.fuehrerschein}
											class="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
										/>
									</label>

									<div class="space-y-2">
										<p class="text-[10px] font-semibold text-slate-400 uppercase">Skills ein/aus:</p>
										{#each cv.sections as sec (sec.id ?? sec.title)}
											{#each sec.skills as group (group.id ?? group.category)}
												<div
													class="bg-[#0a0f1d] p-2 rounded border border-[#1e293b] text-xs"
												>
													<label class="flex items-center justify-between cursor-pointer">
														<span class="text-slate-300"
															>{group.category || "Ohne Kategorie"}
															<span class="text-slate-600">· {sec.title}</span></span
														>
														<input
															type="checkbox"
															checked={skillVisible(group.id)}
															onchange={() => toggleSkill(group.id)}
															class="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
														/>
													</label>
													{#if skillVisible(group.id)}
														<div class="mt-1.5 ml-3 space-y-1 border-l border-[#1e293b] pl-2">
															{#each skillLines(group.values) as value, vi (vi)}
																<label
																	class="flex items-center justify-between cursor-pointer"
																>
																	<span class="text-slate-400">{value}</span>
																	<input
																		type="checkbox"
																		checked={skillValueVisible(group.id, value)}
																		onchange={() => toggleSkillValue(group.id, value)}
																		class="w-3 h-3 rounded accent-emerald-600 cursor-pointer"
																	/>
																</label>
															{/each}
														</div>
													{/if}
												</div>
											{/each}
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<nav class="inline-flex gap-1 rounded-lg border border-[#1e293b] bg-[#0e1422] p-1 max-w-5xl">
						{#each staticTabs as t (t.id)}
							<button
								onclick={() => {
									staticTab = t.id;
									previewDoc = t.id === "lebenslauf" ? "cv" : "letter";
									render();
								}}
								class="px-4 py-1.5 rounded-md text-xs font-medium transition-colors {staticTab === t.id
									? 'bg-blue-600 text-white shadow'
									: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}"
							>
								{t.label}
							</button>
						{/each}
					</nav>
					{#if staticTab === "lebenslauf"}
					<div class="space-y-4 max-w-5xl">
						<div class="flex items-center gap-2">
							<button
								onclick={copyCvJson}
								title="Lebenslauf-JSON in die Zwischenablage kopieren (z. B. für eine KI)"
								class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-1.5 px-3 rounded transition-colors"
							>
								{cvCopied ? "✓ Kopiert!" : "JSON kopieren"}
							</button>
							<button
								onclick={() => void importCvJson()}
								title="Lebenslauf-JSON aus der Zwischenablage einlesen (ersetzt den Lebenslauf)"
								class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-1.5 px-3 rounded transition-colors"
							>
								JSON importieren
							</button>
							{#if cvImportError}
								<span class="text-xs text-red-400">{cvImportError}</span>
							{/if}
						</div>
						<div class="{cardCls} space-y-3">
							<h4 class={hCls}>Kopf</h4>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<span class={labelCls}>Bewerbungsfoto (optional)</span>
									{@render fileButton(photoFile?.name ?? null, (f) => {
										photoFile = f?.[0] ?? null;
										render();
									})}
								</div>
								<div>
									<span class={labelCls}>Führerschein (z. B. Klasse B)</span>
									<input
										bind:value={cv.fuehrerschein}
										class={inputCls}
										placeholder="Klasse B"
									/>
								</div>
							</div>
						</div>

						{#each cv.sections as sec, si (sec.id ?? si)}
							<div class="{cardCls} space-y-3">
								<div class="flex items-center gap-2">
									<input
										bind:value={sec.title}
										placeholder="Abschnittstitel"
										class="{inputCls} font-semibold"
									/>
									<button
										onclick={() => move(cv.sections, si, -1)}
										disabled={si === 0}
										class="text-xs text-slate-400 hover:underline disabled:opacity-30"
										title="Nach oben"
									>
										↑
									</button>
									<button
										onclick={() => move(cv.sections, si, 1)}
										disabled={si === cv.sections.length - 1}
										class="text-xs text-slate-400 hover:underline disabled:opacity-30"
										title="Nach unten"
									>
										↓
									</button>
									<button
										onclick={() => removeSection(si)}
										class="text-xs text-red-400 hover:underline"
									>
										Entfernen
									</button>
								</div>

								{#each sec.entries as entry, ei (ei)}
									<div
										class="rounded border border-[#1e293b] p-2 flex flex-col gap-2 bg-[#0a0f1d]"
									>
										<div class="flex items-center justify-between">
											<span class="text-xs font-semibold text-slate-500">Eintrag {ei + 1}</span>
											<div class="flex gap-2">
												<button
													onclick={() => move(sec.entries, ei, -1)}
													disabled={ei === 0}
													class="text-xs text-slate-400 hover:underline disabled:opacity-30"
												>
													↑
												</button>
												<button
													onclick={() => move(sec.entries, ei, 1)}
													disabled={ei === sec.entries.length - 1}
													class="text-xs text-slate-400 hover:underline disabled:opacity-30"
												>
													↓
												</button>
												<button
													onclick={() => removeEntry(si, ei)}
													class="text-xs text-red-400 hover:underline"
												>
													Entfernen
												</button>
											</div>
										</div>
										<div class="grid grid-cols-2 gap-2">
											<input
												bind:value={entry.title}
												placeholder="Titel (z. B. Software-Entwickler)"
												class={inputCls}
											/>
											<input bind:value={entry.location} placeholder="Ort" class={inputCls} />
											<input
												bind:value={entry.date}
												placeholder="Zeitraum (z. B. Juni 2021 - März 2026)"
												class={inputCls}
											/>
											<input
												bind:value={entry.description}
												placeholder="Firma / Beschreibung"
												class={inputCls}
											/>
										</div>
										<textarea
											bind:value={entry.details}
											placeholder={"Details (Zeile mit \"- \" = Aufzählung, *Wort* = fett)"}
											rows="4"
											class="{inputCls} font-mono"
										></textarea>
									</div>
								{/each}

								{#each sec.skills as group, gi (gi)}
									<div
										class="rounded border border-[#1e293b] p-2 flex flex-col gap-2 bg-[#0a0f1d]"
									>
										<div class="flex items-center justify-between">
											<span class="text-xs font-semibold text-slate-500"
												>Kenntnisse {gi + 1}</span
											>
											<button
												onclick={() => removeSkill(si, gi)}
												class="text-xs text-red-400 hover:underline"
											>
												Entfernen
											</button>
										</div>
										<input
											bind:value={group.category}
											placeholder="Kategorie (z. B. Sprachen)"
											class={inputCls}
										/>
										<textarea
											bind:value={group.values}
											placeholder={"Ein Wert pro Zeile, *Wert* = fett"}
											rows="3"
											class="{inputCls} font-mono"
										></textarea>
									</div>
								{/each}

								<div class="flex gap-2">
									<button
										onclick={() => addEntry(si)}
										class="flex-1 text-xs font-medium border border-dashed border-[#1e293b] rounded py-1.5 text-slate-400 hover:bg-slate-800/50"
									>
										+ Eintrag
									</button>
									<button
										onclick={() => addSkill(si)}
										class="flex-1 text-xs font-medium border border-dashed border-[#1e293b] rounded py-1.5 text-slate-400 hover:bg-slate-800/50"
									>
										+ Kenntnisse
									</button>
								</div>
							</div>
						{/each}
						<button
							onclick={addSection}
							class="text-xs font-medium border border-dashed border-[#1e293b] rounded py-2 text-slate-400 hover:bg-slate-800/50 w-full"
						>
							+ Abschnitt hinzufügen
						</button>
					</div>
				{:else if staticTab === "proben"}
					<div class="space-y-4 max-w-5xl">
						<div class="{cardCls} space-y-2">
							<h4 class={hCls}>Hinweis über den Proben</h4>
							<textarea
								bind:value={staticData.samplesDisclaimer}
								rows="6"
								class="{inputCls} leading-relaxed resize-y"
							></textarea>
						</div>
						{#each samples as sample, si (sample.id)}
							<div class="{cardCls} space-y-3">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-slate-500">Probe</span>
									<div class="flex gap-2">
										<button
											onclick={() => move(samples, si, -1)}
											disabled={si === 0}
											class="text-xs text-slate-400 hover:underline disabled:opacity-30"
											title="Nach oben"
										>
											↑
										</button>
										<button
											onclick={() => move(samples, si, 1)}
											disabled={si === samples.length - 1}
											class="text-xs text-slate-400 hover:underline disabled:opacity-30"
											title="Nach unten"
										>
											↓
										</button>
										<button
											onclick={() => removeSample(sample.id)}
											class="text-xs text-red-400 hover:underline"
										>
											Entfernen
										</button>
									</div>
								</div>
								<input bind:value={sample.title} placeholder="Titel" class={inputCls} />
								<textarea
									bind:value={sample.description}
									placeholder="Beschreibung"
									rows="3"
									class={inputCls}
								></textarea>
								<input bind:value={sample.link} placeholder="Link (optional)" class={inputCls} />
								{@render fileButton(sampleFiles[sample.id ?? ""]?.name ?? null, (f) =>
									onSampleImage(sample.id, f),
								)}
							</div>
						{/each}
						<button
							onclick={addSample}
							class="text-xs font-medium border border-dashed border-[#1e293b] rounded py-2 text-slate-400 hover:bg-slate-800/50 w-full"
						>
							+ Arbeitsprobe hinzufügen
						</button>
					</div>
				{:else if staticTab === "pdf"}
					<div class="space-y-4 max-w-5xl">
						<div class="{cardCls} space-y-2">
							<h4 class={hCls}>Zusätzliche PDFs</h4>
							<p class="text-[11px] text-slate-400 leading-relaxed">
								Zeugnisse, Nachweise, Zertifikate. Diese PDFs werden an
								<strong class="text-slate-300">jede</strong> Bewerbungs-Mail angehängt: in der
								Mail-Vorschau, in der .eml-Datei und beim Versand über Gmail. Sie gehen
								außerdem in den Arbeitsbereich-Export (JSON, als Base64) mit ein.
							</p>
						</div>
						{#each documents as doc, di (doc.id)}
							<div class="{cardCls} space-y-3">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-slate-500">PDF</span>
									<div class="flex gap-2">
										<button
											onclick={() => move(documents, di, -1)}
											disabled={di === 0}
											class="text-xs text-slate-400 hover:underline disabled:opacity-30"
											title="Nach oben"
										>
											↑
										</button>
										<button
											onclick={() => move(documents, di, 1)}
											disabled={di === documents.length - 1}
											class="text-xs text-slate-400 hover:underline disabled:opacity-30"
											title="Nach unten"
										>
											↓
										</button>
										<button
											onclick={() => removeDocument(doc.id)}
											class="text-xs text-red-400 hover:underline"
										>
											Entfernen
										</button>
									</div>
								</div>
								<input
									bind:value={doc.name}
									placeholder="Name (z. B. Zeugnis Abitur)"
									class={inputCls}
								/>
								{@render fileButton(
									documentFiles[doc.id ?? ""]?.name ?? null,
									(f) => onDocumentFile(doc.id, f),
									"application/pdf",
									"PDF wählen",
								)}
								{#if documentReady(doc.id)}
									<p class="text-[10px] text-slate-500">
										Wird angehängt als <span class="font-mono text-slate-400"
											>{documentFilename(doc)}</span
										>
									</p>
								{:else}
									<p class="text-[10px] text-amber-400/80">
										Ohne PDF-Datei wird nichts angehängt.
									</p>
								{/if}
							</div>
						{/each}
						<button
							onclick={addDocument}
							class="text-xs font-medium border border-dashed border-[#1e293b] rounded py-2 text-slate-400 hover:bg-slate-800/50 w-full"
						>
							+ PDF hinzufügen
						</button>
					</div>
				{:else if staticTab === "erfahrung"}
					<div class="space-y-4 max-w-5xl">
						<div class="{cardCls} space-y-2">
							<h4 class={hCls}>Erfahrung & Kenntnisse</h4>
							<textarea
								bind:value={staticData.erfahrung}
								rows="20"
								class="{inputCls} font-mono leading-relaxed resize-y"
							></textarea>
						</div>
						<div class="{cardCls} space-y-2">
							<h4 class={hCls}>Was mich antreibt</h4>
							<textarea
								bind:value={staticData.antrieb}
								rows="8"
								class="{inputCls} font-mono leading-relaxed resize-y"
							></textarea>
						</div>
					</div>
				{:else if staticTab === "stammdaten"}
					<div class="space-y-4 max-w-xl">
						<div class="{cardCls} space-y-4">
							<h3 class="text-xs font-bold text-slate-100 pb-2 border-b border-[#1e293b]">
								Stammdaten (Singleton, einmalig)
							</h3>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<span class={labelCls}>Vorname</span>
									<input bind:value={shared.firstname} class={inputCls} />
								</div>
								<div>
									<span class={labelCls}>Nachname</span>
									<input bind:value={shared.lastname} class={inputCls} />
								</div>
								<div class="col-span-2">
									<span class={labelCls}>E-Mail</span>
									<input bind:value={shared.email} class={inputCls} />
								</div>
								<div class="col-span-2">
									<span class={labelCls}>Telefon</span>
									<input bind:value={shared.phone} class={inputCls} />
								</div>
								<div class="col-span-2">
									<span class={labelCls}>Adresse</span>
									<input bind:value={shared.address} class={inputCls} />
								</div>
								<div class="col-span-2">
									<span class={labelCls}>Signatur-Name</span>
									<input bind:value={shared.signatureName} class={inputCls} />
								</div>
								<div class="col-span-2">
									<span class={labelCls}>Gehaltsvorstellung (bei 40h/Woche)</span>
									<input
										bind:value={shared.gehalt}
										class={inputCls}
										placeholder="z. B. 65.000 €"
									/>
								</div>
								<div class="col-span-2">
									<span class={labelCls}>Frühestmöglicher Einstiegstermin</span>
									<div class="flex gap-2">
										<select
											bind:value={shared.einstiegArt}
											class="{inputCls} shrink-0"
											style="max-width: 11rem;"
										>
											<option value="monate">In N Monaten</option>
											<option value="datum">Genaues Datum</option>
										</select>
										{#if shared.einstiegArt === "datum"}
											<input type="date" bind:value={shared.einstiegDatum} class={inputCls} />
										{:else}
											<input
												type="number"
												min="0"
												bind:value={shared.einstiegMonate}
												class={inputCls}
											/>
										{/if}
									</div>
									{#if einstiegText(shared)}
										<p class="text-[10px] text-slate-500 mt-1">{einstiegText(shared)}</p>
									{/if}
								</div>
								<div class="col-span-2">
									<span class={labelCls}>Unterschrift als Bild (optional)</span>
									{@render fileButton(signatureFile?.name ?? null, (f) => {
										signatureFile = f?.[0] ?? null;
										render();
									})}
									<p class="text-[10px] text-slate-500 mt-1">
										Wird deckend in der Akzentfarbe der aktiven Bewerbung eingefärbt;
										transparenter Rand links wird abgeschnitten.
									</p>
								</div>
							</div>
						</div>
					</div>
				{/if}
				{/if}
			</div>

			<!-- Preview -->
			{#if !previewCollapsed}
			<div class="lg:w-[46%] shrink-0 bg-[#060a12] overflow-y-auto p-6 min-h-0 border-t lg:border-t-0 lg:border-l border-[#1e293b]">
				<div class="flex justify-center mb-1">
					<div class="inline-flex gap-1 rounded-lg border border-[#1e293b] bg-[#0e1422] p-1">
						<button
							onclick={() => selectPreview("mail")}
							disabled={!mailAvailable}
							title={mailAvailable ? "E-Mail-Vorschau" : "Kein E-Mail-Text vorhanden"}
							class="px-4 py-1.5 rounded-md text-xs font-medium transition-colors {previewDoc === 'mail'
								? 'bg-blue-600 text-white shadow'
								: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
						>
							E-Mail
						</button>
						<button
							onclick={() => selectPreview("letter")}
							class="px-4 py-1.5 rounded-md text-xs font-medium transition-colors {previewDoc === 'letter'
								? 'bg-blue-600 text-white shadow'
								: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}"
						>
							Anschreiben
						</button>
						<button
							onclick={() => selectPreview("cv")}
							class="px-4 py-1.5 rounded-md text-xs font-medium transition-colors {previewDoc === 'cv'
								? 'bg-blue-600 text-white shadow'
								: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}"
						>
							Lebenslauf
						</button>
					</div>
				</div>
				<p class="text-center text-[10px] text-slate-500 h-4 mb-3">
					{rendering ? "Rendert…" : "Bereit"}
				</p>
				{#if error}
					<pre
						class="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded p-4 whitespace-pre-wrap">{error}</pre>
				{:else if previewDoc === "mail"}
					<div class="bg-white text-neutral-900 rounded shadow-lg w-full max-w-[820px] mx-auto p-6 text-sm space-y-3">
						<div class="text-xs text-neutral-500">
							An: <span class="text-neutral-900 font-medium">{activeJob.email || "—"}</span>
						</div>
						<div class="text-xs text-neutral-500">
							Betreff:
							<span class="text-neutral-900 font-medium"
								>{bewerbungTitel(activeJob.rolle)}</span
							>
						</div>
						<hr class="border-neutral-200" />
						<p class="whitespace-pre-wrap leading-relaxed">{composeMailBody(shared, activeJob, activeJob.letter)}</p>
						<div class="space-y-2">
							{#each mailAttachments() as att (att.kind)}
								<div class="flex items-center gap-3 rounded border border-neutral-200 bg-neutral-50 p-2">
									<span
										class="flex items-center justify-center w-9 h-9 rounded bg-red-600 text-white text-[10px] font-bold shrink-0"
										>PDF</span
									>
									<div class="min-w-0 flex-1">
										<p class="text-xs font-medium text-neutral-900 truncate">{att.name}</p>
										<p class="text-[10px] text-neutral-500">
											{att.size != null ? formatBytes(att.size) : "wird berechnet…"}
										</p>
									</div>
									<div class="flex items-center gap-1.5 shrink-0">
										<button
											onclick={() => openAttachment(att.kind)}
											disabled={busy !== null}
											title="PDF in diesem Tab öffnen"
											class="text-[11px] font-medium px-2.5 py-1 rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-200/60 disabled:opacity-40 transition"
										>
											{busy === attKey(att.kind, "open") ? "…" : "Öffnen"}
										</button>
										<button
											onclick={() => downloadAttachment(att.kind)}
											disabled={busy !== null}
											title="PDF herunterladen"
											class="text-[11px] font-medium px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-40 transition"
										>
											{busy === attKey(att.kind, "download") ? "…" : "Download"}
										</button>
									</div>
								</div>
							{/each}
						</div>
						<div class="flex gap-2 pt-2 flex-wrap">
							<button
								onclick={copyMailText}
								class="text-xs font-medium px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white transition"
							>
								{mailCopied ? "Kopiert!" : "Text kopieren"}
							</button>
							<button
								onclick={downloadEml}
								disabled={busy !== null ||
									mailSizes.letter == null ||
									mailSizes.cv == null}
								title={mailSizes.letter != null && mailSizes.cv != null
									? "E-Mail mit allen Anhängen als .eml herunterladen"
									: "Anhänge werden berechnet…"}
								class="text-xs font-medium px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white transition"
							>
								{busy?.endsWith(":eml") ? "…" : "Als E-Mail-Datei (.eml)"}
							</button>
							<button
								onclick={sendViaGmail}
								disabled={sending || !activeJob.email.trim()}
								title={activeJob.email.trim()
									? "Anschreiben + Lebenslauf als PDF an die Firmen-Mail senden"
									: "Erst eine Firmen-Mail hinterlegen"}
								class="text-xs font-medium px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition"
							>
								{sending ? "Wird versendet…" : "Mit Google versenden"}
							</button>
						</div>
						{#if sendStatus}
							<p
								class="text-xs {sendStatus.ok ? 'text-emerald-700' : 'text-red-700'} font-medium"
							>
								{sendStatus.message}
							</p>
						{/if}
					</div>
				{:else if !ready && rendering}
					<p class="text-slate-500 text-xs">Typst-Compiler wird geladen…</p>
				{:else if pages.length === 0}
					<p class="text-slate-500 text-xs">Noch nichts zu sehen.</p>
				{:else}
					<div class="flex flex-col items-center gap-6">
						{#each pages as page, i (i)}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<div class="bg-white shadow-lg typst-page">{@html page}</div>
						{/each}
					</div>
				{/if}
				{#if warnings.length}
					<div class="text-[11px] text-amber-400/90 mt-4 space-y-1">
						{#each warnings as w (w)}
							<p>{w}</p>
						{/each}
					</div>
				{/if}
			</div>
			{/if}
		</div>
	</main>

	{#if debugOn}
		<div
			class="fixed bottom-3 right-3 z-50 w-[24rem] max-h-60 flex flex-col bg-black/90 border border-amber-500/40 rounded p-2 font-mono text-[10px] text-slate-300"
		>
			<div class="flex justify-between items-center mb-1 shrink-0">
				<span>Debug · renders: {renderCount}</span>
				<div class="flex gap-2">
						<button onclick={() => { logBuf = []; debugLines = []; }} class="hover:text-white">Leeren</button>
						<button onclick={() => setDebug(false)} class="hover:text-white">Schließen</button>
					</div>
			</div>
			<div class="overflow-y-auto">
				{#each debugLines as line, i (i)}
					<p class="whitespace-pre-wrap break-all">{line}</p>
				{/each}
			</div>
		</div>
	{/if}

	{#if stagedAppImport}
		<div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
			<div class="bg-[#131b2e] border border-[#1e293b] rounded-lg max-w-md w-full p-4 space-y-3">
				<h3 class="text-xs font-bold text-slate-100">Bewerbung aus JSON ersetzen?</h3>
				<p class="text-[11px] text-slate-400 break-all">Quelle: {stagedAppImport.quelle}</p>
				<p class="text-xs text-slate-300">
					Der Export enthält nur, was zu dieser Bewerbung gehört. Ersetzt wird
					<span class="font-semibold">die geöffnete Bewerbung</span>:
				</p>
				<ul class="text-[11px] text-slate-400 space-y-0.5 list-disc pl-4">
					<li>Felder, Anschreiben und die Ein-/Aus-Auswahl dieser Bewerbung</li>
					<li>Stammdaten (global)</li>
				</ul>
				<p class="text-[11px] text-slate-500">
					Lebenslauf, Arbeitsproben und zusätzliche PDFs sind global bzw. lokal hochgeladen und
					bleiben unangetastet. Das Logo wird aus der URL in der Datei geladen.
				</p>
				{#if appImportError}
					<p class="text-[11px] text-red-400">{appImportError}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<button
						onclick={() => (stagedAppImport = null)}
						class="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
					>
						Abbrechen
					</button>
					<button
						onclick={applyApplicationImport}
						class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition"
					>
						Ersetzen
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if logoUrlOpen}
		<div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
			<div class="bg-[#131b2e] border border-[#1e293b] rounded-lg max-w-md w-full p-4 space-y-3">
				<h3 class="text-xs font-bold text-slate-100">Logo von URL laden</h3>
				<p class="text-[11px] text-slate-400">
					Die App lädt das Bild von dieser Adresse und übernimmt es als Firmenlogo. Im
					Bewerbungs-JSON steht danach nur diese URL — keine Bilddaten.
				</p>
				<input
					bind:value={logoUrlInput}
					placeholder="https://…/logo.png"
					class="{inputCls} font-mono"
					onkeydown={(e) => {
						if (e.key === "Enter") void applyLogoUrl();
					}}
				/>
				<div class="flex justify-end gap-2">
					<button
						onclick={() => (logoUrlOpen = false)}
						class="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
					>
						Abbrechen
					</button>
					<button
						onclick={() => void applyLogoUrl()}
						disabled={logoUrlBusy || !logoUrlInput.trim()}
						class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{logoUrlBusy ? "Lädt …" : "Laden"}
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if backupOpen}
		<div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
			<div class="bg-[#131b2e] border border-[#1e293b] rounded-lg max-w-sm w-full p-4 space-y-3">
				<h3 class="text-xs font-bold text-slate-100">Arbeitsbereich (JSON, inkl. Bilder)</h3>
				<p class="text-[11px] text-slate-400">
					Alles außer generierten PDFs/EMLs: Bewerbungen, Stammdaten, Lebenslauf,
					Arbeitsproben, zusätzliche PDFs, Erfahrung.
				</p>
				<p class="text-[11px] text-slate-500">
					Gleiches Format wie der Bewerbungs-Export und selbstbeschreibend
					(<span class="font-mono">label</span>/<span class="font-mono">_comment</span>/<span
						class="font-mono">info</span
					>/<span class="font-mono">value</span>). Unterschied: nur hier stecken die Bild- und
					PDF-Daten als Base64 drin.
				</p>
				<button
					onclick={exportWorkspace}
					class="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition"
				>
					Exportieren (herunterladen)
				</button>
				<label
					class="block w-full text-center px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition cursor-pointer"
				>
					Importieren (Datei wählen)
					<input
						id="backup-import-input"
						type="file"
						accept=".json,application/json"
						class="hidden"
						onchange={(e) => {
							void importBackupFile(e.currentTarget.files);
							e.currentTarget.value = "";
						}}
					/>
				</label>
				{#if !confirmReset}
					<button
						onclick={() => (confirmReset = true)}
						class="w-full px-3 py-2 border border-red-500/40 text-red-300 hover:bg-red-500/10 rounded text-xs font-medium transition"
					>
						Auf Platzhalter zurücksetzen
					</button>
				{:else}
					<div class="rounded border border-red-500/40 bg-red-500/10 p-3 space-y-2">
						<p class="text-xs text-slate-200">
							Wirklich alles auf die Platzhalter (Max Mustermann / Template Firma)
							zurücksetzen? Bewerbungen, Lebenslauf, Arbeitsproben, zusätzliche PDFs
							und Bilder werden ersetzt.
						</p>
						<div class="flex justify-end gap-2">
							<button
								onclick={() => (confirmReset = false)}
								class="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
							>
								Abbrechen
							</button>
							<button
								onclick={resetToPlaceholders}
								class="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold"
							>
								Zurücksetzen
							</button>
						</div>
					</div>
				{/if}
				{#if stagedBackup}
					<div class="rounded border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
						<p class="text-xs text-slate-200">
							<span class="font-mono text-[11px]">{stagedBackup.name}</span> wirklich
							importieren? Der aktuelle Stand wird ersetzt.
						</p>
						<div class="flex justify-end gap-2">
							<button
								onclick={() => (stagedBackup = null)}
								class="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
							>
								Abbrechen
							</button>
							<button
								onclick={applyBackup}
								class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
							>
								Ersetzen
							</button>
						</div>
					</div>
				{/if}
				<button
					onclick={() => {
						backupOpen = false;
						stagedBackup = null;
						confirmReset = false;
					}}
					class="w-full px-3 py-1.5 text-slate-400 hover:text-slate-200 rounded text-xs"
				>
					Schließen
				</button>
			</div>
		</div>
	{/if}
	</div>
{:else}
	<Landing onStart={startFromLanding} />
{/if}

<style>
	.typst-page :global(svg) {
		display: block;
		width: 100%;
		max-width: 820px;
		height: auto;
	}
</style>
