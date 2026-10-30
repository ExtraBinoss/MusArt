import { useDeferredValue, useState } from "react";
import { useAtomValue } from "jotai";
import { attachmentPopoverOpenAtom } from "../../state/session/attachment-popover";

/** Keep secondary panels out of attachment editing; adopt the latest model after dismissal. */
export function useAttachmentPresentation<T>(
  value: T,
  sameOwner?: (before: T, after: T) => boolean,
): T {
  const editing = useAtomValue(attachmentPopoverOpenAtom);
  const [retained, setRetained] = useState(() => value);
  const deferred = useDeferredValue(editing ? retained : value);
  // A completed edit must not disable the next gesture on the same owner.
  const shown = !editing && sameOwner?.(retained, value) ? value : deferred;
  if (!Object.is(retained, shown)) setRetained(() => shown);
  return shown;
}
