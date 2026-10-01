import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(import.meta.url), "../..");
export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = join(root, specifier.slice(2));
    const file = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((f) => /\.tsx?$/.test(f) && existsSync(f));
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
}
