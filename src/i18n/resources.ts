import type { Language } from "./languages";
import en from "./locales/en.json";
import es from "./locales/es-419.json";
import pt from "./locales/pt-BR.json";

// Bundled rather than fetched: they're small, the first screen doesn't wait on a request, and
// i18next's default fetch path is absolute, which misses the app under GitHub Pages' /budgeting/.
export const resources = {
  en: { translation: en },
  "es-419": { translation: es },
  "pt-BR": { translation: pt },
} satisfies Record<Language, unknown>;
