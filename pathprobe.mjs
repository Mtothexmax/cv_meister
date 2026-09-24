import { createTypstCompiler } from "typst-wasm";
import { createWorkerThread } from "typst-wasm/worker/node";
import { readFileSync } from "node:fs";
const base = "./node_modules/typst-wasm/dist";
const seen = [];
const compiler = await createTypstCompiler({
  backend: "worker",
  worker: () => createWorkerThread(base + "/worker/worker-thread.js"),
  coreModules: {
    "engine.core.wasm": WebAssembly.compile(readFileSync(base + "/engine/engine.core.wasm")),
    "engine.core2.wasm": WebAssembly.compile(readFileSync(base + "/engine/engine.core2.wasm")),
    "engine.core3.wasm": WebAssembly.compile(readFileSync(base + "/engine/engine.core3.wasm")),
  },
  fileLoaders: [async (req) => { seen.push(req); return null; }],
});
await compiler.addSource("main.typ", `#import "@preview/fontawesome:0.6.0": *\n#fa-version("6")\n#fa-icon("github")`);
try { await compiler.compile({ main: "main.typ", format: "svg" }); } catch(e) { /* expected */ 
  console.log("err:", e.message?.slice(0,120));
}
console.log("REQUESTED PATHS:");
for (const s of seen) console.log(" ", s.kind, "|", s.path);
await compiler.dispose();
