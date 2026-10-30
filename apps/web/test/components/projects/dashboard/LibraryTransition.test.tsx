import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnimatePresence } from "motion/react";
import { LibraryTransition } from "../../../../src/components/projects/dashboard/LibraryTransition";

test("outgoing content is immediately inaccessible while the replacement enters", async () => {
  const click = vi.fn();
  function Page({ id }: { id: string }) {
    return (
      <AnimatePresence initial={false}>
        <LibraryTransition key={id}>
          <button onClick={click}>{id}</button>
        </LibraryTransition>
      </AnimatePresence>
    );
  }
  const view = render(<Page id="Projects" />);
  fireEvent.click(screen.getByRole("button", { name: "Projects" }));
  expect(click).toHaveBeenCalledOnce();
  view.rerender(<Page id="Templates" />);
  expect(screen.queryByRole("button", { name: "Projects" })).toBeNull();
  expect(screen.getByText("Projects").closest("[inert]")).not.toBeNull();
  expect(screen.getByText("Projects").closest(".dashboard-list-content")).toHaveStyle({
    position: "absolute",
  });
  expect(screen.getByRole("button", { name: "Templates" })).toBeInTheDocument();
  await screen.findByRole("button", { name: "Templates" });
  await waitFor(() => expect(screen.queryByText("Projects")).toBeNull());
});
