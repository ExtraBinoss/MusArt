import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
import shadow from "./library/shadow/messages.json";
import morph from "./library/morph/messages.json";
import ripple from "./library/ripple/messages.json";
import shatter from "./library/shatter/messages.json";
import noise from "./library/noise/messages.json";

import flashlight from "./library/flashlight/messages.json";
import circle from "./library/circle/messages.json";
import cyanotype from "./library/cyanotype/messages.json";
import crt from "./library/crt/messages.json";
import datamosh from "./library/datamosh/messages.json";
import bitDither from "./library/bit-dither/messages.json";
import receipt from "./library/receipt/messages.json";
import pinkPhosphor from "./library/pink-phosphor/messages.json";
/** UI resources stay on the web side; the core catalog only contains stable label keys. */
export const libraryMessages = {
  morph,
  shadow,
  ripple,
  shatter,
  noise,
  flashlight,
  circle,
  cyanotype,
  crt,
  datamosh,
  "bit-dither": bitDither,
  receipt,
  "pink-phosphor": pinkPhosphor,
};
for (const [type, messages] of Object.entries(libraryMessages)) {
  registerFeatureTranslations(`${type}Fx`, messages);
}
registerFeatureTranslations("translation", {
  en: Object.fromEntries(
    Object.entries(libraryMessages).map(([type, messages]) => [type, messages.en.name]),
  ),
  fr: Object.fromEntries(
    Object.entries(libraryMessages).map(([type, messages]) => [type, messages.fr.name]),
  ),
});
