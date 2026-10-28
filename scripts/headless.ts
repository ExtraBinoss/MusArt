import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  type Command,
} from "@musart/core";
const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    input: { type: "string" },
    output: { type: "string" },
    commands: { type: "string" },
    url: { type: "string", default: "http://127.0.0.1:6100" },
    scale: { type: "string", default: "1" },
    format: { type: "string", default: "png" },
    page: { type: "string" },
    webgl: { type: "boolean", default: false },
  },
});
const operation = positionals[0];
if (!operation || !["create", "apply", "render", "screenshot"].includes(operation)) {
  console.log(
    "MusArt headless\n  create --output project.musart\n  apply --input project.musart --commands commands.json --output result.musart\n  render --input project.musart --output image.png [--scale 2] [--format png|webp|jpeg] [--page id] [--webgl]\n  screenshot --input project.musart --output editor.png\nRender/screenshot require the local app running (bun dev or bun preview); --url changes its address.",
  );
  process.exit(operation ? 1 : 0);
}
if (!values.output) throw new Error("--output is required.");
if (!["png", "webp", "jpeg"].includes(values.format))
  throw new Error("--format must be png, webp, or jpeg.");
const format = values.format as "png" | "webp" | "jpeg";
await mkdir(dirname(resolve(values.output)), { recursive: true });
const initial = values.input
  ? parseProject(await readFile(values.input, "utf8"))
  : createProject({
      name: "Untitled",
      pages: [
        createPage({
          width: 1080,
          height: 1080,
          layers: [
            createLayer("text", {
              text: "MusArt",
              width: 600,
              height: 200,
              x: 120,
              y: 400,
              fontSize: 120,
              fill: "#2563eb",
            }),
          ],
        }),
      ],
    });
if (operation === "create") {
  await writeFile(values.output, serializeProject(initial));
} else if (operation === "apply") {
  if (!values.commands) throw new Error("--commands is required.");
  const commands: unknown = JSON.parse(await readFile(values.commands, "utf8"));
  if (!Array.isArray(commands)) throw new Error("The commands file must contain an array.");
  const engine = new EditorEngine(initial);
  engine.transaction(commands as Command[]);
  await writeFile(values.output, serializeProject(engine.getSnapshot().project));
} else {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--enable-unsafe-swiftshader",
      "--use-angle=vulkan",
      "--enable-features=Vulkan",
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(`${values.url}/?automation=1`);
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate((project) => window.musart!.load(project), initial);
    if (values.page) await page.evaluate((id) => window.musart!.page(id), values.page);
    if (operation === "screenshot") {
      await page.waitForFunction((pageId) => {
        const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
        return (
          data?.pageId === pageId &&
          data.rendererReady === "true" &&
          data.renderedRevision === data.sceneRevision
        );
      }, values.page ?? initial.pages[0]!.id);
      await page.screenshot({ path: values.output, fullPage: true, animations: "disabled" });
    } else {
      const scale = Number(values.scale);
      if (!Number.isFinite(scale) || scale <= 0) throw new Error("--scale must be positive.");
      const dataUrl = await page.evaluate(async (options) => window.musart!.render(options), {
        scale,
        format,
        forceWebGL: values.webgl,
      });
      await writeFile(values.output, Buffer.from(dataUrl.split(",")[1]!, "base64"));
    }
  } finally {
    await browser.close();
  }
}
console.log(values.output);
