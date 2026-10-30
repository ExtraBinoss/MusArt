import { fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { expect, test, vi } from "vitest";
import { Popover, PopoverTrigger, PopoverContent } from "../../../src/components/ui/popover";
import BlurTextAnimation, {
  BlurReveal,
  Component,
  BlurTextAnimation as Named,
} from "../../../src/components/ui/blur-text-animation";
function animation(element: Element, type: string) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "animationName", { value: "musart-blur-reveal" });
  fireEvent(element, event);
}
test("keeps the supplied API aliases, exact whitespace and surrounding typography without demo content", () => {
  expect(Component).toBe(BlurTextAnimation);
  expect(Named).toBe(BlurTextAnimation);
  const view = render(<BlurTextAnimation />);
  expect(view.container.textContent).toBe("");
  view.rerender(<BlurTextAnimation text={"  Bonjour\nMusArt !"} />);
  expect(view.container.textContent).toBe("  Bonjour\nMusArt !");
  const words = view.container.querySelectorAll<HTMLElement>("[data-blur-reveal]");
  expect(words).toHaveLength(3);
  expect([...words].map((word) => word.textContent)).toEqual(["Bonjour", "MusArt", "!"]);
  expect([...words].map((word) => word.style.getPropertyValue("--blur-reveal-delay"))).toEqual([
    "0ms",
    "4ms",
    "8ms",
  ]);
  const root = view.container.firstElementChild as HTMLElement;
  expect(root.style.fontSize).toBe("");
  expect(root.style.background).toBe("");
  expect(root.style.minHeight).toBe("");
});
test("bounds supplied word timings, blur and scale while preserving explicit styles and initial delay", () => {
  const view = render(
    <BlurTextAnimation
      className="custom"
      fontSize="text-4xl"
      fontFamily="font-serif"
      textColor="text-red-500"
      style={{ fontSize: "20px", fontFamily: "serif", color: "red", lineHeight: 2 }}
      animationDelay={10}
      words={[
        { text: "Réglages", duration: 2.2, delay: 2, blur: 20, scale: 0.9 },
        { text: "créatifs", duration: 0.01, delay: -1, blur: -2, scale: 0.2 },
        { text: "limites", duration: 100, delay: 100, blur: 100, scale: 5 },
      ]}
    />,
  );
  const root = view.container.firstElementChild as HTMLElement;
  expect(root).toHaveClass("custom", "text-4xl", "font-serif", "text-red-500");
  expect(root).toHaveStyle({
    fontSize: "20px",
    fontFamily: "serif",
    color: "rgb(255, 0, 0)",
    lineHeight: "2",
  });
  expect(root.textContent).toBe("Réglages créatifs limites");
  const words = root.querySelectorAll<HTMLElement>("[data-blur-reveal]");
  expect(words[0]!.style.getPropertyValue("--blur-reveal-duration")).toBe("2200ms");
  expect(words[0]!.style.getPropertyValue("--blur-reveal-delay")).toBe("2010ms");
  expect(words[0]!.style.getPropertyValue("--blur-reveal-amount")).toBe("20px");
  expect(words[0]!.style.getPropertyValue("--blur-reveal-scale")).toBe("0.9");
  expect(words[1]!.style.getPropertyValue("--blur-reveal-duration")).toBe("10ms");
  expect(words[1]!.style.getPropertyValue("--blur-reveal-delay")).toBe("10ms");
  expect(words[1]!.style.getPropertyValue("--blur-reveal-amount")).toBe("0px");
  expect(words[1]!.style.getPropertyValue("--blur-reveal-scale")).toBe("0.5");
  expect(words[2]!.style.getPropertyValue("--blur-reveal-duration")).toBe("5000ms");
  expect(words[2]!.style.getPropertyValue("--blur-reveal-delay")).toBe("10000ms");
  expect(words[2]!.style.getPropertyValue("--blur-reveal-amount")).toBe("24px");
  expect(words[2]!.style.getPropertyValue("--blur-reveal-scale")).toBe("1.25");
});
test("asChild preserves the real control, its ref, keyboard behavior and geometry without another wrapper", () => {
  const click = vi.fn(),
    ref = vi.fn(),
    cleanup = vi.fn();
  const view = render(
    <BlurReveal asChild order={7}>
      <button
        ref={(node) => {
          ref(node);
          return cleanup;
        }}
        onClick={click}
      >
        Open
      </button>
    </BlurReveal>,
  );
  const button = screen.getByRole("button", { name: "Open" });
  expect(view.container.children).toHaveLength(1);
  expect(view.container.firstElementChild).toBe(button);
  expect(ref).toHaveBeenCalledWith(button);
  expect(button).not.toHaveClass("blur-reveal-inline");
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  view.unmount();
  expect(cleanup).toHaveBeenCalledOnce();
});
test("retained owners keep their initial rank and complete only once without React frame updates", () => {
  const commits = vi.fn();
  const view = render(
    <Profiler id="reveal" onRender={commits}>
      <BlurReveal order={2} delayMs={8}>
        Layer
      </BlurReveal>
    </Profiler>,
  );
  const reveal = screen.getByText("Layer"),
    initial = commits.mock.calls.length;
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("opacity, transform, filter");
  animation(reveal, "animationstart");
  animation(reveal, "animationend");
  expect(reveal.style.willChange).toBe("");
  expect(reveal).toHaveAttribute("data-blur-complete");
  expect(commits).toHaveBeenCalledTimes(initial);
  view.rerender(
    <Profiler id="reveal" onRender={commits}>
      <BlurReveal order={20} delayMs={48}>
        Layer
      </BlurReveal>
    </Profiler>,
  );
  expect(screen.getByText("Layer")).toBe(reveal);
  expect(reveal).toHaveAttribute("data-blur-order", "2");
  expect(reveal.style.getPropertyValue("--blur-reveal-delay")).toBe("8ms");
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("");
});
test("nested events cannot activate the parent hint; cancellation and unmount release every listener and hint", () => {
  const view = render(
    <BlurReveal>
      Outer <span>Inner</span>
    </BlurReveal>,
  );
  const inner = screen.getByText("Inner"),
    reveal = inner.parentElement!;
  animation(inner, "animationstart");
  expect(reveal.style.willChange).toBe("");
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("opacity, transform, filter");
  animation(reveal, "animationcancel");
  expect(reveal).toHaveAttribute("data-blur-complete");
  expect(reveal.style.willChange).toBe("");
  view.unmount();
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("");
});
test("reduced motion is complete immediately and never replays when the same owner changes preference", () => {
  const view = render(<BlurReveal reduced>Immediate</BlurReveal>);
  const reveal = screen.getByText("Immediate");
  expect(reveal).toHaveAttribute("data-blur-complete");
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("");
  view.rerender(<BlurReveal reduced={false}>Immediate</BlurReveal>);
  expect(reveal).toHaveAttribute("data-blur-complete");
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("");
});
test("invalid numeric props remain finite and unmount while active restores a caller hint", () => {
  const view = render(
    <BlurReveal
      order={NaN}
      durationMs={Infinity}
      delayMs={NaN}
      initialDelayMs={-1}
      blur={NaN}
      scale={Infinity}
      style={{ willChange: "contents" }}
    >
      Safe
    </BlurReveal>,
  );
  const reveal = screen.getByText("Safe");
  expect(reveal.style.getPropertyValue("--blur-reveal-duration")).toBe("150ms");
  expect(reveal.style.getPropertyValue("--blur-reveal-delay")).toBe("0ms");
  expect(reveal.style.getPropertyValue("--blur-reveal-amount")).toBe("3px");
  expect(reveal.style.getPropertyValue("--blur-reveal-scale")).toBe("1");
  animation(reveal, "animationstart");
  view.unmount();
  expect(reveal.style.willChange).toBe("contents");
  animation(reveal, "animationstart");
  expect(reveal.style.willChange).toBe("contents");
});

