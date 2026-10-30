import { expect, test } from "vitest";
import { createEffect, createLayer, validateShapeMorph } from "@musart/core";
import { textMorph } from "../../../src/surface/morph/text";
import { layoutText } from "../../../src/surface/text/layout";
import { outlineFont } from "../../text-fixture";
import { morphFixture } from "../../morph-fixture";
test("regenerates edited text from shaped outlines while retaining matching authored targets", () => {
  const font = outlineFont(),
    layer = createLayer("text", { text: "AV", width: 300, height: 100, fontSize: 48 });
  const authored = { ...morphFixture(), sourceText: "AV" };
  const effect = createEffect("morph", { shapeMorph: authored });
  expect(textMorph(layer, effect, font, layoutText(layer, font))).toBe(authored);
  const changed = { ...layer, text: "B" };
  const generated = textMorph(changed, effect, font, layoutText(changed, font));
  validateShapeMorph(generated);
  expect(generated.shapes).toHaveLength(1);
  expect(generated).not.toBe(authored);
  expect(() => textMorph({ ...layer, text: " " }, effect, font, [])).toThrow(
    "visible text outlines",
  );
});
