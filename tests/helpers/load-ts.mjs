import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function createLoader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    const fullPath = resolve(file);
    if (cache.has(fullPath)) return cache.get(fullPath).exports;
    const compiled = { exports: {} };
    cache.set(fullPath, compiled);
    const source = ts.transpileModule(readFileSync(fullPath, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", source)((name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      return name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name);
    }, compiled, compiled.exports);
    return compiled.exports;
  }
  return load;
}
