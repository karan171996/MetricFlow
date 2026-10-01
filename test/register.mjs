// Lets node:test import app TypeScript that uses the "@/..." path alias (no bundler).
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
