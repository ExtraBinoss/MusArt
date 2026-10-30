import { afterEach, expect, test, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import {
  dockRegions,
  observeDockInteraction,
} from "../../../src/components/motion-shell/dock-interaction";

afterEach(() => {
  delete document.documentElement.dataset.layerReorderActive;
  vi.useRealTimers();
  document.body.replaceChildren();
});

test("native dragging retains the unpinned dock after browser pointer cancellation", () => {
  const d = fixture(true);
  fireEvent.pointerOver(d.button);
  fireEvent.pointerDown(d.button, { pointerId: 7 });
  fireEvent.dragStart(d.button);
  fireEvent.pointerCancel(d.button, { pointerId: 7 });
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  vi.advanceTimersByTime(1000);
  expect(d.watcher.dragging()).toBe(true);
  expect(d.actions.close).not.toHaveBeenCalled();
  fireEvent.dragEnd(d.button);
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  expect(d.watcher.dragging()).toBe(false);
  d.watcher.dispose();
});

test("a shared Layers drag retains an open dock and a native drag can reveal its peek", async () => {
  const d = fixture(true);
  fireEvent.pointerOver(d.button);
  document.documentElement.dataset.layerReorderActive = "true";
  await Promise.resolve();
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).not.toHaveBeenCalled();
  delete document.documentElement.dataset.layerReorderActive;
  await Promise.resolve();
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  fireEvent.dragOver(d.button);
  expect(d.actions.open).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).toHaveBeenCalledOnce();
  d.watcher.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
function fixture(expanded = false, geometry = false) {
  vi.useFakeTimers();
  const root = document.createElement("section"),
    button = document.createElement("button");
  root.append(button);
  document.body.append(root);
  const measurement = vi
    .spyOn(root, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, geometry ? 500 : 0, geometry ? 1000 : 0, geometry ? 260 : 0));
  let open = expanded,
    pinned = false;
  const actions = {
    expanded: () => open,
    pinned: () => pinned,
    open: vi.fn(() => {
      open = true;
    }),
    close: vi.fn(() => {
      open = false;
    }),
    idle: vi.fn(),
  };
  const watcher = observeDockInteraction(root, actions);
  return {
    root,
    button,
    actions,
    watcher,
    measurement,
    pin: (value: boolean) => {
      pinned = value;
    },
    setExpanded: (value: boolean) => {
      open = value;
    },
  };
}
test("hover has an entrance delay, exit grace and reentry hysteresis; disposal cancels all work", () => {
  const d = fixture();
  fireEvent.pointerOver(d.button);
  vi.advanceTimersByTime(99);
  expect(d.actions.open).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(d.actions.open).toHaveBeenCalledOnce();
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  vi.advanceTimersByTime(200);
  fireEvent.pointerOver(d.button);
  vi.advanceTimersByTime(400);
  expect(d.actions.close).not.toHaveBeenCalled();
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  fireEvent.pointerOver(d.button);
  d.watcher.dispose();
  vi.advanceTimersByTime(1000);
  expect(d.actions.open).toHaveBeenCalledOnce();
});
test("active pointer gestures retain expansion outside the dock, including cancellation", () => {
  const d = fixture(true);
  fireEvent.pointerOver(d.button);
  fireEvent.pointerDown(d.button, { pointerId: 7 });
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  vi.advanceTimersByTime(1000);
  expect(d.watcher.dragging()).toBe(true);
  expect(d.actions.close).not.toHaveBeenCalled();
  fireEvent.pointerCancel(document.body, { pointerId: 7 });
  vi.advanceTimersByTime(280);
  expect(d.actions.idle).toHaveBeenCalledOnce();
  expect(d.actions.close).toHaveBeenCalledOnce();
  d.watcher.dispose();
});
test("header click does not move under the pointer before its release", () => {
  const d = fixture();
  fireEvent.pointerOver(d.button);
  fireEvent.pointerDown(d.button, { pointerId: 1 });
  vi.advanceTimersByTime(500);
  expect(d.actions.open).not.toHaveBeenCalled();
  fireEvent.pointerUp(d.button, { pointerId: 1 });
  vi.advanceTimersByTime(100);
  expect(d.actions.open).toHaveBeenCalledOnce();
  d.watcher.dispose();
});
test("an external collapse cannot hide a captured drag or an owned editor", () => {
  const d = fixture(true);
  fireEvent.pointerDown(d.button, { pointerId: 5 });
  d.setExpanded(false);
  d.watcher.refresh();
  expect(d.actions.open).toHaveBeenCalledOnce();
  expect(d.actions.expanded()).toBe(true);
  d.watcher.dispose();
});
test("typed controls and keyboard focus keep ownership until focus leaves", async () => {
  const d = fixture(true),
    input = document.createElement("input");
  d.root.append(input);
  fireEvent.pointerOver(d.button);
  input.focus();
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  await Promise.resolve();
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).not.toHaveBeenCalled();
  input.blur();
  await Promise.resolve();
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  d.watcher.dispose();
});
test("only owned portals retain the dock, recursively including portalled select options", async () => {
  const d = fixture(true),
    popup = document.createElement("div"),
    select = document.createElement("button"),
    list = document.createElement("div");
  popup.id = "easing-popup";
  list.id = "easing-options";
  d.button.setAttribute("aria-expanded", "true");
  d.button.setAttribute("aria-controls", popup.id);
  select.setAttribute("aria-expanded", "true");
  select.setAttribute("aria-controls", list.id);
  popup.append(select);
  document.body.append(popup, list);
  expect([...dockRegions(d.root)]).toEqual([d.root, popup, list]);
  fireEvent.pointerOver(d.button);
  fireEvent.pointerOut(d.button, { relatedTarget: list });
  fireEvent.pointerOver(document.body);
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).not.toHaveBeenCalled();
  d.button.setAttribute("aria-expanded", "false");
  await Promise.resolve();
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  expect(dockRegions(d.root).size).toBe(1);
  d.watcher.dispose();
});
test("pin retains expansion; explicit dismissal suppresses hover until a real leave", () => {
  const d = fixture(true);
  fireEvent.pointerOver(d.button);
  d.pin(true);
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).not.toHaveBeenCalled();
  d.pin(false);
  d.watcher.refresh();
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  d.watcher.dismiss();
  fireEvent.pointerOver(d.button);
  vi.advanceTimersByTime(500);
  expect(d.actions.open).not.toHaveBeenCalled();
  fireEvent.pointerOut(d.button, { relatedTarget: document.body });
  fireEvent.pointerOver(d.button);
  vi.advanceTimersByTime(100);
  expect(d.actions.open).toHaveBeenCalledOnce();
  d.watcher.dispose();
});
test("a deliberate external toggle remains open until the user engages or dismisses it", () => {
  const d = fixture(true);
  d.watcher.refresh();
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body, { pointerId: 1 });
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  d.watcher.dispose();
});

