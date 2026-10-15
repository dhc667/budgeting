import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { defineConfig } from "i18next-cli";

const localesFolder = "src/i18n/locales";

export default defineConfig({
  locales: readdirSync(localesFolder).map((file) => basename(file, ".json")),
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: `${localesFolder}/{{language}}.json`,
    defaultNS: false,
  },
});
