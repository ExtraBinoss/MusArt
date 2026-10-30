import { describe, expect, it } from "vitest";
import { BotEngine } from "../../../../src/ui/brand/engine/engine";
import { decalageDesYeux } from "../../../../src/ui/brand/engine/eyefit";
import { EXPRESSIONS } from "../../../../src/ui/brand/engine/expressions";
import { DEFAULT_SHAPE, SHAPES, SHAPE_BY_ID } from "../../../../src/ui/brand/engine/skins";
import { STATES } from "../../../../src/ui/brand/engine/states";

import { BAND_COUNT, prepareContour, dedans, raycast } from "../support/contour";
const R = 100;
const CORPS_DE_BASE = STATES.filter((s) => s.baseBody).map((s) => s.id);

const SILHOUETTE_MESUREE = STATES.filter((s) => !s.baseBody).map((s) => s.id);
describe("formes du personnalisateur", () => {
  it("le classement par bandes conserve le raycasting complet, y compris aux bords", () => {
    const differences: string[] = [];
    for (const forme of SHAPES) {
      const contour = prepareContour(
        new BotEngine(R, "idle", forme.radii, null).sample(0.7).bodyPath,
      );
      const probes = [...contour.points];
      for (let y = -140; y <= 140; y += 7)
        for (let x = -140; x <= 140; x += 7) probes.push({ x, y });
      for (let band = 0; band <= BAND_COUNT; band++) {
        const y = contour.minY + band / contour.scale;
        for (const offset of [-1e-8, 0, 1e-8])
          for (const x of [-100, -30, 0, 30, 100]) probes.push({ x, y: y + offset });
      }
      for (const { x, y } of probes)
        if (dedans(contour, x, y) !== raycast(contour.segments, x, y))
          differences.push(`${forme.id}/${x}/${y}`);
    }
    expect(differences).toEqual([]);
  });

  it("choisir le cercle rend exactement la meme chose que ne rien choisir", () => {
    expect(DEFAULT_SHAPE).toBe("cercle");
    const cercle = SHAPE_BY_ID.get("cercle")!.radii;
    for (const state of CORPS_DE_BASE) {
      for (const expr of [null, ...EXPRESSIONS]) {
        const avec = new BotEngine(R, state, cercle, expr).sample(1);
        const sans = new BotEngine(R, state, null, expr).sample(1);
        expect(avec.eyes, `${state}/${expr?.id ?? "pose"}`).toEqual(sans.eyes);
      }
      expect(decalageDesYeux(cercle, state, null)).toEqual({ x: 0, y: 0 });
    }
  });

  it("la forme choisie ne touche pas aux etats a silhouette mesuree", () => {
    for (const state of SILHOUETTE_MESUREE) {
      const nu = new BotEngine(R, state, null, null).sample(1);
      for (const forme of SHAPES) {
        const habille = new BotEngine(R, state, forme.radii, null).sample(1);
        expect(habille.eyes, `${state}/${forme.id}`).toEqual(nu.eyes);
        expect(habille.bodyPath).toBe(nu.bodyPath);
      }
    }
  });

  it("la taille des yeux ne depend pas de la forme", () => {
    const tailles = new Set(
      SHAPES.map((f) =>
        new BotEngine(R, "idle", f.radii, null)
          .sample(1)
          .eyes.map((y) => y.d)
          .join("|"),
      ),
    );
    expect(tailles.size).toBe(1);
  });
});
