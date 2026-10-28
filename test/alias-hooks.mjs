import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(import.meta.url), "../..");
export function resolve(specifier, context, next) {
  // Next handles `server-only` itself; with no bundler here it is an empty module (the npm package throws outside Next).
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    // Same fallback as tsconfig "paths": without the hosted build, @/lib/hosted/* is lib/hosted-stub/*.
    const rels = [specifier.slice(2), ...(specifier.startsWith("@/lib/hosted/") ? [specifier.slice(2).replace("lib/hosted/", "lib/hosted-stub/")] : [])];
    const file = rels.map((r) => join(root, r)).flatMap((base) => [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]).find((f) => /\.tsx?$/.test(f) && existsSync(f));
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
}
