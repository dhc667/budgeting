import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import { migrationCount } from "./db/migration-count.ts";

const sharedState = [
  "tests/app/database-behind-flow.test.tsx",
  "tests/app/rates-sync-flow.test.tsx",
  "tests/cli/backup.test.ts",
  "tests/cli/instance.test.ts",
  "tests/cli/rates.test.ts",
  "tests/db/exchange-rates.test.ts",
  "tests/db/sync.test.ts",
  "tests/sync/pull.test.ts",
];

const integration = {
  include: ["tests/**/*.test.{ts,tsx}"],
  testTimeout: 20_000,
  globalSetup: ["tests/support/empty-local-instance.ts"],
  setupFiles: ["fake-indexeddb/auto", "tests/support/jsdom-gaps.ts", "tests/support/no-network.ts"],
};

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
      // Need local Supabase (pnpm db:start). A test file that touches a table shared by every user
      // (rates, currencies, the migration record, whole-database dumps) goes in sharedState, which
      // runs serially after everything else; all other files run in parallel. More workers than
      // the local database can serve make screens time out.
      {
        extends: true,
        test: {
          ...integration,
          name: "integration",
          maxWorkers: Number(process.env.INTEGRATION_WORKERS ?? 6),
          exclude: [...configDefaults.exclude, ...sharedState],
        },
      },
      {
        extends: true,
        test: {
          ...integration,
          name: "integration-serial",
          include: sharedState,
          maxWorkers: 1,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
