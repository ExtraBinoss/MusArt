import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Laptop, Sun, Moon, Keyboard } from "lucide-react";
import { applyTheme, themeAtom, type Theme } from "../../../state/session/editor";
import { changeLanguage } from "../../../state/i18n";
import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import { Label } from "../../ui/label";
import { SelectField } from "../../shared/SelectField";
import "../dashboard/messages";
export function Preferences({ onShortcuts }: { onShortcuts?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useAtom(themeAtom);
  const modes = [
    ["system", Laptop],
    ["light", Sun],
    ["dark", Moon],
  ] as const;
  return (
    <div className="preferences">
      <Label>{t("theme")}</Label>
      <ButtonGroup className="theme-options" aria-label={t("theme")}>
        {modes.map(([mode, Icon]) => (
          <Button
            key={mode}
            variant="outline"
            aria-pressed={mode === theme}
            onClick={() => {
              setTheme(mode as Theme);
              applyTheme(mode);
            }}
          >
            <Icon size={16} />
            {t(mode)}
          </Button>
        ))}
      </ButtonGroup>
      <Label htmlFor="language">{t("language")}</Label>
      <SelectField
        id="language"
        label={t("language")}
        value={i18n.language}
        options={[
          { value: "fr", label: t("french") },
          { value: "en", label: t("english") },
        ]}
        onValueChange={(language) => {
          void changeLanguage(language as "fr" | "en");
        }}
      />
      <div className="shortcut-reference">
        <Button
          variant="outline"
          className="preferences-shortcuts"
          disabled={!onShortcuts}
          onClick={onShortcuts}
        >
          <Keyboard size={16} />
          <span>{t("dashboard:editShortcuts")}</span>
        </Button>
      </div>
    </div>
  );
}
