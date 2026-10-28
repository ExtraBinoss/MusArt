import { expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import type { EnginePort } from "@musart/core";
import { CanvasArea } from "../../../src/components/viewport/CanvasArea";
import { setup } from "../../support/ui";
vi.mock("../../../src/canvas/EditorCanvas", () => ({
  EditorCanvas: ({
    engine,
    tool,
    onError,
    onDropFiles,
    onImagePoint,
  }: {
    engine: EnginePort;
    tool: string;
    onError(this: void, message: string): void;
    onDropFiles(this: void, files: File[]): void;
    onImagePoint(this: void, id: string, x: number, y: number): void;
  }) => (
    <div>
      <span>{tool}</span>
      <span>{engine.getSnapshot().project.name}</span>
      <button onClick={() => onError("GPU error")}>Error</button>
      <button onClick={() => onDropFiles([])}>Drop</button>
      <button onClick={() => onImagePoint("image", 1, 2)}>Point</button>
    </div>
  ),
}));
test("lazy loads the R3F adapter and forwards interaction callbacks", async () => {
  const data = setup();
  const error = vi.fn();
  const drop = vi.fn();
  const point = vi.fn();
  data.mount(
    <CanvasArea engine={data.engine} onError={error} onDropFiles={drop} onImagePoint={point} />,
  );
  await screen.findByText("Atelier");
  fireEvent.click(screen.getByText("Error"));
  fireEvent.click(screen.getByText("Drop"));
  fireEvent.click(screen.getByText("Point"));
  await waitFor(() => expect(error).toHaveBeenCalledWith("GPU error"));
  expect(drop).toHaveBeenCalledWith([]);
  expect(point).toHaveBeenCalledWith("image", 1, 2);
});
