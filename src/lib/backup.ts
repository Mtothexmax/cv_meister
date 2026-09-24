/**
 * Whole-workspace backup as JSON: all state plus uploaded images as base64.
 * Generated PDFs/EMLs are deliberately excluded (they are rebuilt on demand).
 */

export interface BackupFile {
	/** Original file name. */
	name: string;
	/** data: URL (base64). */
	dataUrl: string;
}

export interface WorkspaceBackup {
	app: "cv-meister";
	version: 1;
	exportedAt: string;
	state: {
		shared: unknown;
		jobs: unknown;
		cv: unknown;
		samples: unknown;
		staticData: unknown;
		activeJobId: string;
		view: string;
		staticTab: string;
	};
	files: {
		photo: BackupFile | null;
		signature: BackupFile | null;
		samples: Record<string, BackupFile>;
		logos: Record<string, BackupFile | null>;
	};
}

/** Minimal shape check before importing. */
export function isWorkspaceBackup(v: unknown): v is WorkspaceBackup {
	if (!v || typeof v !== "object") return false;
	const b = v as Partial<WorkspaceBackup>;
	return (
		b.app === "cv-meister" &&
		b.version === 1 &&
		typeof b.state === "object" &&
		b.state !== null &&
		Array.isArray((b.state as { jobs?: unknown }).jobs) &&
		((b.state as { jobs?: unknown[] }).jobs as unknown[]).length > 0 &&
		typeof b.files === "object" &&
		b.files !== null
	);
}

function fileToDataUrl(file: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("Lesen fehlgeschlagen"));
		reader.readAsDataURL(file);
	});
}

export async function toBackupFile(
	file: Blob | null | undefined,
	fallbackName: string,
): Promise<BackupFile | null> {
	if (!file) return null;
	const name = file instanceof File && file.name ? file.name : fallbackName;
	return { name, dataUrl: await fileToDataUrl(file) };
}

const MIME_EXT: [string, string][] = [
	["image/png", "png"],
	["image/jpeg", "jpg"],
	["image/gif", "gif"],
	["image/webp", "webp"],
	["image/svg+xml", "svg"],
];

/** Restores a File from a backup entry (null on any problem). */
export function backupFileToFile(entry: BackupFile | null | undefined): File | null {
	try {
		if (!entry || typeof entry.dataUrl !== "string") return null;
		const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(entry.dataUrl);
		if (!m) return null;
		const mime = m[1] || "application/octet-stream";
		const bin = atob(m[2]);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		let name = typeof entry.name === "string" && entry.name ? entry.name : "datei";
		if (!/\.[a-z0-9]+$/i.test(name)) {
			const ext = MIME_EXT.find(([t]) => t === mime)?.[1] ?? "bin";
			name = `${name}.${ext}`;
		}
		return new File([bytes], name, { type: mime });
	} catch {
		return null;
	}
}
