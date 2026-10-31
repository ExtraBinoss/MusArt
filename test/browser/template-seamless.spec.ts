import { expect, test } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { installReadbackProbe } from "./support/readback-probe";
for (const webgl of [false, true])
  test(`native template loop pixels and clean mascot corners (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const folder = `artifacts/template-seams/${webgl ? "webgl" : "webgpu"}`;
    await mkdir(folder, { recursive: true });
    await installReadbackProbe(page);
    const entry = new URL("/__seamless-check", test.info().project.use.baseURL).href;
    await page.route(entry, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto(entry);
    for (const id of ["share-your-work", "morphing-type"]) {
      const manifest = JSON.parse(
        await readFile(`apps/web/public/templates/motion/${id}.json`, "utf8"),
      );
      const images = await page.evaluate(
        async (input) => {
          const core = (await import(
            input.coreUrl
          )) as typeof import("../../packages/core/src/index");
          const render = (await import(
            input.renderUrl
          )) as typeof import("../../packages/render/src/index");
          const project = input.project,
            original = project.pages[0]!;
          const program = core.compileMotion(project, { compositionId: original.id });
          const session = render.createRenderSession({
            forceWebGL: input.webgl,
            maxBytes: 128 * 1024 * 1024,
          });
          const times =
            input.id === "share-your-work"
              ? [0, 1 / 30, 35 / 30, 1.2, 0.6]
              : [0, 0.6, 1.2, 1.8, 2.4];
          const frames: string[] = [];
          try {
            for (const seconds of times) {
              const plan = core.evaluateMotion(
                program,
                { value: Math.round(seconds * 3000), rate: 3000 },
                { terminalPreview: seconds === times[3] || seconds === times[4] },
              );
              const image = await session.withCanvasFrame(
                core.applyMotionFrame(program, plan),
                project.assets,
                (canvas) => canvas.toDataURL("image/png"),
                { scale: 480 / Math.max(original.width, original.height), motionFrame: plan },
              );
              frames.push(image);
            }
            return { frames, stats: session.stats(), reads: window.__musartVideoReadbacks };
          } finally {
            await session.dispose();
          }
        },
        {
          id,
          project: manifest.project,
          webgl,
          coreUrl: `/@fs${resolve("packages/core/src/index.ts")}`,
          renderUrl: `/@fs${resolve("packages/render/src/index.ts")}`,
        },
      );
      expect(images.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
      expect(images.stats.cacheBytes).toBeLessThanOrEqual(images.stats.maxBytes);
      for (const [i, frame] of images.frames.entries())
        await writeFile(`${folder}/${id}-${i}.png`, Buffer.from(frame.split(",")[1]!, "base64"));
      const witness = JSON.parse(
        execFileSync(
          "python3",
          [
            "-c",
            [
              "from PIL import Image,ImageChops,ImageStat",
              "import json,sys",
              "p=sys.argv[1]; name=sys.argv[2]",
              "im=[Image.open(f'{p}/{name}-{i}.png').convert('RGB') for i in range(5)]",
              "d=lambda a,b:sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3",
              "end=3 if name=='share-your-work' else 4",
              "print(json.dumps({'boundary':d(im[0],im[end]),'motion':max(d(im[0],v) for v in im[1:]),'corner':max(max(ImageStat.Stat(v.crop((450,240,480,270))).extrema[c][0:2]) for v in im for c in range(3)) if name=='morphing-type' else 0,'cornersWhite':all(all(lo==hi==255 for lo,hi in ImageStat.Stat(v.crop((450,240,480,270))).extrema) for v in im) if name=='morphing-type' else True}))",
            ].join("\n"),
            folder,
            id,
          ],
          { encoding: "utf8" },
        ),
      );
      expect(witness.boundary).toBeLessThan(0.15);
      expect(witness.motion).toBeGreaterThan(0.1);
      expect(witness.cornersWhite).toBe(true);
      await writeFile(
        `${folder}/${id}.json`,
        JSON.stringify({ witness, stats: images.stats, reads: images.reads }, null, 2),
      );
    }
  });
