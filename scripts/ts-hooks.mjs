// Module hooks that let a plain node script import the app's server TypeScript (src/lib/data/*.ts and the like)
// with no bundler: `@/…` resolves to src/, extensionless imports find their .ts file, TypeScript is transpiled
// with the repo's own `typescript` package, and two Next-only imports get stand-ins ("server-only" is a no-op,
// "next/cache" revalidations do nothing). Used by scripts/test-xp-math.mjs. Register it first:
//   import { register } from "node:module"; register("./ts-hooks.mjs", import.meta.url);
// A test can swap whole modules for its own fakes: register(..., { data: { stubs: { "@/app/actions": fileUrl } } }).
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const SRC = new URL("../src/", import.meta.url);
const STUBS = {
  "server-only": "export {};",
  "next/cache": "export function revalidatePath() {}\nexport function revalidateTag() {}\nexport function unstable_cache(fn) { return fn; }\nexport function updateTag() {}",
};

let extra = {};
export async function initialize(data) {
  extra = data?.stubs ?? {};
}

function findTs(base) {
  const p = fileURLToPath(base);
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const f = p + ext;
    if (existsSync(f) && statSync(f).isFile()) return pathToFileURL(f).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier in extra) return { url: extra[specifier], shortCircuit: true };
  if (specifier in STUBS) return { url: `stub:${specifier}`, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const hit = findTs(new URL(specifier.slice(2), SRC));
    if (hit) return { url: hit, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && /\.tsx?$/.test(context.parentURL)) {
    const hit = findTs(new URL(specifier, context.parentURL));
    if (hit) return { url: hit, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("stub:")) return { format: "module", source: STUBS[url.slice(5)], shortCircuit: true };
  if (/\.tsx?$/.test(url)) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false, isolatedModules: true },
    });
    return { format: "module", source: out.outputText, shortCircuit: true };
  }
  return next(url, context);
}
