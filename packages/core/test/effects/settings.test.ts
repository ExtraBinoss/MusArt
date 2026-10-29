import { expect, it } from "vitest";
import { createEffect } from "../../src/document/factories";
import { resolveEffectSettings } from "../../src/effects/settings";

it("resolves only the selected effect's own defaults and preserves explicit zero/false values", () => {
  const ripple = createEffect("ripple", { settings: { amplitude: 0, centerX: 0 } });
  const settings = resolveEffectSettings(ripple);
  expect(settings).toMatchObject({ amplitude: 0, centerX: 0, radius: 480, direction: "outward" });
  expect(settings).not.toHaveProperty("style");
  expect(settings).not.toHaveProperty("preset");
  const shatter = resolveEffectSettings(createEffect("shatter", { settings: { cutout: false } }));
  expect(shatter.cutout).toBe(false);
  expect(shatter.pattern).toBe("impact");
  settings.radius = 1;
  expect(resolveEffectSettings(ripple).radius).toBe(480);
  expect(ripple.settings).toEqual({ amplitude: 0, centerX: 0 });
});

it("retains Gradient's complete preset resolution and supports effects without custom settings", () => {
  const gradient = resolveEffectSettings(
    createEffect("gradient", { settings: { preset: "citrus" } }),
  );
  expect(gradient.style).toBe("radial");
  expect(gradient.preset).toBe("citrus");
  expect(resolveEffectSettings(createEffect("dither"))).toEqual({});
});
