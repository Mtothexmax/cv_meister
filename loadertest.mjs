import { createTypstCompiler } from "typst-wasm";
import { createWorkerThread } from "typst-wasm/worker/node";
import { readFileSync, existsSync } from "node:fs";
const base = "./node_modules/typst-wasm/dist";
const pkgRoot = "./src/lib/typst/packages/preview";
const mapPath = (p) => {
  const m = /^@preview\/([a-z0-9_-]+):([0-9.]+)\/(.+)$/.exec(p);
  if (!m) return null;
  return `${pkgRoot}/${m[1]}-${m[2]}/${m[3]}`;
};
const compiler = await createTypstCompiler({
  backend: "worker",
  worker: () => createWorkerThread(base + "/worker/worker-thread.js"),
  coreModules: {
    "engine.core.wasm": WebAssembly.compile(readFileSync(base + "/engine/engine.core.wasm")),
    "engine.core2.wasm": WebAssembly.compile(readFileSync(base + "/engine/engine.core2.wasm")),
    "engine.core3.wasm": WebAssembly.compile(readFileSync(base + "/engine/engine.core3.wasm")),
  },
  fileLoaders: [async (req) => {
    if (req.kind !== "package") return null;
    const local = mapPath(req.path);
    if (!local || !existsSync(local)) { console.log("MISS", req.path); return null; }
    return { data: new Uint8Array(readFileSync(local)), resolvedPath: req.path };
  }],
});
const src = `#import "@preview/fontawesome:0.6.0": *
#import "@preview/linguify:0.4.2": *
#let fau = fa-version("6")
#let lang_data = toml("lang.toml")
#set page(paper:"a4")
#fa-icon("github") Hallo #linguify("sincerely", from: lang_data)
`;
await compiler.addSource("main.typ", src);
await compiler.addFile("lang.toml", new Uint8Array(readFileSync("src/lib/typst/lang.toml")));
try {
  const r = await compiler.compile({ main: "main.typ", format: "svg" });
  console.log("OK pages:", r.pages.length, "warnings:", r.diagnostics.map(d=>d.message));
} catch(e) {
  const d = e.diagnostics ?? e.cause?.cause?.payload?.diagnostics ?? [];
  console.log("FAIL:", d.map(x=>x.formatted || x.message));
}
await compiler.dispose();
