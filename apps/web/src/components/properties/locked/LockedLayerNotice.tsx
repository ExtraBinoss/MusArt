import type { Composition, EnginePort, Layer } from "@musart/core";
import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSetAtom } from "jotai";
import { previewAtom } from "../../../state/session/editor";
import { Button } from "../../ui/button";
import { blockingLocks, captureUnlock } from "./unlock";
import { resolveInspectorPage } from "../inspector-scope";
import "./messages";
import "./locked-layer.css";

/** Explains effective locking and offers one validated undoable unlock of the actual blocking paths. */
export function LockedLayerNotice({
  engine,
  page,
  layers,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  layers: readonly Layer[];
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation("lockedLayer");
  const setPreview = useSetAtom(previewAtom);
  const ids = layers.map((layer) => layer.id),
    selected = new Set(ids);
  const locks = blockingLocks(page, ids);
  if (!locks.length) return null;
  const parents = locks.filter((layer) => !selected.has(layer.id));
  return (
    <div className="locked-layer-notice" role="status">
      <LockKeyhole size={15} aria-hidden />
      <div>
        <strong>{t(layers.length === 1 ? "locked" : "multiple")}</strong>
        {parents.length > 0 && (
          <small>{t("parents", { names: parents.map((layer) => layer.name).join(", ") })}</small>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          const currentPage = resolveInspectorPage(engine, page);
          if (!currentPage) return;
          const unlock = captureUnlock(engine, currentPage, ids);
          run(() => {
            if (unlock()) setPreview(null);
          });
        }}
      >
        {t("unlock")}
      </Button>
    </div>
  );
}