test("a fast departure closes in 90 ms while an ordinary exit retains the 280 ms grace", () => {
  const fast = fixture(true, true);
  fireEvent.pointerOver(fast.button, { clientX: 500, clientY: 550 });
  vi.advanceTimersByTime(16);
  fireEvent.pointerOut(fast.button, { relatedTarget: document.body, clientX: 500, clientY: 440 });
  vi.advanceTimersByTime(40);
  fireEvent.pointerOver(document.body, { clientX: 500, clientY: 400 });
  vi.advanceTimersByTime(49);
  expect(fast.actions.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(fast.actions.close).toHaveBeenCalledOnce();
  fast.watcher.dispose();

  const slow = fixture(true, true);
  fireEvent.pointerOver(slow.button, { clientX: 500, clientY: 550 });
  vi.advanceTimersByTime(200);
  fireEvent.pointerOut(slow.button, { relatedTarget: document.body, clientX: 500, clientY: 440 });
  vi.advanceTimersByTime(279);
  expect(slow.actions.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(slow.actions.close).toHaveBeenCalledOnce();
  slow.watcher.dispose();
});

test("the 24 px top-handle corridor holds without timers or per-move layout reads until a true departure", () => {
  const d = fixture(true, true);
  fireEvent.pointerOver(d.button, { clientX: 500, clientY: 515 });
  vi.advanceTimersByTime(16);
  fireEvent.pointerOut(d.button, { relatedTarget: document.body, clientX: 500, clientY: 490 });
  const reads = d.measurement.mock.calls.length;
  for (let move = 0; move < 60; move++) {
    vi.advanceTimersByTime(16);
    fireEvent.pointerMove(document.body, { clientX: 500 + move, clientY: 477 + (move % 20) });
  }
  expect(d.measurement).toHaveBeenCalledTimes(reads);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(1000);
  expect(d.actions.close).not.toHaveBeenCalled();
  fireEvent.pointerMove(document.body, { clientX: 550, clientY: 470 });
  vi.advanceTimersByTime(279);
  expect(d.actions.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(d.actions.close).toHaveBeenCalledOnce();
  d.watcher.dispose();
});

test("cached corridor geometry refreshes on layout change and intent listeners are disposed", () => {
  const d = fixture(true, true);
  fireEvent.pointerOver(d.button, { clientX: 500, clientY: 515 });
  fireEvent.pointerOut(d.button, { relatedTarget: document.body, clientX: 500, clientY: 490 });
  d.measurement.mockReturnValue(new DOMRect(0, 450, 1000, 310));
  fireEvent.resize(window);
  vi.advanceTimersByTime(280);
  expect(d.actions.close).toHaveBeenCalledOnce();
  const reads = d.measurement.mock.calls.length;
  d.watcher.dispose();
  fireEvent.resize(window);
  fireEvent.pointerMove(document.body, { clientX: 500, clientY: 430 });
  vi.advanceTimersByTime(1000);
  expect(d.measurement).toHaveBeenCalledTimes(reads);
  expect(d.actions.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test.each(["input", "portal", "drag"])(
  "%s ownership still overrides a fast outside departure",
  (owner) => {
    const d = fixture(true, true);
    if (owner === "portal") {
      const popup = document.createElement("div");
      popup.id = "owned-editor";
      document.body.append(popup);
      d.button.setAttribute("aria-expanded", "true");
      d.button.setAttribute("aria-controls", popup.id);
    }
    fireEvent.pointerOver(d.button, { clientX: 500, clientY: 550 });
    if (owner === "input") {
      const input = document.createElement("input");
      d.root.append(input);
      input.focus();
    } else if (owner === "drag") fireEvent.pointerDown(d.button, { pointerId: 7 });
    vi.advanceTimersByTime(8);
    fireEvent.pointerOut(d.button, { relatedTarget: document.body, clientX: 500, clientY: 400 });
    vi.advanceTimersByTime(1000);
    expect(d.actions.close).not.toHaveBeenCalled();
    d.watcher.dispose();
  },
);
