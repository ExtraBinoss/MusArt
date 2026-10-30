import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SfxWaveform } from "../../../../src/components/motion/audio/SfxWaveform";
import type { BankCanvasPainter } from "../../../../src/components/motion/audio/bank/canvas";
it("registers a16px canvas with its real row before paint and releases its drawing lease", () => {
  const unregister = vi.fn(),
    register = vi.fn(() => unregister),
    painter = { register } as unknown as BankCanvasPainter;
  const view = render(
      <div data-row>
        <SfxWaveform id="soft-plop" painter={painter} />
      </div>,
    ),
    canvas = view.container.querySelector("canvas")!;
  expect(canvas.style.height).toBe("16px");
  expect(view.container.querySelector("svg")).toBeNull();
  expect(register).toHaveBeenCalledWith("soft-plop", canvas, canvas.parentElement);
  view.unmount();
  expect(unregister).toHaveBeenCalledOnce();
});
