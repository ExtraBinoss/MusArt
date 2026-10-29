import { expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createProject, createPage, createLayer } from "../../packages/core/src/index";

it("authors and evaluates Motion through the real Bun CLI without an app/browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "musart-headless-motion-"));
  const input = join(directory, "input.musart"),
    commands = join(directory, "commands.json"),
    authored = join(directory, "authored.musart"),
    output = join(directory, "frame.json");
  try {
    await writeFile(
      input,
      JSON.stringify(
        createProject({
          pages: [
            createPage({ id: "first" }),
            createPage({ id: "second", layers: [createLayer("rectangle", { id: "hero" })] }),
          ],
        }),
      ),
    );
    const target = { kind: "layer", layerId: "hero", property: "x" };
    await writeFile(
      commands,
      JSON.stringify([
        { type: "setCompositionMode", mode: "motion" },
        { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: 0 },
        { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: 100 },
      ]),
    );
    const run = (...args: string[]) =>
      spawnSync("bun", ["scripts/headless.ts", ...args], { encoding: "utf8", timeout: 15000 });
    const apply = run(
      "apply",
      "--input",
      input,
      "--commands",
      commands,
      "--page",
      "second",
      "--output",
      authored,
    );
    expect(apply.stderr).toBe("");
    expect(apply.status).toBe(0);
    const evaluate = run(
      "evaluate",
      "--input",
      authored,
      "--page",
      "second",
      "--time",
      "15/30",
      "--output",
      output,
    );
    expect(evaluate.stderr).toBe("");
    expect(evaluate.status).toBe(0);
    expect(JSON.parse(await readFile(output, "utf8")).composition.layers[0].x).toBe(50);
    await writeFile(output, "preserve output after invalid input");
    const invalid = run("evaluate", "--input", authored, "--time", "1/0", "--output", output);
    expect(invalid.status).not.toBe(0);
    expect(await readFile(output, "utf8")).toBe("preserve output after invalid input");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
