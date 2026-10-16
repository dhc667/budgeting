/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { migrationCount } from "./db/migration-count.ts";

export default defineConfig({
  // CI sets this to the repository's GitHub Pages path, e.g. /budgeting/.
  base: process.env.BASE_PATH ?? "/",
  define: {
    __SCHEMA_VERSION__: JSON.stringify(migrationCount()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      pwaAssets: { image: "public/favicon.svg", overrideManifestIcons: true },
      manifest: {
        name: "Budgeting",
        short_name: "Budgeting",
        description: "Family budgeting across accounts, spaces and currencies",
        theme_color: "#059669",
        background_color: "#fafafa",
        display: "standalone",
      },
    }),
  ],
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["{src,db,cli}/**/*.test.{ts,tsx}"] } },
      // Needs local Supabase (pnpm db:start). Serial, because one test briefly rolls the schema version back.
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/support/setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
