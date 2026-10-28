import type { EnginePort } from "@musart/core";
import { matchBinding } from "../keybindings/matching";
import { keybindings } from "../keybindings/store";
import { attachmentSelection, capturePresentationDelete } from "./attachments";
/** Attachment popovers preserve typing/navigation while owning the configured delete command. */
export function attachmentDeleteKey(
  event: KeyboardEvent,
  engine: EnginePort,
  run: (action: () => void) => void,
): boolean {
  const target = event.target;
  if (
    event.defaultPrevented ||
    event.repeat ||
    !attachmentSelection(engine).read() ||
    matchBinding(event, keybindings.readSnapshot()) !== "action:delete"
  )
    return false;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input,textarea,select,[role="spinbutton"],[role="slider"],[role="combobox"],[role="listbox"]',
      ))
  )
    return false;
  event.preventDefault();
  event.stopPropagation();
  run(capturePresentationDelete(engine));
  return true;
}
