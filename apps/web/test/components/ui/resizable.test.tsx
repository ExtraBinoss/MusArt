import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../../../src/components/ui/resizable";
test("renders keyboard accessible split panels with and without grip", () => {
  render(
    <>
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="a" defaultSize="50%">
          Canvas
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="b" defaultSize="50%">
          Inspector
        </ResizablePanel>
      </ResizablePanelGroup>
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel id="c">One</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="d">Two</ResizablePanel>
      </ResizablePanelGroup>
    </>,
  );
  expect(screen.getByText("Canvas")).toBeInTheDocument();
  expect(screen.getAllByRole("separator")).toHaveLength(2);
});
