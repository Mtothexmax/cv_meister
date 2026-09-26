/**
 * Local persistence (IndexedDB): the whole app state including image Blobs.
 * IndexedDB (not localStorage) because Files don't fit JSON and the 5 MB
 * localStorage quota is too small for photos. Everything is best-effort:
 * any failure (e.g. private mode) just keeps the app in-memory.
 */

const DB_NAME = "cv-meister";
const STORE = "kv";
const KEY = "state-v1";

export interface PersistedFiles {
	photo: Blob | null;
	signature: Blob | null;
	samples: Record<string, Blob>;
	/** Extra PDFs by document id (Statische Daten → PDF). */
	documents: Record<string, Blob>;
	logos: Record<string, Blob | null>;
	/**
	 * Source URL per job id, set only when the logo was loaded from a URL
	 * (JSON import). The fetched bytes live in `logos`; this keeps the origin so
	 * the application JSON can export the URL instead of image data.
	 */
	logoUrls: Record<string, string | null>;
}

export interface PersistedState {
	version: 1;
	savedAt: string;
	shared: unknown;
	jobs: unknown;
	cv: unknown;
	samples: unknown;
	/** Extra PDFs (Statische Daten → PDF). Absent in states saved before this feature. */
	documents: unknown;
	staticData: unknown;
	activeJobId: string;
	view: string;
	staticTab: string;
	files: PersistedFiles;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		try {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => {
				req.result.createObjectStore(STORE);
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error("blocked"));
		} catch (e) {
			reject(e);
		}
	});
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return openDb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				try {
					const t = db.transaction(STORE, mode);
					const req = fn(t.objectStore(STORE));
					req.onsuccess = () => {
						resolve(req.result);
						db.close();
					};
					req.onerror = () => {
						reject(req.error);
						db.close();
					};
					t.onerror = () => {
						reject(t.error);
						db.close();
					};
				} catch (e) {
					try {
						db.close();
					} catch {
						/* ignore */
					}
					reject(e);
				}
			}),
	);
}

export async function loadState(): Promise<PersistedState | null> {
	try {
		if (typeof indexedDB === "undefined") return null;
		const value = await tx("readonly", (s) => s.get(KEY));
		if (!value || typeof value !== "object") return null;
		const v = value as Partial<PersistedState>;
		if (v.version !== 1 || !Array.isArray(v.jobs) || v.jobs.length === 0) return null;
		return v as PersistedState;
	} catch {
		return null;
	}
}

export async function saveState(state: PersistedState): Promise<boolean> {
	try {
		if (typeof indexedDB === "undefined") return false;
		await tx("readwrite", (s) => s.put(state, KEY));
		return true;
	} catch {
		return false;
	}
}
