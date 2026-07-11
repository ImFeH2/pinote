import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { AppLocale } from "@/i18n/locale";
import enUSContextMenu from "@/i18n/resources/en-US/contextMenu";
import enUSNote from "@/i18n/resources/en-US/note";
import enUSSettings from "@/i18n/resources/en-US/settings";
import zhCNContextMenu from "@/i18n/resources/zh-CN/contextMenu";
import zhCNNote from "@/i18n/resources/zh-CN/note";
import zhCNSettings from "@/i18n/resources/zh-CN/settings";

const resources = {
  "en-US": {
    contextMenu: enUSContextMenu,
    note: enUSNote,
    settings: enUSSettings,
  },
  "zh-CN": {
    contextMenu: zhCNContextMenu,
    note: zhCNNote,
    settings: zhCNSettings,
  },
} as const;

export async function initializeI18n(locale: AppLocale) {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(locale);
    return;
  }
  await i18n.use(initReactI18next).init({
    lng: locale,
    fallbackLng: "en-US",
    supportedLngs: ["en-US", "zh-CN"],
    load: "currentOnly",
    defaultNS: "settings",
    ns: ["contextMenu", "note", "settings"],
    resources,
    interpolation: { escapeValue: false },
  });
}

export default i18n;
