import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { PRESETS } from "@musart/core";
import type { NewProjectOptions } from "../../../state/contracts";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { SelectField } from "../../shared/SelectField";
import { NumberInput } from "../../shared/NumberInput";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
export function NewProjectForm({
  onCreate,
  disabled = false,
}: {
  disabled?: boolean;
  onCreate(this: void, options: NewProjectOptions): void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<NewProjectOptions>({
    name: t("untitled"),
    width: 1080,
    height: 1080,
    background: "#faf9f6",
  });
  const [preset, setPreset] = useState("custom");
  const [category, setCategory] = useState("all");
  return (
    <form
      className="new-project-form"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate(preset === "custom" ? options : { ...options, presetId: preset });
      }}
    >
      <fieldset disabled={disabled} className="new-project-fields">
        <Label htmlFor="new-project-name">{t("name")}</Label>
        <Input
          id="new-project-name"
          value={options.name}
          required
          maxLength={160}
          onChange={(event) => setOptions({ ...options, name: event.target.value })}
        />
        <SelectField
          label={t("presetCategory")}
          value={category}
          options={["all", "social", "video", "print", "screen"].map((value) => ({
            value,
            label: t(`presetCategory_${value}`),
          }))}
          onValueChange={setCategory}
        />
        <Label htmlFor="new-project-preset">{t("presetLabel")}</Label>
        <SelectField
          id="new-project-preset"
          label={t("presetLabel")}
          value={preset}
          options={[
            { value: "custom", label: t("custom") },
            ...PRESETS.filter((item) => category === "all" || item.category === category).map(
              (item) => ({
                value: item.id,
                label: (
                  <>
                    <SocialBrandIcon id={item.brandId} size={14} />
                    <span>
                      {t(item.nameKey)} · {item.width} × {item.height}
                    </span>
                  </>
                ),
              }),
            ),
          ]}
          onValueChange={(value) => {
            setPreset(value);
            const selected = PRESETS.find((item) => item.id === value);
            if (selected)
              setOptions({ ...options, width: selected.width, height: selected.height });
          }}
        />
        <div className="new-dimensions">
          <NumberInput
            key={`w:${options.width}`}
            label={t("width")}
            unit="px"
            value={options.width}
            min={1}
            max={16384}
            onCommit={(width) => {
              setPreset("custom");
              setOptions({ ...options, width });
            }}
          />
          <span>×</span>
          <NumberInput
            key={`h:${options.height}`}
            label={t("height")}
            unit="px"
            value={options.height}
            min={1}
            max={16384}
            onCommit={(height) => {
              setPreset("custom");
              setOptions({ ...options, height });
            }}
          />
        </div>
        <Label htmlFor="new-project-background">{t("background")}</Label>
        <Input
          id="new-project-background"
          type="color"
          value={options.background}
          onChange={(event) => setOptions({ ...options, background: event.target.value })}
        />
        <Button type="submit">
          <Plus size={15} />
          {t("create")}
        </Button>
      </fieldset>
    </form>
  );
}
