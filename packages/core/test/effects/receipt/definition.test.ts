import { expect, it } from "vitest";
import { createEffect } from "../../../src/document/factories";
import { validateEffectParameter } from "../../../src/effects/parameters";
import {
  RECEIPT_DEFAULT_SETTINGS,
  RECEIPT_DEFINITION,
  RECEIPT_PARAMETERS,
} from "../../../src/effects/receipt/definition";

it("defines thermal dot modes and explicit paper-edge clipping with bounded authored dimensions", () => {
  expect(RECEIPT_DEFINITION).toMatchObject({
    type: "receipt",
    nameKey: "receiptFx:name",
    defaults: { amount: 1, scale: 2, seed: 42 },
  });
  expect(RECEIPT_DEFAULT_SETTINGS).toMatchObject({
    mode: "ordered",
    cutout: false,
    edge: "torn",
    marginX: 0.04,
    marginY: 0.05,
    fit: "contain",
  });
  expect(Object.isFrozen(RECEIPT_DEFAULT_SETTINGS)).toBe(true);
  expect(Object.isFrozen(RECEIPT_DEFINITION)).toBe(true);
  const keys = RECEIPT_PARAMETERS.map((p) => p.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(RECEIPT_PARAMETERS.find((p) => p.key === "edgeJitter")).toMatchObject({
    visibleWhen: { key: "edge", values: ["torn"] },
  });
});
it("validates defaults and numeric extremes and rejects malformed settings", () => {
  for (const p of RECEIPT_PARAMETERS) {
    const value =
      p.scope === "settings"
        ? RECEIPT_DEFAULT_SETTINGS[p.key]
        : RECEIPT_DEFINITION.defaults[p.key as "amount"];
    expect(() => validateEffectParameter(p, value, "INVALID_DOCUMENT")).not.toThrow();
    if (p.kind === "number") {
      for (const bound of [p.min, p.max])
        expect(() => validateEffectParameter(p, bound, "INVALID_DOCUMENT")).not.toThrow();
      for (const invalid of [p.min - p.step, p.max + p.step, NaN])
        expect(() => validateEffectParameter(p, invalid, "INVALID_DOCUMENT")).toThrow();
    } else if (p.kind === "select") {
      for (const option of p.options)
        expect(() => validateEffectParameter(p, option.value, "INVALID_DOCUMENT")).not.toThrow();
      expect(() => validateEffectParameter(p, "foreign-mode", "INVALID_DOCUMENT")).toThrow();
    } else if (p.kind === "color") {
      expect(() => validateEffectParameter(p, "url(image)", "INVALID_DOCUMENT")).toThrow();
    } else expect(() => validateEffectParameter(p, "false", "INVALID_DOCUMENT")).toThrow();
  }
});
it("keeps created settings detached from immutable defaults and other effects", () => {
  const first = createEffect("receipt"),
    second = createEffect("receipt");
  first.settings!.edge = "perforated";
  first.settings!.cutout = true;
  expect(second.settings).toMatchObject({ edge: "torn", cutout: false });
  expect(RECEIPT_DEFAULT_SETTINGS).toMatchObject({ edge: "torn", cutout: false });
});
