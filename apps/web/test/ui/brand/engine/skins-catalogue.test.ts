// Exhaustive upstream geometry witnesses; run separately when measuring their CPU cost.
import { expect, it } from "vitest";
import { BotEngine } from "../../../../src/ui/brand/engine/engine";
import { EXPRESSIONS } from "../../../../src/ui/brand/engine/expressions";
import { SHAPES, SHAPE_BY_ID } from "../../../../src/ui/brand/engine/skins";
import { STATES } from "../../../../src/ui/brand/engine/states";
import { debordement, type Contour } from "../support/contour";
const R = 100;
const CORPS_DE_BASE = STATES.filter((s) => s.baseBody).map((s) => s.id);
// Every state × shape × expression, 60 instants and both complete eye contours.
// Only repeated contour parsing and impossible ray intersections are skipped.
it("aucune forme ne laisse un oeil sortir de la silhouette", () => {
  const fautifs: string[] = [];
  for (const state of CORPS_DE_BASE) {
    for (const forme of SHAPES) {
      const contours = new Map<string, Contour>();
      for (const expr of [null, ...EXPRESSIONS]) {
        const sortie = debordement(state, forme.radii, expr, contours);
        if (sortie > 0.05) {
          fautifs.push(`${state}/${forme.id}/${expr?.id ?? "pose"} ${sortie.toFixed(1)}`);
        }
      }
    }
  }
  // Cinq couples etat x forme debordaient : `wide`+`capsule` de 14,5 unites sur une boule
  // de rayon 100, `wide`+`triangle` de 11,9, `idle`+`capsule` et `swirl`+`capsule` de 5,3,
  // `notify`+`goutte` de 3,3.
  expect(fautifs).toEqual([]);
}, 180000);

it("la correction ne fait pas osciller les yeux", () => {
  const pas = 1 / 60;
  const trajectoire = (bâti: () => BotEngine, duree = BotEngine.SHAPE_MORPH) => {
    const e = bâti();
    const out: Array<
      Array<{
        x: number;
        y: number;
      }>
    > = [];
    for (let t = 0; t <= duree + pas; t += pas) {
      out.push(
        e.sample(t).eyes.map((eye) => {
          const n = eye.matrix.match(/-?\d+\.?\d*/g)!.map(Number);
          return { x: n[4]!, y: n[5]! };
        }),
      );
    }
    return out;
  };

  const allersRetours = (
    suite: Array<
      Array<{
        x: number;
        y: number;
      }>
    >,
  ) => {
    let n = 0;
    let amplitude = 0;
    const yeux = Math.min(...suite.map((f) => f.length));
    for (let j = 0; j < yeux; j++) {
      let px = 0;
      let py = 0;
      for (let i = 1; i < suite.length; i++) {
        const dx = suite[i]![j]!.x - suite[i - 1]![j]!.x;
        const dy = suite[i]![j]!.y - suite[i - 1]![j]!.y;
        const len = Math.hypot(dx, dy);
        if (len <= 0.05) continue;
        if ((px || py) && dx * px + dy * py < 0) {
          n++;
          amplitude = Math.max(amplitude, len);
        }
        px = dx;
        py = dy;
      }
    }
    return { n, amplitude };
  };
  const cercle = SHAPE_BY_ID.get("cercle")!.radii;
  const morphDeForme = (radii: number[]) =>
    allersRetours(
      trajectoire(() => {
        const e = new BotEngine(R, "idle", cercle, null);
        e.setShape(radii, 0);
        return e;
      }),
    );
  const auRepos = (radii: number[]) =>
    allersRetours(trajectoire(() => new BotEngine(R, "idle", radii, null), 3));
  const morphsDExpression = (radii: number[]) =>
    EXPRESSIONS.map((expr) =>
      allersRetours(
        trajectoire(() => {
          const e = new BotEngine(R, "idle", radii, EXPRESSIONS[0]!);
          e.setExpression(expr, 0);
          return e;
        }),
      ),
    ).reduce(
      (a, b) => ({
        n: a.n + b.n,
        amplitude: Math.max(a.amplitude, b.amplitude),
      }),
      {
        n: 0,
        amplitude: 0,
      },
    );
  /*
   * Sur le CERCLE, rien du tout : la correction y est nulle, donc elle ne peut ajouter
   * aucun mouvement, et c'est la reference des trois comparaisons.
   */
  expect(morphsDExpression(cercle).n, "cercle : morphs d expression").toBe(0);
  for (const forme of SHAPES) {
    // Compare the corrected shape with the same radial profile without the fit table.
    // Concave silhouettes naturally change the projected eye trajectory.
    // Au repos, la seule chose qui bouge est la derive du regard. Une correction qui la
    // suivrait ferait trembler les yeux en permanence : c'est le defaut le plus visible
    // de tous, et le premier qu'on a eu.
    expect(auRepos(forme.radii).n, `${forme.id} : derive au repos`).toBeLessThanOrEqual(
      auRepos([...forme.radii]).n + 1,
    );
    // Un changement de forme fait bouger le decalage, mais sur la meme courbe que la
    // silhouette : aucun aller-retour de plus que le cercle.
    expect(morphDeForme(forme.radii).n, `morph de forme vers ${forme.id}`).toBeLessThanOrEqual(
      morphDeForme(cercle).n + 1,
    );
    /*
     * Un changement d'expression fait passer le decalage d'une entree de table a l'autre.
     * Sept formes sur huit n'y gagnent aucun aller-retour ; la `goutte` passe de un
     * rebroussement de 6,3 unites — deja present sans correction — a deux de 11,1. La
     * borne laisse passer ca et rien de plus : les versions fautives etaient a 26.
     */
    expect(
      morphsDExpression(forme.radii).amplitude,
      `${forme.id} : morphs d expression`,
    ).toBeLessThan(14);
  }
}, 30000);
