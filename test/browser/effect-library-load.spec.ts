import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { densityEnvironment } from "./support/effect-density";
import { contactSheetRegions, inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";
import { LIBRARY_TYPES, libraryScene, libraryStressProject } from "./support/library-stress";
import {
  compareLibraryRegions,
  installLibraryContextProbe,
  libraryAlpha,
  libraryCanvas,
  libraryCommits,
  libraryDensityCycle,
  libraryFrame,
  libraryPng,
  libraryThumbnail,
} from "./support/library-observer";

// Functional resource/correctness witness. Timings use separate, fresh-process cohorts.
test("50 real image layers retain all eleven effects through preview, canonical encoding and recovery", async ({
  page,
}) => {
  test.setTimeout(300000);
  const fixture = await libraryStressProject();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("artifacts/effect-library-50", { recursive: true });
  const save = (name: string, source: string) =>
    writeFile(
      `artifacts/effect-library-50/${name}.png`,
      Buffer.from(source.split(",")[1]!, "base64"),
    );
  await installReadbackProbe(page);
  await installLibraryContextProbe(page);
  const inspector = await page.context().newPage();
  await page.bringToFront();
  const inspect = (source: string, regions = contactSheetRegions) =>
    inspectImage(page, source, regions, inspector);
  const state = () =>
    page.evaluate(() => {
      const snapshot = window.musart!.snapshot();
      return {
        revision: snapshot.revision,
        effect: snapshot.project.pages[0]!.layers.find((layer) => layer.id === "stress-image-0")!
          .effects[0]!,
      };
    });
  try {
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate((project) => window.musart!.load(project), fixture.project);
    const initialRaw = await libraryFrame(page, fixture.project.id);
    const initialDensity = await libraryDensityCycle(page, fixture.project.id);
    const initial = initialDensity.fit;
    const scene = libraryScene(fixture.project);
    expect(scene).toMatchObject({ images: 50, effects: 100, groups: 5, masks: 10, assets: 51 });
    expect(Object.keys(scene.types)).toEqual([...LIBRARY_TYPES]);
    expect(Object.values(scene.types).every((count) => count >= 4)).toBe(true);
    expect(fixture.files).toBe(50);
    // The fixed corpus has ten source photographs, fifty files, and 43 distinct JPEGs.
    expect(fixture.distinctOriginals).toBe(43);
    for (const key of [
      "uploads",
      "targets",
      "cacheBytes",
      "maxBytes",
      "frames",
      "passes",
      "displayFrames",
    ])
      expect(Number.isFinite(initial[key]), `missing actual GPU metric ${key}`).toBe(true);
    await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
      "data-backend",
      "webgpu",
    );
    expect(initial.cacheBytes).toBeLessThanOrEqual(initial.maxBytes);
    const active = await libraryPng(page);
    await save("active-1x", active);
    const activeWitness = await inspect(active);
    expect(activeWitness).toMatchObject({ width: 2400, height: 1500 });
    for (const region of activeWitness.regions) {
      expect(region.opaque).toBeGreaterThan(0.98);
      expect(region.backgroundDistance).toBeGreaterThan(20);
    }
    const beforeNeutral = await state();
    await page.evaluate((commands) => window.musart!.transaction(commands), fixture.neutral);
    const neutralStats = await libraryFrame(page, fixture.project.id, initial.renders);
    expect(neutralStats.cacheBytes).toBeLessThanOrEqual(neutralStats.maxBytes);
    const neutral = await libraryPng(page);
    await save("neutral-1x", neutral);
    const neutralWitness = await inspect(neutral);
    expect((await state()).revision).toBe(beforeNeutral.revision + 1);
    for (let index = 0; index < 50; index++)
      expect(
        activeWitness.regions[index]!.hash,
        `${LIBRARY_TYPES[index % 11]} region ${index} must change real photo pixels`,
      ).not.toBe(neutralWitness.regions[index]!.hash);
    await page.evaluate(() => window.musart!.undo());
    let stats = await libraryFrame(page, fixture.project.id, neutralStats.renders);
    expect((await state()).effect).toEqual(beforeNeutral.effect);
    expect(stats.uploads).toBe(initial.uploads);
    expect((await inspect(await libraryPng(page))).regions).toEqual(activeWitness.regions);

    // One actual held-pointer preview under the full photographic load, with no
    // document cloning or snapshots inside a frame/latency sampling loop.
    await page.evaluate(() => window.musart!.select(["stress-image-0"]));
    await page
      .locator(
        '.layer-row[data-layer-id="stress-image-0"] [data-attachment-effect-id="library-fx-0"]',
      )
      .click();
    await expect(page.locator(".layer-attachment-popover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
    const center = page.getByRole("button", { name: /^(Centre de l’effet|Effect center)$/ });
    const box = (await center.boundingBox())!;
    const centerPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hitHandle = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-handle"),
      centerPoint,
    );
    expect(hitHandle, "small inner-radius hit disks must not steal the center handle").toBe(
      "center",
    );
    const beforePreview = await state();
    const beforePixels = await libraryCanvas(page);
    const beforePreviewWitness = await inspect(beforePixels, [contactSheetRegions[0]!]);
    stats = await libraryFrame(page, fixture.project.id);
    await page.mouse.move(centerPoint.x, centerPoint.y);
    await page.mouse.down();
    const commits = await libraryCommits(page);
    expect(commits.every((count) => count > 0)).toBe(true);
    await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2 + 8, { steps: 6 });
    const previewStats = await libraryFrame(page, fixture.project.id, stats.renders);
    expect(previewStats.cacheBytes).toBeLessThanOrEqual(previewStats.maxBytes);
    const previewPixels = await libraryCanvas(page);
    await save("held-preview", previewPixels);
    const previewWitness = await inspect(previewPixels, [contactSheetRegions[0]!]);
    expect(previewWitness.regions[0]!.hash).not.toBe(beforePreviewWitness.regions[0]!.hash);
    expect(await state()).toEqual(beforePreview);
    expect(await libraryCommits(page)).toEqual(commits);
    expect(previewStats.uploads).toBe(initial.uploads);
    await page.mouse.up();
    const committed = await state();
    await writeFile(
      "artifacts/effect-library-50/gesture.json",
      JSON.stringify(
        {
          zoom: await page.getByTestId("artboard").getAttribute("data-zoom"),
          centerPoint,
          hitHandle,
          beforePreview,
          committed,
          commits,
          previewStats,
        },
        null,
        2,
      ),
    );
    expect(committed.revision).toBe(beforePreview.revision + 1);
    expect(committed.effect.settings!.centerX).not.toBe(beforePreview.effect.settings!.centerX);
    await page.evaluate(() => window.musart!.undo());
    stats = await libraryFrame(page, fixture.project.id, previewStats.renders);
    expect((await state()).effect).toEqual(beforePreview.effect);
    expect((await inspect(await libraryCanvas(page), [contactSheetRegions[0]!])).regions).toEqual(
      beforePreviewWitness.regions,
    );
    await page.evaluate(() => window.musart!.redo());
    stats = await libraryFrame(page, fixture.project.id, stats.renders);
    expect((await state()).effect).toEqual(committed.effect);
    await page.evaluate(() => window.musart!.undo());
    stats = await libraryFrame(page, fixture.project.id, stats.renders);

    await page.evaluate(() =>
      window.musart!.execute({ type: "updatePage", patch: { background: "transparent" } }),
    );
    const alphaStats = await libraryFrame(page, fixture.project.id, stats.renders);
    const transparent = await libraryPng(page);
    await save("transparent-1x", transparent);
    const alpha = await libraryAlpha(inspector, transparent);
    expect(alpha).toMatchObject({ width: 2400, height: 1500, corner: 0, opaquePhoto: 255 });
    expect(alpha.translucentPhoto).toBeGreaterThanOrEqual(216);
    expect(alpha.translucentPhoto).toBeLessThanOrEqual(218);
    expect(alpha.levels).toBeGreaterThan(20);
    await page.evaluate(() => window.musart!.undo());
    stats = await libraryFrame(page, fixture.project.id, alphaStats.renders);
    await page.evaluate(() => window.musart!.save());
    const thumbnail = await libraryThumbnail(page);
    expect(thumbnail).toMatchObject({ width: 768, height: 480, type: "image/webp" });
    expect(thumbnail.bytes).toBeLessThanOrEqual(1024 * 1024);
    const thumbnailWitness = await inspect(thumbnail.encoded);
    for (const region of thumbnailWitness.regions) {
      expect(region.opaque).toBeGreaterThan(0.98);
      expect(region.backgroundDistance).toBeGreaterThan(20);
    }
    const matchingPng = await libraryPng(page, 768 / 2400);
    await save("canonical-footprint-reference", matchingPng);
    await writeFile(
      "artifacts/effect-library-50/canonical.webp",
      Buffer.from(thumbnail.encoded.split(",")[1]!, "base64"),
    );
    const canonicalError = await compareLibraryRegions(
      inspector,
      matchingPng,
      thumbnail.encoded,
      contactSheetRegions,
    );
    for (const error of canonicalError) {
      expect(error.pixels).toBeGreaterThan(0);
      expect(error.rgbMean).toBeLessThan(10);
      expect(error.alphaMax).toBe(0);
    }
    const settled = await libraryFrame(page, fixture.project.id);
    await page.waitForTimeout(1000);
    const idle = await libraryFrame(page, fixture.project.id);
    expect(idle.renders).toBe(settled.renders);
    expect(idle.displayFrames).toBe(settled.displayFrames);
    expect(idle.uploads).toBe(initial.uploads);
    expect(idle.targets).toBeLessThanOrEqual(initial.targets + 2);
    expect(idle.cacheBytes).toBeLessThanOrEqual(idle.maxBytes);
    const contexts = await page.evaluate(() => window.__libraryGPUContexts!);
    expect(contexts).toBeGreaterThan(0);
    expect(contexts).toBeLessThanOrEqual(3); // editor, shared thumbnail renderer, pooled PNG exporter
    const environment = await densityEnvironment(page);
    expect(environment.reads).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      gpuHook: true,
      webglHook: true,
      canvasHook: true,
    });

    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const recoveryRaw = await libraryFrame(page, fixture.project.id);
    const recoveryBootstrapFrames = await page.evaluate(() => window.__libraryFrameAcks!);
    await writeFile(
      "artifacts/effect-library-50/recovery-bootstrap.json",
      JSON.stringify({ initialRaw, recoveryRaw, frames: recoveryBootstrapFrames }, null, 2),
    );
    if (recoveryRaw.targets > initialRaw.targets + 2) {
      const nativeIndex = recoveryBootstrapFrames.findIndex(
        (frame) => frame.renderWidth === 2400 && frame.renderHeight === 1500,
      );
      const fitIndex = recoveryBootstrapFrames.findIndex(
        (frame) =>
          frame.renderWidth === initialRaw.renderWidth &&
          frame.renderHeight === initialRaw.renderHeight,
      );
      expect(
        nativeIndex,
        "prove the extra native-density cache family before normalizing history",
      ).toBeGreaterThanOrEqual(0);
      expect(fitIndex).toBeGreaterThan(nativeIndex);
    }
    const recoveredDensity = await libraryDensityCycle(page, fixture.project.id);
    const recovered = recoveredDensity.fit;
    await writeFile(
      "artifacts/effect-library-50/recovery-resources.json",
      JSON.stringify(
        { initialRaw, initialDensity, initial, idle, recoveryRaw, recoveredDensity, recovered },
        null,
        2,
      ),
    );
    const restored = await page.evaluate(async () => {
      const { project } = window.musart!.snapshot();
      const page = project.pages[0]!;
      const originals = await Promise.all(
        Object.values(project.assets)
          .filter((asset) => asset.kind !== "video")
          .filter((asset) => asset.mime === "image/jpeg")
          .map(async (asset) => {
            const data = await (await fetch(asset.dataUrl)).arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", data);
            return {
              file: asset.name,
              sha256: [...new Uint8Array(digest)]
                .map((value) => value.toString(16).padStart(2, "0"))
                .join(""),
            };
          }),
      );
      return {
        id: project.id,
        images: page.layers.filter((layer) => layer.kind === "image").length,
        effects: page.layers.flatMap((layer) => layer.effects).length,
        effectStacks: page.layers
          .filter((layer) => layer.kind === "image")
          .map((layer) => ({ id: layer.id, effects: layer.effects })),
        assets: Object.keys(project.assets).length,
        originals: originals.sort((a, b) => a.file.localeCompare(b.file)),
      };
    });
    expect(restored).toMatchObject({
      id: fixture.project.id,
      images: 50,
      effects: 100,
      assets: 51,
    });
    expect(restored.originals).toEqual(
      fixture.originals.map(({ file, sha256 }) => ({ file, sha256 })),
    );
    expect(restored.effectStacks).toEqual(
      fixture.project.pages[0]!.layers.filter((layer) => layer.kind === "image").map((layer) => ({
        id: layer.id,
        effects: layer.effects,
      })),
    );
    expect((await state()).effect).toEqual(beforePreview.effect);
    // The first navigation may also have prepared the normal starter document.
    // Recovery must not upload more sources; SHA checks below prove all originals.
    expect(recovered.uploads).toBeGreaterThan(0);
    expect(recovered.uploads).toBeLessThanOrEqual(initial.uploads);
    expect(recovered.targets).toBeLessThanOrEqual(initial.targets + 2);
    expect(recovered.cacheBytes).toBeLessThanOrEqual(recovered.maxBytes);
    const recoveredWitness = await inspect(await libraryPng(page));
    expect(recoveredWitness.regions).toEqual(activeWitness.regions);
    const recoveredEnvironment = await densityEnvironment(page);
    expect(recoveredEnvironment.reads).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      gpuHook: true,
      webglHook: true,
      canvasHook: true,
    });
    expect(errors).toEqual([]);
    await page.screenshot({ path: "artifacts/effect-library-50/recovered-editor.png" });
    await writeFile(
      "artifacts/effect-library-50.json",
      JSON.stringify(
        {
          boundary:
            "Functional fifty-file load; separate processes measure latency. PNG decoding/readback occurs only in an uninstrumented inspection page.",
          corpus: {
            files: fixture.files,
            distinctOriginals: fixture.distinctOriginals,
            totalEncodedBytes: fixture.totalEncodedBytes,
            declaredDecodedBytes: fixture.declaredDecodedBytes,
            originals: fixture.originals,
          },
          scene,
          initial,
          initialRaw,
          initialDensity,
          neutralStats,
          previewStats,
          idle,
          recovered,
          recoveryRaw,
          recoveryBootstrapFrames,
          recoveredDensity,
          contexts,
          environment,
          recoveredEnvironment,
          activeWitness,
          neutralWitness,
          commits,
          previewWitness,
          centerPoint,
          hitHandle,
          beforePreview,
          committed,
          alpha,
          thumbnail: {
            ...thumbnail,
            encoded: undefined,
            witness: thumbnailWitness,
            canonicalError,
          },
          restored,
          recoveredWitness,
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await inspector.close();
  }
});
