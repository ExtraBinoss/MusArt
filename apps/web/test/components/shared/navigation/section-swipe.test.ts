import { afterEach, expect, test, vi } from "vitest";
import {
  bindSectionSwipe,
  type SectionSwipeState,
} from "../../../../src/components/shared/navigation/section-swipe";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  document.body.replaceChildren();
});
function pointer(node: EventTarget, type: string, x: number, y = 40, extra = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    isPrimary: true,
    ...extra,
  });
  node.dispatchEvent(event);
  return event;
}
function fixture() {
  const surface = document.createElement("div");
  document.body.append(surface);
  Object.defineProperty(surface, "clientWidth", { value: 390 });
  const state: SectionSwipeState = {
    value: "projects",
    values: ["projects", "templates"],
    disabled: false,
  };
  const move = vi.fn(),
    rest = vi.fn(),
    select = vi.fn();
  const { dispose } = bindSectionSwipe(surface, { read: () => state, move, rest, select });
  cleanup.push(dispose);
  return { surface, state, move, rest, select, dispose };
}
test("presents imperatively and selects exactly once from the final pointerup sample", () => {
  const f = fixture();
  pointer(f.surface, "pointerdown", 300);
  pointer(window, "pointermove", 270);
  expect(f.move).toHaveBeenLastCalledWith(-30, 30 / 390);
  expect(f.select).not.toHaveBeenCalled();
  pointer(window, "pointerup", 170);
  expect(f.select).toHaveBeenCalledExactlyOnceWith("templates");
  pointer(window, "pointerup", 100);
  expect(f.select).toHaveBeenCalledOnce();
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
  f.surface.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});
test("vertical scrolling, small movements and boundary swipes never change sections", () => {
  const f = fixture();
  pointer(f.surface, "pointerdown", 300);
  pointer(window, "pointermove", 280, 100);
  pointer(window, "pointerup", 50, 100);
  expect(f.move).not.toHaveBeenCalled();
  pointer(f.surface, "pointerdown", 100);
  pointer(window, "pointerup", 70);
  pointer(f.surface, "pointerdown", 100);
  pointer(window, "pointerup", 280);
  expect(f.select).not.toHaveBeenCalled();
});
test("revalidates pending work and current section before release", () => {
  for (const mutation of ["disabled", "value", "values"] as const) {
    const f = fixture();
    pointer(f.surface, "pointerdown", 300);
    pointer(window, "pointermove", 170);
    if (mutation === "disabled") f.state.disabled = true;
    if (mutation === "value") f.state.value = "templates";
    if (mutation === "values") f.state.values = ["projects"];
    pointer(window, "pointerup", 100);
    expect(f.select).not.toHaveBeenCalled();
  }
});
test("cancel, capture loss, blur and disposal retire active gestures and listeners", () => {
  for (const end of ["pointercancel", "lostpointercapture", "blur", "dispose"]) {
    const f = fixture();
    pointer(f.surface, "pointerdown", 300);
    pointer(window, "pointermove", 170);
    if (end === "dispose") f.dispose();
    else if (end === "blur") window.dispatchEvent(new Event("blur"));
    else pointer(end === "lostpointercapture" ? f.surface : window, end, 170);
    pointer(window, "pointerup", 100);
    expect(f.select).not.toHaveBeenCalled();
    expect(f.rest).toHaveBeenCalled();
  }
});
test("form controls, mouse and a second pointer cannot acquire or complete a swipe", () => {
  const f = fixture(),
    input = document.createElement("input");
  f.surface.append(input);
  pointer(input, "pointerdown", 300);
  pointer(window, "pointerup", 100);
  pointer(f.surface, "pointerdown", 300, 40, { pointerType: "mouse" });
  pointer(window, "pointerup", 100);
  pointer(f.surface, "pointerdown", 300);
  pointer(window, "pointerup", 100, 40, { pointerId: 2 });
  expect(f.select).not.toHaveBeenCalled();
  pointer(window, "pointerup", 100);
  expect(f.select).toHaveBeenCalledExactlyOnceWith("templates");
});

test("a new deliberate pointer gesture and keyboard activation are not swallowed after a swipe", () => {
  const f = fixture();
  pointer(f.surface, "pointerdown", 300);
  pointer(window, "pointerup", 100);
  const keyboard = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
  f.surface.dispatchEvent(keyboard);
  expect(keyboard.defaultPrevented).toBe(false);
  pointer(f.surface, "pointerdown", 100);
  pointer(window, "pointerup", 100);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
  f.surface.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(false);
});

test("implicit capture transferred from a descendant does not cancel the surface's own swipe", () => {
  const f = fixture(),
    child = document.createElement("span");
  f.surface.append(child);
  vi.spyOn(f.surface, "hasPointerCapture").mockReturnValue(true);
  pointer(child, "pointerdown", 300);
  pointer(window, "pointermove", 270);
  pointer(child, "lostpointercapture", 270);
  expect(f.rest).not.toHaveBeenCalled();
  pointer(window, "pointerup", 170);
  expect(f.select).toHaveBeenCalledExactlyOnceWith("templates");
});
