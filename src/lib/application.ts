/**
 * Builds the Typst source for a *combined* application document: the cover
 * letter first, then the CV, in one PDF.
 *
 * Why a separate module instead of concatenating the two existing sources:
 * both `buildLetterSource` and `buildCvSource` end in a `#show:` rule that
 * reconfigures the whole template (`coverletter.with(…)` / `resume.with(…)`).
 * A `#show` rule applies to the rest of the enclosing block, so simply
 * appending one source to the other would run the *entire* second document
 * through whichever rule came last. Instead the two bodies are built as named
 * functions and called in sequence, each under its own local rule.
 *
 * Only the letter's head is special: its `#show: coverletter.with(…)` sets up
 * the letterhead and therefore has to be active while the letter body is laid
 * out. A function scope gives it exactly that, without touching the CV.
 */

import { buildLetterSource, type LetterData, type WorkSample } from "./letter.js";
import { buildCvSource, type CvData } from "./cv.js";
import type { SharedData } from "./shared.js";
import type { JobData } from "./job.js";

/**
 * Re-uses the proven single-document builders by wrapping each finished source
 * in a function. The source is already a complete document, so everything from
 * the `#import` down through the `#show` rule travels along as-is — no second
 * copy of the template knowledge has to be maintained here.
 *
 * The body is a *content* block (`[ … ]`), not a code block (`{ … }`): the
 * wrapped source is markup interleaved with `#`-prefixed statements
 * (`#import`, `#let`, `#show`, …), and inside a code block every one of those
 * leading `#` is a syntax error — "the character `#` is not valid in code".
 * A content block is the one construct that accepts both statements and markup.
 *
 * `inset` is prepended verbatim (the letter's imports and its `#show` rule end
 * up inside the closure, which is exactly what scopes them), and the result is
 * `indented` so the generated file stays readable in a `typst` traceback.
 */
function asFunction(name: string, source: string, inset = ""): string {
	return `#let ${name}() = [\n${inset}${indent(source)}\n]`;
}

function indent(text: string): string {
	return text
		.split("\n")
		.map((line) => (line.length > 0 ? `  ${line}` : line))
		.join("\n");
}

/**
 * The combined document: Anschreiben, a page break, Lebenslauf.
 *
 * Both halves are compiled by a *single* Typst run, which is what makes the
 * result one real PDF (correct bookmarks, shared font subsetting) rather than
 * two documents stapled together after the fact.
 */
export function buildApplicationSource(
	shared: SharedData,
	job: JobData,
	letter: LetterData,
	cv: CvData,
	samples: WorkSample[],
	opts: {
		logoFile?: string;
		signatureFile?: string;
		disclaimer?: string;
		profileFile?: string;
	},
): string {
	const letterSource = buildLetterSource(shared, job, letter, samples, {
		logoFile: opts.logoFile,
		signatureFile: opts.signatureFile,
		disclaimer: opts.disclaimer,
	});
	const cvSource = buildCvSource(shared, job, cv, { profileFile: opts.profileFile });

	return `${asFunction("anschreiben", letterSource)}
${asFunction("lebenslauf", cvSource)}

// Ein Dokument, zwei Teile. Der Seitenumbruch davor garantiert, dass der
// Lebenslauf auf einer frischen Seite beginnt und nicht in den Rest des
// Anschreibens laeuft.
#anschreiben()
#pagebreak(weak: false)
#lebenslauf()
`;
}

/**
 * Wraps a *finished* single-document source so it can be passed to
 * {@link compileSource} as the combined entry point. Used by the tests to prove
 * the wrapper is faithful (one half alone must still produce its own pages).
 */
export function wrapSingleSource(name: string, source: string): string {
	return `${asFunction(name, source)}

#${name}()
`;
}
