import { useState } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ExportActions } from "../../../src/components/export/ExportActions";
import { setup } from "../../support/ui";
import { createMotionTransport } from "../../../src/services/motion/transport";
vi.mock("../../../src/components/export/MotionExportPreview", () => ({
  MotionExportPreview: () => <div />,
}));

vi.mock("../../../src/components/animation/timelapse/TimelapseDialog", () => ({
  TimelapseDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Timelapse">
      <button onClick={onClose}>Close Timelapse</button>
    </div>
  ),
}));
test("keeps normal image export independent and opens Timelapse from the small dropdown", async () => {
  const d = setup();
  function Harness() {
    const [open, setOpen] = useState(false);
    const [timelapseOpen, setTimelapseOpen] = useState(false);
    return (
      <ExportActions
        page={d.page}
        pageCount={1}
        engine={d.engine}
        services={d.services}
        onTask={d.onTask}
        open={open}
        onOpenChange={setOpen}
        timelapseOpen={timelapseOpen}
        onTimelapseOpenChange={setTimelapseOpen}
      />
    );
  }
  d.mount(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(screen.getByRole("dialog", { name: "Exporter la composition" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  fireEvent.pointerDown(screen.getByRole("button", { name: "Options d’export" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Exporter un timelapse…" }));
  expect(screen.getByRole("dialog", { name: "Timelapse" })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Exporter la composition" })).toBeNull();
  expect(d.services.exportImage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Close Timelapse"));
  expect(screen.queryByRole("dialog", { name: "Timelapse" })).toBeNull();
});

test("opening the common exporter pauses only the editor's presentation and never resumes or seeks on close", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const transport = createMotionTransport(d.engine);
  transport.seek({ value: 1, rate: 2 });
  transport.play();
  const before = d.engine.getSnapshot(),
    position = transport.read().time;
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <ExportActions
        engine={d.engine}
        page={before.project.pages[0]!}
        pageCount={1}
        services={d.services}
        onTask={d.onTask}
        open={open}
        onOpenChange={setOpen}
        timelapseOpen={false}
        onTimelapseOpenChange={vi.fn()}
      />
    );
  }
  d.mount(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Exporter", exact: true }));
  expect(transport.read()).toMatchObject({ playing: false, time: position });
  fireEvent.click(screen.getByRole("button", { name: "Annuler", exact: true }));
  expect(transport.read()).toMatchObject({ playing: false, time: position });
  expect(d.engine.getSnapshot()).toBe(before);
});
