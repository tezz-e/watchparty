import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

export default defineConfig(({ mode }) => {
  const { VITE_BACKEND_URL } = loadEnv(mode, process.cwd(), "VITE_");
  const { AFTERGLOW_HTTPS_CERT, AFTERGLOW_HTTPS_KEY } = loadEnv(mode, process.cwd(), "AFTERGLOW_HTTPS_");
  const backend = VITE_BACKEND_URL || "http://localhost:3001";
  const httpsRequired = process.env.npm_lifecycle_event === "dev:https";
  if (httpsRequired && !AFTERGLOW_HTTPS_CERT) {
    throw new Error("HTTPS development needs AFTERGLOW_HTTPS_CERT and AFTERGLOW_HTTPS_KEY in .env.");
  }
  if (Boolean(AFTERGLOW_HTTPS_CERT) !== Boolean(AFTERGLOW_HTTPS_KEY)) {
    throw new Error("Set both AFTERGLOW_HTTPS_CERT and AFTERGLOW_HTTPS_KEY to enable HTTPS development.");
  }
  return {
    plugins: [react()],
    server: {
      host: AFTERGLOW_HTTPS_CERT ? "0.0.0.0" : undefined,
      https: AFTERGLOW_HTTPS_CERT
        ? {
            cert: readFileSync(AFTERGLOW_HTTPS_CERT),
            key: readFileSync(AFTERGLOW_HTTPS_KEY),
          }
        : undefined,
      proxy: {
        "/api": backend,
        "/health": backend,
        "/media": backend,
        "/metrics": backend,
        "/socket.io": { target: backend, ws: true },
      },
    },
  };
});
