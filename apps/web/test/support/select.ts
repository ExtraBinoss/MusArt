import { fireEvent, screen } from "@testing-library/react";
/** Drive the real Radix Select through its accessible trigger and option. */
export async function choose(label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  const item = await screen.findByRole("option", { name: option });
  fireEvent.click(item);
}
