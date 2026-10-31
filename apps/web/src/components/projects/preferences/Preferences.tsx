import { useState, type ReactNode } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Laptop, Sun, Moon, Keyboard, SlidersHorizontal, Paintbrush, Magnet } from "lucide-react";
import { applyTheme, themeAtom } from "../../../state/session/editor";
import { changeLanguage } from "../../../state/i18n";
import { snappingAtom, DEFAULT_SNAPPING } from "../../../state/snapping/preferences";
import { clipboardAtom } from "../../../state/clipboard/preferences";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { Switch } from "../../ui/switch";
import { SelectField } from "../../shared/SelectField";
import { NumberInput } from "../../shared/NumberInput";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { ShortcutSettings } from "../../search/keybindings/ShortcutSettings";
import "./messages";
import "./preferences.css";

export type PreferencesSection = "general" | "appearance" | "shortcuts" | "editor";
const sections = [
  ["general", SlidersHorizontal],
  ["appearance", Paintbrush],
  ["shortcuts", Keyboard],
  ["editor", Magnet],
] as const;
function Panel({ section, children }: { section: PreferencesSection; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <TabsContent value={section} className="preferences-page">
      <ScrollShadow className="preferences-page-scroll" fade="mask">
        <div className="preferences-page-viewport">
          <div className="preferences-page-body">
            <header>
              <h3>{t(`preferences:${section}`)}</h3>
              <p>{t(`preferences:${section}Description`)}</p>
            </header>
            {children}
          </div>
        </div>
      </ScrollShadow>
    </TabsContent>
  );
}
export function Preferences({
  initialSection = "general",
  editorPreview,
}: {
  initialSection?: PreferencesSection;
  editorPreview?: ReactNode;
} = {}) {
  const { t, i18n } = useTranslation();
  const [switched, setSwitched] = useState(false);
  const [theme, setTheme] = useAtom(themeAtom),
    [snapping, setSnapping] = useAtom(snappingAtom),
    [clipboard, setClipboard] = useAtom(clipboardAtom);
  const modes = [
    ["system", Laptop],
    ["light", Sun],
    ["dark", Moon],
  ] as const;
  return (
    <Tabs
      defaultValue={initialSection}
      onValueChange={() => setSwitched(true)}
      data-has-switched={switched}
      orientation="vertical"
      className="preferences preferences-workspace"
    >
      <TabsList aria-label={t("preferences:categories")} className="preferences-navigation">
        {sections.map(([section, Icon]) => (
          <TabsTrigger key={section} value={section} className="preferences-category">
            <span className={`preferences-category-icon category-${section}`}>
              <Icon size={14} className="size-3.5" />
            </span>
            <span>{t(`preferences:${section}`)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="preferences-content">
        <Panel section="general">
          <div className="preferences-card">
            <label className="preferences-setting-row">
              <span>
                <strong>{t("preferences:clipboardImages")}</strong>
                <small className="preferences-setting-description">
                  {t("preferences:clipboardImagesDescription")}
                </small>
              </span>
              <Switch
                aria-label={t("preferences:clipboardImages")}
                checked={clipboard.includeImages}
                onCheckedChange={setClipboard}
              />
            </label>
            <div className="preferences-setting-row">
              <div>
                <strong>{t("language")}</strong>
                <p>{t("preferences:languageDescription")}</p>
              </div>
              <SelectField
                id="preferences-language"
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
            </div>
          </div>
        </Panel>
        <Panel section="appearance">
          <div className="preferences-card">
            <div className="preferences-setting-label">
              <strong>{t("theme")}</strong>
              <p>{t("preferences:themeDescription")}</p>
            </div>
            <SegmentedTabs
              mode="choice"
              value={theme}
              size="compact"
              className="preferences-theme-options"
              label={t("theme")}
              items={modes.map(([value, Icon]) => ({
                value,
                label: t(value),
                icon: <Icon size={14} className="size-3.5" />,
              }))}
              onValueChange={(value) => {
                const selected = modes.find(([mode]) => mode === value)?.[0];
                if (selected) {
                  setTheme(selected);
                  applyTheme(selected);
                }
              }}
            />
          </div>
        </Panel>
        <Panel section="shortcuts">
          <ShortcutSettings />
        </Panel>
        <Panel section="editor">
          <div className="preferences-card">
            <label className="preferences-setting-row">
              <span>
                <strong>{t("preferences:snapEnabled")}</strong>
                <small className="preferences-setting-description">
                  {t("preferences:snapDescription")}
                </small>
              </span>
              <Switch
                aria-label={t("preferences:snapEnabled")}
                checked={snapping.enabled}
                onCheckedChange={(enabled) => setSnapping({ enabled })}
              />
            </label>
            <div className="preferences-setting-row">
              <div>
                <div className="preferences-setting-heading">
                  <strong>{t("preferences:snapDistance")}</strong>
                  {editorPreview}
                </div>
                <p>{t("preferences:snapDistanceDescription")}</p>
              </div>
              <NumberInput
                label={t("preferences:snapDistance")}
                scrubLabel={<Magnet size={14} />}
                value={snapping.threshold}
                min={1}
                max={24}
                resetValue={DEFAULT_SNAPPING.threshold}
                unit="px"
                disabled={!snapping.enabled}
                onCommit={(threshold) => setSnapping({ threshold })}
              />
            </div>
          </div>
        </Panel>
      </div>
    </Tabs>
  );
}
