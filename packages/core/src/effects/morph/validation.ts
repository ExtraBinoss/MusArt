import { assertList, assertNumber, assertRecord, assertText } from "../../document/guards";
import { ensure } from "../../errors";
import type { ShapeMorph } from "./model";
export function validateShapeMorph(value: unknown): asserts value is ShapeMorph {
  assertRecord(value);
  ensure(value.version === 1, "INVALID_DOCUMENT", "Unknown shape morph version");
  if (value.sourceText !== undefined) assertText(value.sourceText, 10000);
  if (value.sourceFont !== undefined) {
    assertRecord(value.sourceFont);
    assertText(value.sourceFont.family, 256);
    assertNumber(value.sourceFont.size, 1, 4096);
    assertNumber(value.sourceFont.weight, 100, 1000);
  }
  assertList(value.shapes, 256);
  ensure(value.shapes.length > 0, "INVALID_DOCUMENT", "Morph shapes are missing");
  let points = 0;
  for (const shape of value.shapes) {
    assertRecord(shape);
    assertList(shape.frames, 120);
    ensure(shape.frames.length >= 2, "INVALID_DOCUMENT", "Morph needs two states");
    let previous = -1;
    for (const frame of shape.frames) {
      assertRecord(frame);
      assertNumber(frame.at, 0, 1);
      ensure(frame.at > previous, "INVALID_DOCUMENT", "Morph states must be ordered");
      previous = frame.at;
      assertList(frame.box, 4);
      ensure(frame.box.length === 4, "INVALID_DOCUMENT", "Invalid morph placement");
      frame.box.forEach((number, index) => assertNumber(number, index > 1 ? 0.000001 : -100, 100));
      assertList(frame.contours, 32);
      ensure(frame.contours.length > 0, "INVALID_DOCUMENT", "Morph contours are missing");
      ensure(
        frame.contours.some(
          (contour) =>
            typeof contour === "object" &&
            contour !== null &&
            "hole" in contour &&
            contour.hole === false,
        ),
        "INVALID_DOCUMENT",
        "Morph needs an outer contour",
      );
      for (const contour of frame.contours) {
        assertRecord(contour);
        ensure(
          typeof contour.hole === "boolean",
          "INVALID_DOCUMENT",
          "Invalid morph contour winding",
        );
        assertList(contour.points, 2048);
        ensure(contour.points.length >= 3, "INVALID_DOCUMENT", "Morph contour needs three points");
        for (const point of contour.points) {
          assertList(point, 2);
          ensure(point.length === 2, "INVALID_DOCUMENT", "Invalid morph point");
          point.forEach((number) => assertNumber(number, 0, 1));
        }
        points += contour.points.length;
      }
      ensure(
        frame.easing === undefined ||
          (typeof frame.easing === "string" &&
            ["linear", "easeOut", "easeInOut"].includes(frame.easing)),
        "INVALID_DOCUMENT",
        "Invalid morph easing",
      );
    }
    ensure(
      (shape.frames[0] as { at: number }).at === 0 &&
        (shape.frames.at(-1) as { at: number }).at === 1,
      "INVALID_DOCUMENT",
      "Morph states must span the animation",
    );
  }
  ensure(points <= 262144, "INVALID_DOCUMENT", "Morph geometry exceeds the point budget");
}
