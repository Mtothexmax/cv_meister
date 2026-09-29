<script lang="ts">
	/**
	 * Marketing landing page — shown at "/" (no hash) or "#start".
	 *
	 * The hero form is the single conversion step: it takes an e-mail address,
	 * registers it with this project's MailerLite form and only then hands over
	 * to the editor. Only the submit *target* is MailerLite's — the markup and
	 * the styling are ours (their embed CSS is deliberately not used).
	 *
	 * Because of that, the big CTAs do not navigate any more: they move the caret
	 * into that e-mail field. Plain text links still reach the editor, so a
	 * MailerLite outage cannot lock anyone out. Navigation itself is handled by
	 * the hash listener in +page.svelte (that also makes the editor bookmarkable).
	 *
	 * Styling: Tailwind v4 with arbitrary colour values (no CDN, no config
	 * extension) so the page works offline and on GitHub Pages.
	 */
	import { onMount } from "svelte";
	import { rememberVisitor, visitorEmail } from "$lib/visitor";

	let { onStart }: { onStart: () => void } = $props();

	/**
	 * MailerLite form of this project (account 2668691). Used as the form's
	 * `action` — the signup is submitted by the browser itself, not by script.
	 */
	const SUBSCRIBE_URL =
		"https://assets.mailerlite.com/jsonp/2668691/forms/199914375195133102/subscribe";

	let email = $state("");
	/** idle -> sending -> done */
	let status = $state<"idle" | "sending" | "done">("idle");
	let emailEl = $state<HTMLInputElement | undefined>();
	let formEl = $state<HTMLFormElement | undefined>();
	let frameEl = $state<HTMLIFrameElement | undefined>();

	/**
	 * Moves the caret into the e-mail field. Every CTA funnels here: the
	 * newsletter signup is the only conversion step, so a button that used to
	 * jump straight into the editor first asks for the address.
	 */
	function focusEmail() {
		emailEl?.scrollIntoView({ block: "center", behavior: "smooth" });
		emailEl?.focus({ preventScroll: true });
	}

	/**
	 * Prefills the address of a returning visitor.
	 *
	 * Deliberately not part of the initial state: this page is prerendered, so
	 * reading localStorage while the component is created would make the client's
	 * first render differ from the server's HTML. By the time this runs the
	 * markup already matches and the field is simply filled in. Only ever
	 * visible when someone opens the landing deliberately via "#start" — a
	 * returning visitor is sent to the editor before seeing this page.
	 */
	onMount(() => {
		const saved = visitorEmail();
		if (saved && !email) email = saved;
	});

	/**
	 * Submits the signup as an ordinary HTML form POST — the only way we send it.
	 *
	 * A `fetch()` to `assets.mailerlite.com` is refused by ad blockers with
	 * `ERR_BLOCKED_BY_CLIENT` before anything leaves the browser, and that refusal
	 * cannot be worked around from page script: the request never happens, so
	 * there is no error to catch and no CORS trick to apply. An ordinary form
	 * submission is treated as a document load instead and normally passes. Not
	 * even attempting the scripted request also keeps the console clean.
	 *
	 * The POST is aimed at a hidden iframe, so the browser stays on this page
	 * rather than navigating to the endpoint's raw JSON. `submit` is called off
	 * `HTMLFormElement.prototype` because a field named "submit" would shadow it.
	 *
	 * Resolves on the iframe's `load`, or after a short grace period: a blocked
	 * iframe may never fire one, and the visitor must not be left waiting.
	 */
	function postNatively(): Promise<void> {
		const form = formEl;
		const frame = frameEl;
		if (!form) return Promise.resolve();
		if (!frame) {
			HTMLFormElement.prototype.submit.call(form);
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				frame.removeEventListener("load", finish);
				resolve();
			};
			frame.addEventListener("load", finish);
			setTimeout(finish, 1500);
			HTMLFormElement.prototype.submit.call(form);
		});
	}

	/**
	 * Hands the address to MailerLite and then opens the editor.
	 *
	 * The browser performs the POST, so we cannot read the answer — the endpoint
	 * is cross-origin and the reply lands in the hidden iframe. That is the price
	 * of a submission no ad blocker kills: no `success` flag and no rejection we
	 * could report. Two consequences: a malformed address is caught only by the
	 * input's own `type="email"`/`required` validation, and the editor opens
	 * either way — our marketing form must never become a locked door in front of
	 * the product.
	 */
	async function subscribe(e: SubmitEvent) {
		e.preventDefault();
		const address = email.trim();
		if (!address || status === "sending") return;

		// Write the trimmed address back: the POST carries the DOM value, not
		// `email`, so trailing whitespace would otherwise go out as typed.
		email = address;

		status = "sending";
		await postNatively();
		// The signup went out — remember it, so a bare "/" goes straight to the
		// editor from now on instead of showing this page a second time.
		rememberVisitor(address);
		status = "done";
		onStart();
	}

	const steps = [
		{
			n: 1,
			tone: "blue",
			title: "Stellen-Link einfügen",
			text: "Kopiere den Link einer beliebigen Stellenanzeige — StepStone, LinkedIn, Indeed oder direkt von der Unternehmensseite.",
		},
		{
			n: 2,
			tone: "purple",
			title: "Anschreiben & CV anpassen",
			text: "Der Editor zieht deine echten Stationen heran und baut daraus ein passgenaues Anschreiben — Zeile für Zeile editierbar.",
		},
		{
			n: 3,
			tone: "emerald",
			title: "Als PDF versenden",
			text: "Lebenslauf und Anschreiben werden lokal als PDF gesetzt, die Bewerbungs-Mail als Entwurf erzeugt. Alles bleibt auf deinem Gerät.",
		},
	];

	const bullets = [
		{
			title: "Alles lokal, kein Server",
			text: "Deine Daten liegen in deinem Browser (IndexedDB) — nichts wird hochgeladen, nichts verlässt dein Gerät.",
		},
		{
			title: "Echter PDF-Satz statt Textbausteine",
			text: "Lebenslauf und Anschreiben werden über Typst gesetzt — mit Foto, Logo, Akzentfarbe pro Bewerbung.",
		},
		{
			title: "Ein Bewerbungs-Tracker obendrauf",
			text: "Entwurf, in Bearbeitung, verschickt: du siehst auf einen Blick, wo welche Bewerbung steht.",
		},
	];

	const navCls = "hover:text-blue-400 transition";
	const cardCls = "bg-[#131c31] border border-gray-800 rounded-2xl";
