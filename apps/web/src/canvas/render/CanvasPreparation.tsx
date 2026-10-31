import { useTranslation } from "react-i18next";
import { Throbber } from "../../components/ui/throbber/Throbber";
import type { BrandActivity } from "../../ui/brand/playback";
import "./loading.css";

/** The module fallback and the native GPU wait share one quiet canvas presentation. */
export function CanvasPreparation({ activity }: { activity?: BrandActivity }) {
  const { t } = useTranslation();
  return (
    <div className="canvas-loading">
      <div className="canvas-loading-feedback">
        <span className="canvas-loading-orbit" aria-hidden="true" />
        <Throbber size={56} variant="shimmer" label={t("loadingCanvas")} activity={activity} />
      </div>
    </div>
  );
}
