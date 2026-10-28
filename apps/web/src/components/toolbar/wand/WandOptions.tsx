import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { CircleHelp } from "lucide-react";
import { toleranceAtom, selectionContiguousAtom } from "../../../state/session/editor";
import { NumberInput } from "../../shared/NumberInput";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Switch } from "../../ui/switch";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { modifierLabel } from "../../search/shortcuts";
import "../../../services/selection/wand/messages";
import "./wand.css";

export function WandOptions() {
  const { t } = useTranslation(),
    [tolerance, setTolerance] = useAtom(toleranceAtom),
    [contiguous, setContiguous] = useAtom(selectionContiguousAtom);
  return (
    <>
      <div className="wand-options-heading">
        <strong>{t("wand")}</strong>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={t("pixelSelection:helpTitle")}>
              <CircleHelp size={15} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="floating-panel wand-help"
            side="right"
            align="start"
            aria-label={t("pixelSelection:helpTitle")}
          >
            <h3>{t("pixelSelection:helpTitle")}</h3>
            <p>{t("pixelSelection:helpChoose")}</p>
            <p>{t("pixelSelection:hint")}</p>
            <dl>
              <div>
                <dt>
                  <KbdGroup>
                    <Kbd>{modifierLabel()}</Kbd>
                    <Kbd>D</Kbd>
                  </KbdGroup>
                </dt>
                <dd>{t("pixelSelection:deselect")}</dd>
              </div>
              <div>
                <dt>
                  <Kbd>{t("pixelSelection:eraseKey")}</Kbd>
                </dt>
                <dd>{t("pixelSelection:eraseHint")}</dd>
              </div>
            </dl>
            <p>{t("pixelSelection:helpOutline")}</p>
            <label className="switch-row">
              <span>{t("pixelSelection:adjacent")}</span>
              <Switch
                checked={contiguous}
                onCheckedChange={setContiguous}
                aria-label={t("pixelSelection:adjacent")}
              />
            </label>
            <p>{t("pixelSelection:adjacentHint")}</p>
          </PopoverContent>
        </Popover>
      </div>
      <NumberInput
        label={t("tolerance")}
        min={0}
        max={255}
        value={tolerance}
        resetValue={32}
        onCommit={setTolerance}
      />
    </>
  );
}
