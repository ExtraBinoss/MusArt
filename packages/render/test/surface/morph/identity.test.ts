import { expect, test } from "vitest";
import { morphIdentity } from "../../../src/surface/morph/identity";
import { morphFixture } from "../../morph-fixture";
test("identifies immutable geometry without writing session IDs into portable data", () => {
  const shape = morphFixture(),
    before = JSON.stringify(shape);
  expect(morphIdentity(shape)).toBe(morphIdentity(shape));
  expect(morphIdentity(structuredClone(shape))).not.toBe(morphIdentity(shape));
  expect(JSON.stringify(shape)).toBe(before);
});
