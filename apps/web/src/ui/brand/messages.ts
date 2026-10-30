import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
import { brand } from "./config";
export const messages = {
  en: {
    loading: `${brand.name} is loading`,
    preparing: `${brand.name} is preparing your creation`,
  },
  fr: { loading: `${brand.name} charge`, preparing: `${brand.name} prépare votre création` },
};
registerFeatureTranslations("brand", messages);
