import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useRenderMetrics } from "../../../src/state/session/render-metrics";
function Probe({ text = "First" }: { text?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useRenderMetrics(ref);
  return <div ref={ref}>{text}</div>;
}
afterEach(() => history.replaceState({}, "", "/"));
test("counts committed React reconciliations only when automation is enabled", () => {
  history.replaceState({}, "", "/?automation=1");
  const view = render(<Probe />);
  expect(screen.getByText("First")).toHaveAttribute("data-react-renders", "1");
  view.rerender(<Probe text="Second" />);
  expect(screen.getByText("Second")).toHaveAttribute("data-react-renders", "2");
});
test("leaves ordinary application DOM untouched", () => {
  history.replaceState({}, "", "/");
  render(<Probe />);
  expect(screen.getByText("First")).not.toHaveAttribute("data-react-renders");
});
test("tolerates an unattached ref", () => {
  history.replaceState({}, "", "/?automation=1");
  function Empty() {
    const ref = useRef<HTMLElement>(null);
    useRenderMetrics(ref);
    return null;
  }
  render(<Empty />);
});
