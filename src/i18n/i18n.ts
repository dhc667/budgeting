import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { deviceLanguage } from "./languages";
import { resources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: (typeof resources)["en"];
  }
}

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

void i18n.use(initReactI18next).init({
  lng: deviceLanguage(),
  fallbackLng: "en",
  resources,
  interpolation: { escapeValue: false },
});
