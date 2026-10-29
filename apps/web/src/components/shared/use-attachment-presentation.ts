import { useDeferredValue, useState } from "react";
import { useAtomValue } from "jotai";
import { attachmentPopoverOpenAtom } from "../../state/session/attachment-popover";

/** Keep secondary panels out of attachment editing; adopt the latest model after dismissal. */
export function useAttachmentPresentation<T>(value: T): T {
  const editing = useAtomValue(attachmentPopoverOpenAtom);
  const [retained, setRetained] = useState(() => value);
  const shown = useDeferredValue(editing ? retained : value);
  if (!Object.is(retained, shown)) setRetained(() => shown);
  return shown;
}
