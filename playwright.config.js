import { defineConfig } from "@playwright/test";

const backendPort = 43761;
const frontendPort = 43762;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    browserName: "chromium",
    headless: true,
  },
  webServer: [
    {
      command: "node server.js",
      url: `http://127.0.0.1:${backendPort}/health`,
      env: {
        PORT: String(backendPort),
        LIVEKIT_URL: "",
        LIVEKIT_API_KEY: "",
        LIVEKIT_API_SECRET: "",
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm.cmd run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: `http://127.0.0.1:${frontendPort}`,
      env: {
        VITE_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
