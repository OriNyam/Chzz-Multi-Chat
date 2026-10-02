import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "**/*.spec.js", workers: 1,
  outputDir: ".wrangler/test-results",
  use: { baseURL: "http://127.0.0.1:8788", channel: "msedge", headless: true, viewport: { width: 1280, height: 900 } },
  webServer: { command: "npm run dev -- --ip 127.0.0.1 --port 8788", url: "http://127.0.0.1:8788", reuseExistingServer: true }
});
