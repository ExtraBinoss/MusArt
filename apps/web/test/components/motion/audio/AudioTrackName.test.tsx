import "../../../../src/state/i18n";
import { expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AudioTrackName } from "../../../../src/components/motion/audio/AudioTrackName";
import { audioFixture } from "../../../support/audio";
it("renames only the audio clip through the shared F2/Enter editor with undo", () => {
  const d = audioFixture();
  render(<AudioTrackName engine={d.engine} track={d.track()} active onSelect={() => {}} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Sound 0" }), { key: "F2" });
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Soft whoosh" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(d.track().name).toBe("Soft whoosh");
  expect(d.page().layers).toEqual([]);
  d.engine.undo();
  expect(d.track().name).toBe("Sound 0");
});
