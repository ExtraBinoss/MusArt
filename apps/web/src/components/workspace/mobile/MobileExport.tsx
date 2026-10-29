import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { useEngine } from "../../../state/session/editor";
import { ExportSettings } from "../../export/ExportSettings";
import { EditorSidebar } from "../EditorSidebar";
import { MobileSheet } from "./MobileSheet";
import "../../export/messages";

type Props = Pick<ComponentProps<typeof EditorSidebar>, "engine" | "services" | "onTask"> & {
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
};

/** Real export scope follows committed edits locally; the app shell never subscribes to it. */
export function MobileExport({ engine, services, onTask, onClose, onPendingChange }: Props) {
  const { t } = useTranslation();
  const snapshot = useEngine(engine);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const pendingChanged = useCallback(
    (value: boolean) => {
      setBusy(value);
      onPendingChange(value);
    },
    [onPendingChange],
  );
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  function close() {
    if (!pending.current) onClose();
  }
  return (
    <MobileSheet
      title={t("exportTitle")}
      onClose={close}
      dismissible={!busy}
      className="mobile-sheet-export"
    >
      <ExportSettings
        page={page}
        pageCount={snapshot.project.pages.length}
        selection={snapshot.selection}
        revision={snapshot.revision}
        services={services}
        onTask={onTask}
        pendingRef={pending}
        onPendingChange={pendingChanged}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
    </MobileSheet>
  );
}