test("asChild reuses a plain layout section and keeps nested controls immediately usable", () => {
  const click = vi.fn();
  const view = render(
    <BlurReveal asChild>
      <div style={{ display: "grid", padding: 12 }}>
        <button onClick={click}>Apply</button>
      </div>
    </BlurReveal>,
  );
  const section = view.container.firstElementChild as HTMLElement;
  expect(section.tagName).toBe("DIV");
  expect(section).toHaveStyle({ display: "grid", padding: "12px" });
  expect(section).not.toHaveClass("blur-reveal-inline");
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(click).toHaveBeenCalledOnce();
});
test("asChild works on a real portalled Radix popover content without adding product layout", () => {
  const view = render(
    <Popover defaultOpen>
      <PopoverTrigger>Open details</PopoverTrigger>
      <BlurReveal asChild>
        <PopoverContent
          role="dialog"
          aria-label="Details"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          Reusable content
        </PopoverContent>
      </BlurReveal>
    </Popover>,
  );
  const content = screen.getByRole("dialog", { name: "Details" });
  expect(content).toHaveAttribute("data-slot", "popover-content");
  expect(content).toHaveAttribute("data-blur-reveal");
  expect(content).not.toHaveClass("blur-reveal-inline");
  expect(content).toHaveTextContent("Reusable content");
  animation(content, "animationstart");
  expect(content.style.willChange).toBe("opacity, transform, filter");
  view.unmount();
  expect(content.style.willChange).toBe("");
  animation(content, "animationstart");
  expect(content.style.willChange).toBe("");
});

test("completion does not overwrite a hint installed by another owner during the entrance", () => {
  const view = render(<BlurReveal style={{ willChange: "contents" }}>Shared</BlurReveal>);
  const reveal = screen.getByText("Shared");
  animation(reveal, "animationstart");
  reveal.style.willChange = "scroll-position";
  animation(reveal, "animationend");
  expect(reveal.style.willChange).toBe("scroll-position");
  view.unmount();
  expect(reveal.style.willChange).toBe("scroll-position");
});
