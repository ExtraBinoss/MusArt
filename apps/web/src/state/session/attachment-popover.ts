import { atom } from "jotai";

export interface AttachmentPopoverBinding {
  instance: object;
  owner: string;
}
export interface AttachmentPopoverOpening {
  binding: AttachmentPopoverBinding;
  generation: number;
  live: boolean;
  opened: boolean;
  cancel(): void;
}
export interface AttachmentPopoverSlot {
  opening: AttachmentPopoverOpening;
  open: boolean;
}

/** Provider-scoped ownership also lets secondary panels yield for the whole editing session. */
export const attachmentPopoverAtom = atom<AttachmentPopoverSlot | null>(null);
export const attachmentPopoverOpenAtom = atom((get) => get(attachmentPopoverAtom)?.open ?? false);
