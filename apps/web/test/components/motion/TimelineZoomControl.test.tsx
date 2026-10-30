import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { TimelineZoomControl } from "../../../src/components/motion/TimelineZoomControl";
import { setup } from "../../support/ui";

test("uses the persisted zoom range and separates preview from the final value callback", () => {
  const d = setup(),
    change = vi.fn(),
    commit = vi.fn();
  const view = d.mount(
    <TimelineZoomControl zoom={120} disabled={false} onChange={change} onCommit={commit} />,
  );
  const slider = screen.getByRole("slider", { name: "Zoom de la timeline" });
  expect(slider).toHaveAttribute("aria-valuemin", "20");
  expect(slider).toHaveAttribute("aria-valuemax", "640");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(change).toHaveBeenLastCalledWith(130);
  expect(commit).toHaveBeenLastCalledWith(130);
  view.rerender(<TimelineZoomControl zoom={240} disabled onChange={change} onCommit={commit} />);
  expect(slider).toHaveAttribute("aria-valuenow", "240");
  expect(slider).toHaveAttribute("data-disabled");
});
