import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, relative, sep, extname } from "node:path";
import ts from "typescript";

export interface Violation {
  file: string;
  rule: string;
  detail: string;
}
const ignored = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "artifacts",
  "test-results",
  "playwright-report",
  ".cache",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const codeExtensions = new Set([...sourceExtensions, ".css", ".html", ".json", ".svg"]);
const isTest = (name: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
const isDeclaration = (name: string) => /\.d\.[cm]?ts$/.test(name);
function walk(directory: string, inSource = false): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((entry) => {
      if ((!inSource && ignored.has(entry.name)) || entry.isSymbolicLink()) return [];
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path, inSource || entry.name === "src") : [path];
    });
}
const metrics = ["lines", "statements", "functions", "branches"] as const;
type Metric = (typeof metrics)[number];
interface CoverageMetric {
  pct?: number;
  total?: number;
  covered?: number;
}
type CoverageReport = Record<string, Partial<Record<Metric, CoverageMetric>>>;

function forbiddenModule(specifier: string): boolean {
  const packages = [
    "react",
    "react-dom",
    "jotai",
    "three",
    "@react-three",
    "@radix-ui",
    "radix-ui",
    "@musart/web",
    "@musart/render",
  ];
  return (
    packages.some((name) => specifier === name || specifier.startsWith(`${name}/`)) ||
    specifier.split("/").some((segment) => ["components", "services", "apps"].includes(segment))
  );
}
function importsUiOrGpu(file: string, content: string): boolean {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  let forbidden = false;
  const check = (node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node) && forbiddenModule(node.text)) forbidden = true;
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) check(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      check(node.moduleReference.expression);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      check(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return forbidden;
}
function checkCriticalCoverage(
  root: string,
  sources: string[],
  data: CoverageReport,
  violations: Violation[],
): void {
  for (const directory of ["packages/core/src", "packages/engine/src"]) {
    const prefix = resolve(root, directory) + sep;
    const files = sources.filter((file) => file.startsWith(prefix));
    if (!files.length) continue;
    for (const metric of metrics) {
      let total = 0,
        covered = 0,
        valid = true;
      for (const file of files) {
        const value = data[file]?.[metric];
        if (
          !value ||
          typeof value.total !== "number" ||
          typeof value.covered !== "number" ||
          !Number.isSafeInteger(value.total) ||
          !Number.isSafeInteger(value.covered) ||
          value.total < 0 ||
          value.covered < 0 ||
          value.covered > value.total
        ) {
          valid = false;
          continue;
        }
        total += value.total;
        covered += value.covered;
      }
      const pct = total === 0 ? 100 : (covered / total) * 100;
      if (!valid || pct < 85)
        violations.push({
          file: directory,
          rule: "coverage-critical-package",
          detail: `${metric}: ${valid ? `${covered}/${total} (${pct.toFixed(2)}%)` : "comptages manquants ou invalides"}; minimum 85%.`,
        });
    }
  }
}
export function audit(root: string, coverage = false): Violation[] {
  const violations: Violation[] = [];
  const files = walk(root);
  const sources = files.filter(
    (file) =>
      relative(root, file).split(sep).includes("src") &&
      sourceExtensions.has(extname(file)) &&
      !isDeclaration(file),
  );
  for (const file of files.filter((file) => codeExtensions.has(extname(file)))) {
    const rel = relative(root, file).split(sep).join("/");
    const content = readFileSync(file, "utf8");
    const count = content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
    if (count > 600)
      violations.push({ file: rel, rule: "max-lines", detail: `${count} lignes > 600` });
    const parts = rel.split("/");
    if (
      parts.includes("src") &&
      (isTest(file) || parts.some((part) => ["test", "tests", "__tests__"].includes(part)))
    )
      violations.push({
        file: rel,
        rule: "test-in-src",
        detail: "Les tests appartiennent au dossier test/ miroir.",
      });
  }
  for (const file of sources.filter((file) => !isTest(file))) {
    const parts = file.split(sep);
    const position = parts.lastIndexOf("src");
    parts[position] = "test";
    const mirror = parts.join(sep).replace(/\.([cm]?[jt]sx?)$/, ".test.$1");
    if (!existsSync(mirror))
      violations.push({
        file: relative(root, file),
        rule: "missing-test",
        detail: `Attendu: ${relative(root, mirror)}`,
      });
    const sourceText = readFileSync(file, "utf8");
    if (/\.(?:readRenderTargetPixels(?:Async)?|readPixels|mapAsync)\s*\(/.test(sourceText)) {
      violations.push({
        file: relative(root, file),
        rule: "gpu-readback",
        detail: "Le rendu de production ne lit pas les pixels GPU dans JavaScript.",
      });
    }
    if (
      /\.(?:createRenderPipeline(?:Async)?|createComputePipeline(?:Async)?|createShaderModule|createBindGroup|createCommandEncoder|requestDevice)\s*\(/.test(
        sourceText,
      )
    ) {
      violations.push({
        file: relative(root, file),
        rule: "three-only",
        detail: "Utiliser Three.js WebGPURenderer et TSL, sans moteur WebGPU natif.",
      });
    }
    if (
      file.includes(`${sep}packages${sep}core${sep}src${sep}`) &&
      importsUiOrGpu(file, sourceText)
    ) {
      violations.push({
        file: relative(root, file),
        rule: "core-boundary",
        detail: "Le moteur pur ne dépend pas du DOM, UI ou GPU.",
      });
    }
  }
  if (coverage) {
    const report = resolve(root, "coverage/coverage-summary.json");
    if (!existsSync(report))
      violations.push({
        file: "coverage/coverage-summary.json",
        rule: "coverage-report",
        detail: "Exécuter test:coverage avant le contrôle.",
      });
    else {
      let data: CoverageReport | undefined;
      try {
        const parsed: unknown = JSON.parse(readFileSync(report, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          data = parsed as CoverageReport;
      } catch {
        /* Invalid reports are reported as a deterministic violation below. */
      }
      if (!data)
        violations.push({
          file: "coverage/coverage-summary.json",
          rule: "coverage-report",
          detail: "Rapport de couverture invalide.",
        });
      else {
        for (const metric of metrics) {
          const pct = data.total?.[metric]?.pct;
          if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 85 || pct > 100)
            violations.push({
              file: "coverage",
              rule: "coverage-threshold",
              detail: `${metric}: ${String(pct)}% hors du seuil 85–100%.`,
            });
        }
        const production = sources.filter((file) => !isTest(file));
        for (const file of production) {
          if (!data[file])
            violations.push({
              file: relative(root, file),
              rule: "coverage-missing-source",
              detail: "Source absente du rapport de couverture.",
            });
        }
        checkCriticalCoverage(root, production, data, violations);
      }
    }
  }
  return violations.sort((a, b) =>
    `${a.file}:${a.rule}`.localeCompare(`${b.file}:${b.rule}`, "en"),
  );
}
if (import.meta.main) {
  const violations = audit(process.cwd(), process.argv.includes("--coverage"));
  for (const violation of violations)
    console.error(`${violation.file} [${violation.rule}] ${violation.detail}`);
  console.log(`Règles: ${violations.length} manquement(s).`);
  process.exitCode = violations.length ? 1 : 0;
}
