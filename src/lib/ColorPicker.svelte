<script lang="ts">
	/**
	 * Colour picker for the application's accent colour.
	 *
	 * Modelled on the picker in the paint.svelte project (an HSV surface plus a
	 * hue strip), trimmed to what an opaque `#rrggbb` needs: no alpha channel,
	 * and a hex text field that is the point of the whole thing — the native
	 * `<input type="color">` this replaces has no field to type in on several
	 * platforms.
	 *
	 * `value` stays the single source of truth as `#rrggbb`; the HSV triple is a
	 * local editing model. It is resynced only when `value` changes from the
	 * outside (e.g. the accent colour taken from an uploaded logo), otherwise
	 * pushing our own hex would bounce straight back.
	 */
	import {
		QUICK_COLORS,
		hexToRgb,
		hsvToRgb,
		parseColorText,
		rgbToHex,
		rgbToHsv,
	} from "$lib/colorMath";

	interface Props {
		/** `#rrggbb`. */
		value: string;
	}
	let { value = $bindable("#4d3e1d") }: Props = $props();

	const initial = rgbToHsv(hexToRgb(value));
	let hue = $state(initial.h);
	let sat = $state(initial.s);
	let val = $state(initial.v);

	const rgb = $derived(hsvToRgb(hue, sat, val));
	const hex = $derived(rgbToHex(rgb));
	/** Fully saturated version of the current hue — the surface's backdrop. */
	const hueHex = $derived(rgbToHex(hsvToRgb(hue, 1, 1)));

	/**
	 * What the user has typed but not yet applied. `null` means "show the live
	 * colour"; keeping the raw text means an invalid entry can be corrected
	 * instead of being wiped on the next keystroke.
	 */
	let typed = $state<string | null>(null);
	const typedOk = $derived(typed === null || parseColorText(typed) !== null);

	$effect(() => {
		const c = hexToRgb(value);
		if (c.r !== rgb.r || c.g !== rgb.g || c.b !== rgb.b) {
			const hsv = rgbToHsv(c, hue);
			hue = hsv.h;
			sat = hsv.s;
			val = hsv.v;
		}
	});

	/** Hand the local model back to the parent. */
	function push() {
		value = rgbToHex(rgb);
	}

	function setFromHex(text: string) {
		const parsed = parseColorText(text);
		if (!parsed) return;
		const c = hexToRgb(parsed);
		const hsv = rgbToHsv(c);
		hue = hsv.h;
		sat = hsv.s;
		val = hsv.v;
		typed = null;
		push();
	}

	const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

	function ratio(el: HTMLElement, e: PointerEvent) {
		const r = el.getBoundingClientRect();
		return {
			x: clamp01((e.clientX - r.left) / Math.max(r.width, 1)),
			y: clamp01((e.clientY - r.top) / Math.max(r.height, 1)),
		};
	}

	/** Grabs the pointer so a drag keeps working outside the element. */
	function capture(el: HTMLElement, e: PointerEvent) {
		e.preventDefault();
		try {
			el.setPointerCapture(e.pointerId);
		} catch {
			/* not every environment grants capture — dragging still works */
		}
	}

	function svDown(e: PointerEvent) {
		const el = e.currentTarget as HTMLElement;
		capture(el, e);
		const { x, y } = ratio(el, e);
		sat = x;
		val = 1 - y;
		push();
	}

	function svMove(e: PointerEvent) {
		const el = e.currentTarget as HTMLElement;
		if (!el.hasPointerCapture(e.pointerId)) return;
		const { x, y } = ratio(el, e);
		sat = x;
		val = 1 - y;
		push();
	}

	function hueDown(e: PointerEvent) {
		const el = e.currentTarget as HTMLElement;
		capture(el, e);
		hue = ratio(el, e).y * 360;
		push();
	}

	function hueMove(e: PointerEvent) {
		const el = e.currentTarget as HTMLElement;
		if (!el.hasPointerCapture(e.pointerId)) return;
		hue = ratio(el, e).y * 360;
		push();
	}

	function setChannel(ch: "r" | "g" | "b", raw: string) {
		const n = parseInt(raw, 10);
		if (!Number.isFinite(n)) return;
		const next = { r: rgb.r, g: rgb.g, b: rgb.b };
		next[ch] = Math.max(0, Math.min(255, n));
		const hsv = rgbToHsv(next, hue);
		hue = hsv.h;
		sat = hsv.s;
		val = hsv.v;
		typed = null;
		push();
	}

	const numCls =
		"w-full px-1.5 py-1 bg-[#0a0f1d] border border-[#1e293b] rounded text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-blue-500";
