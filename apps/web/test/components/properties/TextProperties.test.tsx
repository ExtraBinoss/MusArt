import { expect, test, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { TextProperties } from "../../../src/components/properties/TextProperties";
import { setup } from "../../support/ui";
async function chooseFont(font: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Police" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Rechercher une police" }), {
    target: { value: font },
  });
  fireEvent.click(await screen.findByRole("option", { name: font }));
}
test("edits text, font, numeric typography and alignment through property actions", async () => {
  const d = setup(),
    patch = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  d.mount(<TextProperties layer={d.text} patch={patch} preview={preview} cancel={cancel} />);
  fireEvent.blur(screen.getByLabelText("Contenu du texte"));
  expect(patch).not.toHaveBeenCalled();
  fireEvent.blur(screen.getByLabelText("Contenu du texte"), { target: { value: "New text" } });
  expect(patch).toHaveBeenLastCalledWith({ text: "New text" });
  await chooseFont("Tinos");
  expect(patch).toHaveBeenLastCalledWith({ fontFamily: "Tinos" });
  for (const font of ["Space Grotesk", "Arimo", "Roboto Mono"]) {
    await chooseFont(font);
    expect(patch).toHaveBeenLastCalledWith({ fontFamily: font });
  }
  fireEvent.change(screen.getByLabelText("Corps"), { target: { value: "48" } });
  expect(preview).toHaveBeenLastCalledWith({ fontSize: 48 });
  fireEvent.blur(screen.getByLabelText("Corps"));
  expect(patch).toHaveBeenLastCalledWith({ fontSize: 48 });
  fireEvent.keyDown(screen.getByLabelText("Approche"), { key: "Escape" });
  expect(cancel).toHaveBeenCalled();
  for (const label of ["Centrer le texte", "Aligner à droite", "Aligner à gauche"])
    fireEvent.click(screen.getByLabelText(label));
  expect(patch).toHaveBeenLastCalledWith({ textAlign: "left" });
});

test.each([
  ["Arial", "Arimo"],
  ["Georgia", "Tinos"],
  ["monospace", "Roboto Mono"],
])("shows the bundled replacement for the legacy %s family", (legacy, bundled) => {
  const data = setup();
  data.mount(
    <TextProperties
      layer={{ ...data.text, fontFamily: legacy }}
      patch={vi.fn()}
      preview={vi.fn()}
      cancel={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent(bundled);
});
