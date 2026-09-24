// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module "*?url" {
	const url: string;
	export default url;
}

declare module "*?raw" {
	const content: string;
	export default content;
}

export {};