</script>

<svelte:head>
	<!-- The <title> is owned by the router in +page.svelte (it switches with the route). -->
	<meta
		name="description"
		content="Stellenanzeige einfügen, Anschreiben und Lebenslauf passgenau erstellen, als PDF versenden — lokal im Browser, ohne Konto."
	/>
</svelte:head>

<!-- id="start" makes "#start" a real anchor (the editor links back to it) and
     keeps the prerenderer's hash-link check happy. -->
<div
	id="start"
	class="min-h-screen bg-[#0a0f1d] text-gray-100 antialiased selection:bg-blue-500 selection:text-white"
>
	<!-- Navigation -->
	<header class="sticky top-0 z-50 backdrop-blur-md bg-[#0a0f1d]/85 border-b border-gray-800">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
			<a href="#start" class="flex items-center space-x-3 group">
				<div
					class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center shadow-[0_0_25px_rgba(59,130,246,0.3)]"
				>
					<svg
						class="w-5 h-5 text-white"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M13 2 4.1 13a1 1 0 0 0 .8 1.6H11l-1 7.4 8.9-11A1 1 0 0 0 18.1 9.4H12L13 2Z" />
					</svg>
				</div>
				<span class="text-xl sm:text-2xl font-extrabold tracking-wider uppercase text-white">
					CV Meister <span class="text-blue-500">Pro</span>
				</span>
			</a>

			<nav class="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-300">
				<a href="#features" class={navCls}>Features</a>
				<a href="#how-it-works" class={navCls}>Wie es funktioniert</a>
				<a href="#preview" class={navCls}>Vorschau</a>
			</nav>

			<button
				type="button"
				id="cta-header"
				onclick={focusEmail}
				class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow-[0_0_25px_rgba(59,130,246,0.3)] transition transform hover:-translate-y-0.5 text-sm shrink-0"
			>
				Editor öffnen
			</button>
		</div>
	</header>

	<!-- Hero -->
	<section class="relative pt-20 pb-28 overflow-hidden">
		<div
			class="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[500px] pointer-events-none bg-[radial-gradient(circle,rgba(59,130,246,0.15)_0%,rgba(10,15,29,0)_70%)]"
		></div>

		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
			<div
				class="inline-flex items-center space-x-2 bg-blue-950/60 border border-blue-500/30 px-4 py-1.5 rounded-full text-blue-400 text-xs sm:text-sm font-medium mb-8"
			>
				<span class="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
				<span>Läuft komplett im Browser — kein Konto, kein Upload</span>
			</div>

			<h1 class="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
				Traumjob finden. <br />
				<span
					class="bg-gradient-to-br from-[#60a5fa] via-[#a78bfa] to-[#34d399] bg-clip-text text-transparent"
					>Passgenau beworben.</span
				>
			</h1>

			<p class="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-12 font-light">
				Schluss mit stundenlangem Anschreiben-Schreiben: Stellenanzeige einfügen, Anschreiben und Lebenslauf
				im Editor anpassen, als PDF exportieren. Deine Daten bleiben dabei auf deinem Gerät.
			</p>

			<!-- Newsletter → Editor -->
			<div class="max-w-2xl mx-auto bg-[#131c31] p-3 sm:p-4 rounded-2xl border border-gray-800 shadow-[0_0_50px_rgba(139,92,246,0.2)]">
				<!-- Real action/method/target: subscribe() submits this form the
				     ordinary way (see postNatively) rather than with fetch(), so an
				     ad blocker that refuses scripted requests to MailerLite cannot
				     swallow the signup. The hidden iframe is the target, so the
				     browser stays here instead of showing the endpoint's raw JSON. -->
				<form
					bind:this={formEl}
					onsubmit={subscribe}
					action={SUBSCRIBE_URL}
					method="POST"
					target="ml-subscribe"
					class="flex flex-col sm:flex-row gap-3"
				>
					<div class="relative flex-grow">
						<div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
							<svg
								class="w-4 h-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
								<path d="m3.2 6.8 8.8 5.9 8.8-5.9" />
							</svg>
						</div>
						<input
							id="newsletter-email"
							name="fields[email]"
							type="email"
							required
							autocomplete="email"
							aria-label="E-Mail-Adresse"
							bind:value={email}
							bind:this={emailEl}
							class="w-full pl-11 pr-4 py-3.5 bg-[#0a0f1d] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm sm:text-base transition"
							placeholder="Deine E-Mail-Adresse…"
						/>
					</div>
					<button
						type="submit"
						disabled={status === "sending"}
						class="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 hover:opacity-95 disabled:opacity-70 disabled:cursor-wait text-white font-bold px-8 py-3.5 rounded-xl shadow-[0_0_25px_rgba(59,130,246,0.3)] transition duration-200 flex items-center justify-center space-x-2 text-sm sm:text-base shrink-0"
					>
						<span>Bewerbung starten</span>
						{#if status === "sending"}
							<span
								class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
								aria-hidden="true"
							></span>
						{:else}
							<svg
								class="w-4 h-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M5 12h14M13 6l6 6-6 6" />
							</svg>
						{/if}
					</button>

					<!-- MailerLite's own fields, so the POST carries the payload its
					     form expects. -->
					<input type="hidden" name="ml-submit" value="1" />
					<input type="hidden" name="anticsrf" value="true" />
				</form>

				<iframe
					bind:this={frameEl}
					name="ml-subscribe"
					title="Newsletter-Anmeldung"
					aria-hidden="true"
					tabindex="-1"
					class="hidden"
				></iframe>
			</div>

			<p id="newsletter-note" class="text-xs text-gray-500 mt-4">
				Mit dem Absenden trittst du dem Newsletter bei. Abmeldung jederzeit möglich.
			</p>
			<p class="text-xs text-gray-500 mt-2">
				Lokal gespeichert, keine Kreditkarte, kein Login.
				<span class="mx-1">·</span>
				<a href="#editor" class="text-blue-400 hover:text-blue-300 underline">Direkt in den Editor</a
				>.
			</p>
		</div>
	</section>

	<!-- Wie es funktioniert -->
	<section id="how-it-works" class="py-24 border-t border-gray-800/80 bg-[#131c31]/30 scroll-mt-20">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center max-w-3xl mx-auto mb-16">
				<h2 class="text-xs uppercase tracking-widest text-blue-400 font-bold mb-3">Workflow</h2>
				<h3 class="text-3xl sm:text-4xl font-extrabold text-white">In drei Schritten zur fertigen Bewerbung</h3>
				<p class="text-gray-400 mt-4">Von der offenen Stelle zum versandfertigen PDF — ohne Agentur, ohne Abo.</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				{#each steps as step (step.n)}
					<div class="{cardCls} p-8 relative hover:border-blue-500/50 transition">
						<div
							class="absolute -top-4 left-8 w-10 h-10 rounded-xl {step.tone === 'blue'
								? 'bg-blue-600'
								: step.tone === 'purple'
									? 'bg-purple-600'
									: 'bg-emerald-600'} text-white font-extrabold flex items-center justify-center"
						>
							{step.n}
						</div>
						<div
							class="mt-4 mb-6 {step.tone === 'blue'
								? 'text-blue-400'
								: step.tone === 'purple'
									? 'text-purple-400'
									: 'text-emerald-400'}"
						>
							<svg
								class="w-8 h-8"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								{#if step.n === 1}
									<path d="M4 4l7.5 16 2.2-6.3L20 11.5 4 4Z" />
								{:else if step.n === 2}
									<path d="M5 3v4M3 5h4M6 17v4M4 19h4" />
									<path d="M14 3l1.9 4.6L20.5 9.5 15.9 11.4 14 16l-1.9-4.6L7.5 9.5l4.6-1.9L14 3Z" />
								{:else}
									<path d="M22 2 11 13" />
									<path d="M22 2 15 22l-4-9-9-4 20-7Z" />
								{/if}
							</svg>
						</div>
						<h4 class="text-xl font-bold text-white mb-3">{step.title}</h4>
						<p class="text-gray-400 text-sm leading-relaxed">{step.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Features + Vorschau -->
	<section id="features" class="py-24 border-t border-gray-800/80 scroll-mt-20">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
				<div class="space-y-6">
					<div
						class="inline-block bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-lg text-emerald-400 text-xs font-semibold"
					>
						Was drin steckt
					</div>
					<h3 class="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
						Volle Kontrolle über <span class="text-emerald-400">jede Bewerbung</span>
					</h3>
					<p class="text-gray-400 text-base">
						Jede Bewerbung ist ein eigener Arbeitsbereich: eigene Firma, eigene Ansprechperson, eigene
						Akzentfarbe, eigene Auswahl aus deinem Lebenslauf. Die Stammdaten pflegst du nur einmal.
					</p>

					<div class="space-y-4 pt-2">
						{#each bullets as b (b.title)}
							<div class="flex items-start space-x-3">
								<div
									class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-1"
								>
									<svg
										class="w-3 h-3"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M20 6 9 17l-5-5" />
									</svg>
								</div>
								<div>
									<h5 class="text-white font-semibold text-sm">{b.title}</h5>
									<p class="text-gray-400 text-xs mt-0.5">{b.text}</p>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Produkt-Vorschau (Mockup) -->
				<div
					id="preview"
					class="{cardCls} p-6 sm:p-8 rounded-3xl shadow-[0_0_50px_rgba(139,92,246,0.2)] relative overflow-hidden scroll-mt-20"
				>
					<div
						class="absolute top-0 right-0 translate-x-4 -translate-y-4 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl"
					></div>

					<div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
						<div class="flex items-center space-x-2">
							<div class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
							<span class="text-xs font-bold text-gray-300 uppercase tracking-wider">Vorschau</span>
						</div>
						<span class="text-xs bg-[#0a0f1d] px-2.5 py-1 rounded-md text-gray-400 border border-gray-800"
							>CV Meister Pro</span
						>
					</div>

					<div class="space-y-6 text-center my-8">
						<h4 class="text-sm font-bold text-white tracking-wide uppercase">
							Status: Bewerbungen versenden
						</h4>
						<div class="w-full bg-[#0a0f1d] p-2 rounded-2xl border border-gray-800">
							<div
								class="w-full bg-gradient-to-r from-blue-600 via-emerald-500 to-amber-500 h-10 rounded-xl flex items-center justify-center text-black font-extrabold text-xl"
							>
								39 / 40
							</div>
						</div>
						<p class="text-base sm:text-lg font-bold text-white">Fast geschafft — noch 1 Bewerbung übrig.</p>
					</div>

					<div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800 text-center">
						<div class="bg-[#0a0f1d]/60 p-3 rounded-xl border border-gray-800">
							<span class="block text-2xl font-extrabold text-emerald-400">1,2 s</span>
							<span class="text-xs text-gray-400">bis zum PDF</span>
						</div>
						<div class="bg-[#0a0f1d]/60 p-3 rounded-xl border border-gray-800">
							<span class="block text-2xl font-extrabold text-blue-400">0</span>
							<span class="text-xs text-gray-400">Daten in der Cloud</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="py-24 bg-gradient-to-t from-[#0a0f1d] to-[#131c31] border-t border-gray-800">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div
				class="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mx-auto mb-6 text-blue-400"
			>
				<svg
					class="w-8 h-8"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3 0Z" />
					<path d="M12 15 9 12a12 12 0 0 1 3.5-7.5C14.5 2.5 19 2 21 2c0 2-.5 6.5-2.5 8.5A12 12 0 0 1 12 15Z" />
					<path d="M9 12H5s.5-2.5 2-4c1.7-1.7 5-1 5-1" />
					<path d="M12 15v4s2.5-.5 4-2c1.7-1.7 1-5 1-5" />
				</svg>
			</div>
			<h3 class="text-3xl sm:text-5xl font-extrabold text-white mb-6">Bereit für den nächsten Schritt?</h3>
			<p class="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
				Öffne den Editor, trage deine Stammdaten einmal ein und erstelle deine erste Bewerbung.
			</p>
			<button
				type="button"
				id="cta-bottom"
				onclick={focusEmail}
				class="inline-flex items-center space-x-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 text-white font-bold px-8 py-4 rounded-xl shadow-[0_0_25px_rgba(59,130,246,0.3)] text-lg transition transform hover:-translate-y-1"
			>
				<span>Jetzt Bewerbung erstellen</span>
				<svg
					class="w-5 h-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M5 12h14M13 6l6 6-6 6" />
				</svg>
			</button>
			<p class="text-xs text-gray-500 mt-6">
				Der Editor merkt sich deinen Stand automatisch — Lesezeichen auf <code
					class="text-gray-400">#editor</code
				> genügt.
			</p>
		</div>
	</section>

	<!-- Footer -->
	<footer class="bg-[#0a0f1d] border-t border-gray-800/80 py-12">
		<div
			class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6"
		>
			<div class="flex items-center space-x-3">
				<div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M13 2 4.1 13a1 1 0 0 0 .8 1.6H11l-1 7.4 8.9-11A1 1 0 0 0 18.1 9.4H12L13 2Z" />
					</svg>
				</div>
				<span class="text-lg font-bold text-white tracking-wider uppercase">CV Meister Pro</span>
			</div>
			<p class="text-xs text-gray-500 text-center md:text-left">
				Demo-Projekt: Die Zahlen in der Vorschau sind Beispielwerte. Alle Eingaben bleiben lokal im Browser.
			</p>
			<div class="flex space-x-6 text-gray-400 text-sm">
				<a href="#features" class={navCls}>Features</a>
				<a href="#editor" class={navCls}>Editor</a>
			</div>
		</div>
	</footer>
</div>
