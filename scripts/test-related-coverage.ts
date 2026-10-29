import { execFileSync } from "node:child_process";

/** Keep partial reports separate and instrument only the requested executable sources. */
export function relatedCoverageArguments(paths: readonly string[], direct = false): string[] {
  const sources = [...new Set(paths.map((path) => path.replace(/^\.\//, "")))].filter(
    (path) =>
      /^(apps|packages)\/[^/]+\/src\/.+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path) &&
      !/\.d\.(ts|mts|cts)$/.test(path) &&
      !path.split("/").includes(".."),
  );
  if (!sources.length)
    throw new Error("No executable sources selected. Pass source paths or edit a source file.");
  return [
    ...(direct ? ["run"] : ["related", "--run"]),
    "--coverage",
    "--coverage.reportsDirectory=artifacts/coverage-related",
    ...sources.flatMap((source) => ["--coverage.include", source]),
    ...sources.map((source) =>
      direct ? source.replace("/src/", "/test/").replace(/(\.[^.]+)$/, ".test$1") : source,
    ),
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
