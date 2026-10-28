import { expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../src/components/ui/tabs";
test("switches accessible panels and supports vertical line styling", () => {
  const view = render(
    <Tabs defaultValue="design">
      <TabsList>
        <TabsTrigger value="design">Design</TabsTrigger>
        <TabsTrigger value="animate">Animate</TabsTrigger>
      </TabsList>
      <TabsContent value="design">Properties</TabsContent>
      <TabsContent value="animate">Timeline</TabsContent>
    </Tabs>,
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Animate" }), { button: 0, ctrlKey: false });
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Timeline");
  view.rerender(
    <Tabs defaultValue="design" orientation="vertical">
      <TabsList variant="line">
        <TabsTrigger value="design">Design</TabsTrigger>
      </TabsList>
      <TabsContent value="design">Properties</TabsContent>
    </Tabs>,
  );
  expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "line");
});
