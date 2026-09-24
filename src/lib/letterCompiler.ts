import { getCompiler } from "$lib/typst";
import { buildLetterSource, type LetterData, type WorkSample } from "$lib/letter";
import { buildCvSource, type CvData } from "$lib/cv";
import type { SharedData } from "$lib/shared";
import type { JobData } from "$lib/job";
import { logoExt, tintSignatureImage } from "$lib/images";
import modernCvTemplate from "$lib/typst/modern-cv-local.typ?raw";
import langToml from "$lib/typst/lang.toml?raw";

export interface RenderedLetter {
	/** One SVG string per page. */
	pages: string[];
	/** Warnings emitted by the compiler. */
	warnings: string[];
}

/** Extra binary/text files placed into the virtual project (images, data). */
export interface LetterFiles {
	/** Map of virtual path -> bytes. */
	binaries?: Record<string, Uint8Array>;
	/** Map of virtual path -> source text. */
	extraSources?: Record<string, string>;
}

const BASE_FILES: Record<string, string> = {
	"modern-cv-local.typ": modernCvTemplate,
	"lang.toml": langToml,
};

/**
 * Serializes compiler access: the singleton compiler holds one virtual
 * project (clearFiles/addSource/compile), so concurrent compiles would
 * interleave files and break each other. Queued calls simply wait their turn.
 */
let compileQueue: Promise<void> = Promise.resolve();

async function withCompilerLock<T>(fn: () => Promise<T>): Promise<T> {
	const prev = compileQueue;
	let release!: () => void;
	compileQueue = new Promise<void>((res) => (release = res));
	await prev;
	try {
		return await fn();
	} finally {
		release();
	}
}

/**
 * Compiles a Typst source string. A fresh virtual project is built on every
 * call so removed files (e.g. an old logo) never leak into the next render.
 */
async function compileSource(
	source: string,
	files: LetterFiles = {},
	format: "svg" | "pdf",
): Promise<{ pages: string[]; output?: Uint8Array; warnings: string[] }> {
	return withCompilerLock(async () => {
		const compiler = await getCompiler();

		await compiler.clearFiles();
		for (const [path, text] of Object.entries({ ...BASE_FILES, ...files.extraSources })) {
			await compiler.addSource(path, text);
		}
		for (const [path, bytes] of Object.entries(files.binaries ?? {})) {
			await compiler.addFile(path, bytes);
		}

		await compiler.addSource("main.typ", source);

		if (format === "pdf") {
			const result = await compiler.compile({ main: "main.typ", format: "pdf" });
			return { pages: [], output: result.output, warnings: [] };
		}
		const result = await compiler.compile({ main: "main.typ", format: "svg" });
		return {
			pages: result.pages.map((p) => p.output),
			warnings: result.diagnostics
				.filter((d) => d.severity === "warning")
				.map((d) => d.formatted),
		};
	});
}

/**
 * Compiles a letter to SVG pages. Takes plain File objects — nothing is
 * written back into reactive state, so rendering stays side-effect free.
 */
/** Global samples minus the ones hidden for this job. */
export function visibleSamples(all: WorkSample[], job: JobData): WorkSample[] {
	return all.filter((s) => !(s.id && job.hiddenSampleIds.includes(s.id)));
}

/** Uploaded files for one letter render. */
export interface LetterAssets {
	logo?: File | null;
	signature?: File | null;
	sampleFiles?: Record<string, File>;
}

async function readBytes(file: File): Promise<Uint8Array> {
	return new Uint8Array(await file.arrayBuffer());
}

/**
 * Prepares the virtual files for a letter: truthful extensions (Typst picks
 * the decoder by extension), signature tinted in the job's accent color,
 * samples cloned with their image paths. Pure w.r.t. app state.
 */
async function buildLetterFiles(
	job: JobData,
	allSamples: WorkSample[],
	assets: LetterAssets,
): Promise<{
	binaries: Record<string, Uint8Array>;
	samples: WorkSample[];
	logoFile?: string;
	signatureFile?: string;
}> {
	const binaries: Record<string, Uint8Array> = {};

	let logoFile: string | undefined;
	if (assets.logo) {
		logoFile = `company_logo${logoExt(assets.logo.name, assets.logo.type)}`;
		binaries[logoFile] = await readBytes(assets.logo);
	}

	let signatureFile: string | undefined;
	if (assets.signature) {
		try {
			const tinted = await tintSignatureImage(assets.signature, job.accentColor);
			binaries["signature.png"] = new Uint8Array(await tinted.arrayBuffer());
		} catch {
			binaries["signature.png"] = await readBytes(assets.signature);
		}
		signatureFile = "signature.png";
	}

	const prepared: WorkSample[] = [];
	let idx = 0;
	for (const s of visibleSamples(allSamples, job)) {
		const file = s.id ? assets.sampleFiles?.[s.id] : undefined;
		if (!file) {
			prepared.push({ ...s, image: undefined });
			continue;
		}
		const path = `sample-${idx}.png`;
		idx++;
		binaries[path] = await readBytes(file);
		prepared.push({ ...s, image: path });
	}

	return { binaries, samples: prepared, logoFile, signatureFile };
}

async function buildCvFiles(photo?: File | null): Promise<{
	binaries: Record<string, Uint8Array>;
	profileFile?: string;
}> {
	const binaries: Record<string, Uint8Array> = {};
	let profileFile: string | undefined;
	if (photo) {
		binaries["profile.png"] = await readBytes(photo);
		profileFile = "profile.png";
	}
	return { binaries, profileFile };
}

export async function compileLetter(
	shared: SharedData,
	job: JobData,
	data: LetterData,
	allSamples: WorkSample[],
	assets: LetterAssets = {},
	disclaimer = "",
): Promise<RenderedLetter> {
	const prep = await buildLetterFiles(job, allSamples, assets);
	const source = buildLetterSource(shared, job, data, prep.samples, {
		logoFile: prep.logoFile,
		signatureFile: prep.signatureFile,
		disclaimer,
	});
	const result = await compileSource(source, { binaries: prep.binaries }, "svg");
	return { pages: result.pages, warnings: result.warnings };
}

/** Compiles a letter to PDF bytes for download. */
export async function compileLetterPdf(
	shared: SharedData,
	job: JobData,
	data: LetterData,
	allSamples: WorkSample[],
	assets: LetterAssets = {},
	disclaimer = "",
): Promise<Uint8Array> {
	const prep = await buildLetterFiles(job, allSamples, assets);
	const source = buildLetterSource(shared, job, data, prep.samples, {
		logoFile: prep.logoFile,
		signatureFile: prep.signatureFile,
		disclaimer,
	});
	const result = await compileSource(source, { binaries: prep.binaries }, "pdf");
	return result.output!;
}

/** Compiles a CV to SVG pages. */
export async function compileCv(
	shared: SharedData,
	job: JobData,
	data: CvData,
	photo?: File | null,
): Promise<RenderedLetter> {
	const prep = await buildCvFiles(photo);
	const source = buildCvSource(shared, job, data, { profileFile: prep.profileFile });
	const result = await compileSource(source, { binaries: prep.binaries }, "svg");
	return { pages: result.pages, warnings: result.warnings };
}

/** Compiles a CV to PDF bytes for download. */
export async function compileCvPdf(
	shared: SharedData,
	job: JobData,
	data: CvData,
	photo?: File | null,
): Promise<Uint8Array> {
	const prep = await buildCvFiles(photo);
	const source = buildCvSource(shared, job, data, { profileFile: prep.profileFile });
	const result = await compileSource(source, { binaries: prep.binaries }, "pdf");
	return result.output!;
}
