import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Keep partial reports separate and instrument only the requested executable sources. */
export function relatedCoverageArguments(
  paths: readonly string[],
  direct = false,
  hasFile: (path: string) => boolean = existsSync,
): string[] {
  const sources = [...new Set(paths.map((path) => path.replace(/^\.\//, "")))].filter(
    (path) =>
      /^(apps|packages)\/[^/]+\/src\/.+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path) &&
      !/\.d\.(ts|mts|cts)$/.test(path) &&
      !path.split("/").includes(".."),
  );
  if (!sources.length)
    throw new Error("No executable sources selected. Pass source paths or edit a source file.");
  const mirrors = sources.map((source) =>
    source.replace("/src/", "/test/").replace(/(\.[^.]+)$/, ".test$1"),
  );
  const useMirrors = direct && mirrors.every((mirror) => hasFile(mirror));
  return [
    ...(useMirrors ? ["run"] : ["related", "--run"]),
    "--coverage",
    "--coverage.reportsDirectory=artifacts/coverage-related",
    ...sources.flatMap((source) => ["--coverage.include", source]),
    ...(useMirrors ? mirrors : sources),
  ];
}

if (import.meta.main) {
  try {
    const direct = process.argv.includes("--direct");
    const explicit = process.argv
      .slice(2)
      .filter((argument) => !["--", "--direct"].includes(argument));
    const changed = () =>
      [
        execFileSync("git", ["diff", "--name-only", "-z", "HEAD"], { encoding: "utf8" }),
        execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
          encoding: "utf8",
        }),
      ].flatMap((output) => output.split("\0").filter(Boolean));
    const args = relatedCoverageArguments(explicit.length ? explicit : changed(), direct);
    if (direct && args[0] === "related")
      console.warn("Some selected sources have no mirrored test; running related tests instead.");
    const child = Bun.spawn(["bunx", "vitest", ...args], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await child.exited;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
