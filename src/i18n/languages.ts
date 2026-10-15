import { Constants, type Enums } from "../supabase/database.types";

export type Language = Enums<"language">;

export const languages = Constants.public.Enums.language;

// Each language named in itself, so whoever needs it can find it whatever the app is showing.
export const languageNames: Record<Language, string> = {
  en: "English",
  "es-419": "Español",
  "pt-BR": "Português (Brasil)",
};

// Matched on the base language, so Spanish from Spain still gets Latin American Spanish rather
// than English.
export function deviceLanguage(preferred: readonly string[] = navigator.languages): Language {
  for (const tag of preferred) {
    const match = languages.find((language) => baseLanguage(language) === baseLanguage(tag));
    if (match) return match;
  }
  return "en";
}

function baseLanguage(tag: string): string {
  return new Intl.Locale(tag).language;
}