</script>

<div class="space-y-3" id="color-picker">
	<div class="flex gap-3">
		<!-- Saturation / brightness surface: the hue as a base colour, white
		     from the left and black from the bottom. -->
		<div
			id="color-sv"
			class="relative w-[200px] h-[200px] rounded-lg cursor-crosshair touch-none select-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
			style="background-color: {hueHex}; background-image: linear-gradient(to right, #fff, rgba(255,255,255,0)), linear-gradient(to top, #000, rgba(0,0,0,0));"
			role="slider"
			tabindex="0"
			aria-label="Sättigung und Helligkeit"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(val * 100)}
			aria-valuetext={hex}
			onpointerdown={svDown}
			onpointermove={svMove}
		>
			<div
				class="absolute w-3.5 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
				style="left: {sat * 100}%; top: {(1 - val) * 100}%; background: {hex};"
			></div>
		</div>

		<!-- Hue strip: red at the top, through the spectrum and back to red at
		     the bottom. The direction matters — `to bottom` is what makes the
		     pointer maths (y → hue) and the handle position (hue → y) agree with
		     what the gradient actually shows. -->
		<div
			id="color-hue"
			class="relative w-6 h-[200px] rounded-lg cursor-pointer touch-none select-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
			style="background: linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);"
			role="slider"
			tabindex="0"
			aria-label="Farbton"
			aria-valuemin="0"
			aria-valuemax="360"
			aria-valuenow={Math.round(hue)}
			aria-valuetext="{Math.round(hue)}°"
			onpointerdown={hueDown}
			onpointermove={hueMove}
		>
			<div
				class="absolute -left-1 -right-1 h-2 rounded border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] -translate-y-1/2 pointer-events-none"
				style="top: {(hue / 360) * 100}%; background: {hueHex};"
			></div>
		</div>
	</div>

	<label class="flex items-center gap-2">
		<span
			class="w-8 h-8 rounded border border-[#1e293b] shrink-0"
			style="background: {hex};"
			aria-hidden="true"
		></span>
		<span class="text-[10px] font-semibold text-slate-400 shrink-0">Hex</span>
		<input
			id="color-hex"
			type="text"
			spellcheck="false"
			autocomplete="off"
			placeholder="#rrggbb"
			value={typed ?? hex}
			class="{numCls} text-left {typedOk ? '' : 'border-red-500'}"
			oninput={(e) => (typed = e.currentTarget.value)}
			onkeydown={(e) => {
				if (e.key === "Enter") setFromHex(e.currentTarget.value);
			}}
			onchange={(e) => {
				setFromHex(e.currentTarget.value);
				// Still unparseable on blur: go back to the live colour rather
				// than leaving a value behind that the app never took over.
				if (typed !== null && parseColorText(typed) === null) typed = null;
			}}
		/>
	</label>

	<div class="grid grid-cols-3 gap-2">
		<label class="space-y-0.5">
			<span class="block text-[10px] text-slate-400">R</span>
			<input
				type="number"
				min="0"
				max="255"
				value={rgb.r}
				class={numCls}
				oninput={(e) => setChannel("r", e.currentTarget.value)}
			/>
		</label>
		<label class="space-y-0.5">
			<span class="block text-[10px] text-slate-400">G</span>
			<input
				type="number"
				min="0"
				max="255"
				value={rgb.g}
				class={numCls}
				oninput={(e) => setChannel("g", e.currentTarget.value)}
			/>
		</label>
		<label class="space-y-0.5">
			<span class="block text-[10px] text-slate-400">B</span>
			<input
				type="number"
				min="0"
				max="255"
				value={rgb.b}
				class={numCls}
				oninput={(e) => setChannel("b", e.currentTarget.value)}
			/>
		</label>
	</div>

	<div class="grid grid-cols-8 gap-1.5">
		{#each QUICK_COLORS as q (q)}
			<button
				type="button"
				title={q}
				aria-label={q}
				class="aspect-square rounded border border-white/25 hover:ring-2 hover:ring-blue-500 transition"
				style="background: {q};"
				onclick={() => setFromHex(q)}
			></button>
		{/each}
	</div>
</div>
