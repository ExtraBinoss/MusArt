import { createElement } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { setup } from "../../../support/ui";
import { useLayerHover } from "../../../../src/components/layers/rows/use-layer-hover";
import { createTimelineHoverSource } from "../../../../src/state/motion/hover";
test("Layers borrows the same hover lease without selection, React parent renders or stale cleanup", () => {
  const d = setup(),
    hover = createTimelineHoverSource(d.engine);
  let renders = 0;
  function Host({ id = d.rectangle.id }) {
    renders++;
    const events = useLayerHover(d.engine, d.page.id, id);
    return createElement(
      "div",
      {
        "data-testid": "row",
        tabIndex: 0,
        onPointerEnter: events.onPointerEnter,
        onPointerLeave: events.onPointerLeave,
        onFocus: events.onFocus,
        onBlur: events.onBlur,
      },
      createElement("input", { "aria-label": "Inside" }),
    );
  }
  const before = d.engine.getSnapshot(),
    mount = d.mount(createElement(Host)),
    row = screen.getByTestId("row");
  fireEvent.pointerEnter(row);
  expect(hover.read()?.layerId).toBe(d.rectangle.id);
  expect(renders).toBe(1);
  expect(d.engine.getSnapshot()).toBe(before);
  const newer = hover.show(d.page.id, d.text.id);
  fireEvent.pointerLeave(row);
  expect(hover.read()?.layerId).toBe(d.text.id);
  newer();
  fireEvent.focus(row);
  expect(hover.read()?.layerId).toBe(d.rectangle.id);
  mount.rerender(createElement(Host, { id: d.text.id }));
  expect(hover.read()).toBeNull();
  fireEvent.pointerEnter(screen.getByTestId("row"));
  expect(hover.read()?.layerId).toBe(d.text.id);
  mount.unmount();
  expect(hover.read()).toBeNull();
});
test("focused controls hold the cue across pointer exit and release it on blur", () => {
  const d = setup(),
    hover = createTimelineHoverSource(d.engine);
  function Host() {
    const events = useLayerHover(d.engine, d.page.id, d.rectangle.id);
    return createElement(
      "div",
      {
        "data-testid": "row",
        onPointerEnter: events.onPointerEnter,
        onPointerLeave: events.onPointerLeave,
        onFocus: events.onFocus,
        onBlur: events.onBlur,
      },
      createElement("input", { "aria-label": "Inside" }),
    );
  }
  d.mount(createElement(Host));
  const field = screen.getByRole("textbox");
  field.focus();
  fireEvent.pointerEnter(screen.getByTestId("row"));
  fireEvent.pointerLeave(screen.getByTestId("row"));
  expect(hover.read()).not.toBeNull();
  fireEvent.blur(field, { relatedTarget: document.body });
  expect(hover.read()).toBeNull();
});
