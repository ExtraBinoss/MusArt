import { useTranslation } from "react-i18next";
import type { PrintExportOptions } from "@musart/render";
import { NumberInput } from "../shared/NumberInput";
import { Switch } from "../ui/switch";
import { ExportAdvanced } from "./ExportLayout";
export function PrintSettings({
  value,
  onChange,
  disabled,
}: {
  value: PrintExportOptions;
  onChange: (value: PrintExportOptions) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("exportPanel");
  return (
    <ExportAdvanced print>
      <p className="export-scope">{t("printHint")}</p>
      <NumberInput
        label={t("dpi")}
        value={value.dpi}
        min={72}
        max={1200}
        disabled={disabled}
        onCommit={(dpi) => onChange({ ...value, dpi })}
      />
      <NumberInput
        label={t("bleed")}
        value={value.bleedMm}
        min={0}
        max={25}
        step={0.5}
        disabled={disabled}
        onCommit={(bleedMm) => onChange({ ...value, bleedMm })}
      />
      {(["cropMarks", "registrationMarks", "colorBars", "pageInfo"] as const).map((key) => (
        <label key={key} className="switch-row">
          <span>{t(key)}</span>
          <Switch
            aria-label={t(key)}
            checked={value[key]}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
          />
        </label>
      ))}
    </ExportAdvanced>
  );
}
