import { locale as getSystemLocale } from "@tauri-apps/plugin-os";

export type AppLocale = "en-US" | "zh-CN";
export type LanguagePreference = "system" | AppLocale;

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  return value?.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export async function resolveAppLocale(preference: LanguagePreference): Promise<AppLocale> {
  if (preference !== "system") return preference;
  try {
    return normalizeAppLocale(await getSystemLocale());
  } catch {
    return normalizeAppLocale(navigator.languages[0] ?? navigator.language);
  }
}
