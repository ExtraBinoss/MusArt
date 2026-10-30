import { afterEach, expect, test, vi } from "vitest";
import {
  createLayerDragDiagnostics,
  layerDragDiagnostics,
} from "../../../../src/components/layers/drag/diagnostics";
import { setup } from "../../../support/ui";

afterEach(() => vi.restoreAllMocks());

test("reports concrete rejection evidence once per target/stage and resets for the next gesture", () => {
  const warn = vi.spyOn(console, "error").mockImplementation(() => {});
  const diagnostics = createLayerDragDiagnostics();
  diagnostics.begin({ input: "native", mode: "motion", sourceId: "source" });
  const event = {
    defaultPrevented: false,
    dataTransfer: {
      types: ["application/x-musart-layer"],
      effectAllowed: "move" as const,
      dropEffect: "none" as const,
    },
  };
  for (let i = 0; i < 100; i++) diagnostics.refuse("nativeDragover", "locked", "target", event);
  expect(warn).toHaveBeenCalledExactlyOnceWith("[MusArt DnD]", {
    stage: "nativeDragover",
    reason: "locked",
    mode: "motion",
    input: "native",
    sourceIds: ["source"],
    targetId: "target",
    types: ["application/x-musart-layer"],
    defaultPrevented: false,
    effectAllowed: "move",
    dropEffect: "none",
  });
  diagnostics.refuse("nativeDragover", "locked", "other", event);
  expect(warn).toHaveBeenCalledTimes(2);
  diagnostics.begin({ input: "pointer", mode: "static", sourceId: "replacement" });
  diagnostics.refuse("pointerDown", "staleTrack", undefined, { defaultPrevented: false });
  expect(warn).toHaveBeenLastCalledWith(
    "[MusArt DnD]",
    expect.objectContaining({
      input: "pointer",
      sourceIds: ["replacement"],
      targetId: null,
      types: [],
    }),
  );
  warn.mockClear();
  for (let i = 0; i < 50; i++)
    diagnostics.refuse("nativeDragover", "inactiveDrag", String(i), event);
  expect(warn).toHaveBeenCalledOnce();
});

test("bounds diagnostic memory and shares evidence only within the same engine", () => {
  const warn = vi.spyOn(console, "error").mockImplementation(() => {}),
    d = setup(),
    other = setup();
  const diagnostics = layerDragDiagnostics(d.engine);
  expect(layerDragDiagnostics(d.engine)).toBe(diagnostics);
  expect(layerDragDiagnostics(other.engine)).not.toBe(diagnostics);
  for (let i = 0; i < 100; i++) diagnostics.refuse("preview", "property", String(i));
  expect(warn).toHaveBeenCalledTimes(32);
  expect(warn).toHaveBeenCalledWith(
    "[MusArt DnD]",
    expect.objectContaining({ mode: "unknown", sourceIds: [] }),
  );
});
