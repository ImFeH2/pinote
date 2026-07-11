import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import i18n from "@/i18n";
import { resolveAppLocale } from "@/i18n/locale";
import { logError } from "@/lib/logger";

let nativeLocaleSync = Promise.resolve();

function syncNativeLocale(preference: string) {
  nativeLocaleSync = nativeLocaleSync
    .catch(() => {})
    .then(() => invoke("sync_native_locale", { preference }));
  return nativeLocaleSync;
}

export function LocaleSync() {
  const { settings } = useSettings();

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const locale = await resolveAppLocale(settings.language);
      if (cancelled) return;
      await i18n.changeLanguage(locale);
      if (cancelled) return;
      document.documentElement.lang = locale;
      if (getCurrentWindow().label === "settings") {
        await syncNativeLocale(settings.language);
      }
    };
    sync().catch((error) => logError("i18n", "sync_failed", error));
    return () => {
      cancelled = true;
    };
  }, [settings.language]);

  return null;
}
