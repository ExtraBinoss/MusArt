import { TooltipProvider } from "../../../src/components/ui/tooltip";
import type { ReactNode } from "react";
import type { RenderOptions } from "@testing-library/react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { ArtboardHeadings } from "../../../src/canvas/artboards/ArtboardHeadings";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
const render = (node: ReactNode, options?: RenderOptions) =>
  renderBase(node, {
    ...options,
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name: string }) => (options ? `${key} ${options.name}` : key),
  }),
}));

function fixture(count = 2) {
  const a = createPage({ name: "Cover" }),
    b = createPage({ name: "Story" }),
    pages = count === 1 ? [a] : [a, b],
    engine = new EditorEngine(createProject({ pages })),
    onError = vi.fn();
  return {
    a,
    b,
    engine,
    onError,
    props: {
      workspace: arrangeArtboards(pages),
      activeId: a.id,
      view: { x: 10, y: 20, zoom: 1 },
      engine,
      onError,
    },
  };
}
async function menu(name = "Cover") {
  fireEvent.pointerDown(screen.getByLabelText(`options ${name}`), { button: 0, ctrlKey: false });
  await screen.findByRole("menuitem", { name: "rename" });
}
it("activates, renames once per completed input, cancels Escape and ignores empty/unchanged names", async () => {
  const d = fixture(),
    { container } = render(<ArtboardHeadings {...d.props} />);
  fireEvent.click(screen.getByText("Story"));
  expect(d.engine.getSnapshot().pageId).toBe(d.b.id);
  const commands = vi.spyOn(d.engine, "execute");
  fireEvent.doubleClick(screen.getByText("Cover"));
  const input = screen.getByLabelText("name");
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "  Renamed  " } });
  fireEvent.keyDown(input, { key: "a" });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(d.engine.getSnapshot().project.pages[0]!.name).toBe("Renamed");
  expect(commands).toHaveBeenCalledTimes(1);
  for (const [name, key] of [
    ["Canceled", "Escape"],
    [" ", "Enter"],
    ["Cover", "Enter"],
  ]) {
    fireEvent.doubleClick(screen.getByText("Cover"));
    fireEvent.change(screen.getByLabelText("name"), { target: { value: name } });
    fireEvent.keyDown(screen.getByLabelText("name"), { key });
  }
  expect(commands).toHaveBeenCalledTimes(1);
  expect(container.querySelectorAll(".artboard-heading")).toHaveLength(2);
  expect(screen.getByLabelText("options Cover")).toHaveClass("artboard-options");
});
it("provides genuine Radix menu rename/delete, retains last artboard and reports rejected commands", async () => {
  const d = fixture(),
    { unmount } = render(<ArtboardHeadings {...d.props} />);
  await menu();
  fireEvent.click(screen.getByRole("menuitem", { name: "rename" }));
  const input = screen.getByLabelText("name");
  vi.spyOn(d.engine, "execute").mockImplementation(() => {
    throw new Error("Rejected rename");
  });
  fireEvent.change(input, { target: { value: "New" } });
  fireEvent.blur(input);
  expect(d.onError).toHaveBeenCalledWith("Rejected rename");
  await menu();
  fireEvent.click(screen.getByRole("menuitem", { name: "remove" }));
  expect(d.onError).toHaveBeenCalledWith("Rejected rename");
  unmount();
  const single = fixture(1),
    mounted = render(<ArtboardHeadings {...single.props} />);
  await menu();
  expect(screen.getByRole("menuitem", { name: "remove" })).toHaveAttribute("data-disabled");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  mounted.unmount();
  const success = fixture();
  render(<ArtboardHeadings {...success.props} />);
  await menu("Story");
  fireEvent.click(screen.getByRole("menuitem", { name: "remove" }));
  await waitFor(() => expect(success.engine.getSnapshot().project.pages).toHaveLength(1));
});
it("puts dimensions inside compact menus and rejects a stale rename after replacement with retained IDs", async () => {
  const d = fixture(),
    { rerender, container } = render(
      <ArtboardHeadings {...d.props} view={{ x: 0, y: 0, zoom: 0.05 }} />,
    );
  expect(container.querySelector(".artboard-heading")!).toHaveAttribute("data-compact", "true");
  await menu();
  expect(screen.getByText(`${d.a.width} × ${d.a.height} px`)).toBeInTheDocument();
  expect(screen.getByRole("separator")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "rename" }));
  fireEvent.change(screen.getByLabelText("name"), { target: { value: "Stale" } });
  const replacement = structuredClone(d.engine.getSnapshot().project);
  replacement.id = "replacement";
  replacement.pages[0]!.name = "New canonical name";
  d.engine.load(replacement);
  rerender(<ArtboardHeadings {...d.props} workspace={arrangeArtboards(replacement.pages)} />);
  fireEvent.keyDown(screen.getByLabelText("name"), { key: "Enter" });
  expect(d.engine.getSnapshot().project.pages[0]!.name).toBe("New canonical name");
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
