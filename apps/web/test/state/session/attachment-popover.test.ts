import { expect, test } from "vitest";
import { createStore } from "jotai";
import {
  attachmentPopoverAtom,
  attachmentPopoverOpenAtom,
  type AttachmentPopoverSlot,
} from "../../../src/state/session/attachment-popover";

test("presentation follows the active opening, including close and replacement, within one store", () => {
  const store = createStore(),
    other = createStore();
  const slot: AttachmentPopoverSlot = {
    open: true,
    opening: {
      binding: { instance: {}, owner: "effect" },
      generation: 1,
      live: true,
      opened: true,
      cancel() {},
    },
  };
  expect(store.get(attachmentPopoverOpenAtom)).toBe(false);
  store.set(attachmentPopoverAtom, slot);
  expect(store.get(attachmentPopoverOpenAtom)).toBe(true);
  expect(other.get(attachmentPopoverOpenAtom)).toBe(false);
  store.set(attachmentPopoverAtom, { ...slot, open: false });
  expect(store.get(attachmentPopoverOpenAtom)).toBe(false);
  store.set(attachmentPopoverAtom, { ...slot, opening: { ...slot.opening, generation: 2 } });
  expect(store.get(attachmentPopoverOpenAtom)).toBe(true);
  store.set(attachmentPopoverAtom, null);
  expect(store.get(attachmentPopoverOpenAtom)).toBe(false);
});
