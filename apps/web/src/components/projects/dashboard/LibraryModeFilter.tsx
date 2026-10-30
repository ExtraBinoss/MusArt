import { LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { ModeIcon } from "../../motion/ModeIcon";
import { isLibraryMode, type LibraryMode } from "./library-mode";
import "./library-messages";

export function LibraryModeFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: LibraryMode;
  onChange: (mode: LibraryMode) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("library");
  return (
    <SegmentedTabs
      mode="choice"
      label={t("modeFilter")}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (isLibraryMode(next)) onChange(next);
      }}
      items={(["all", "static", "motion"] as const).map((mode) => ({
        value: mode,
        label: t(mode),
        icon: mode === "all" ? <LayoutGrid size={17} /> : <ModeIcon mode={mode} size={17} />,
      }))}
    />
  );
}
