import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const { VITE_BACKEND_URL } = loadEnv(mode, process.cwd(), "VITE_BACKEND_URL");
  const backend = VITE_BACKEND_URL || "http://localhost:3001";
  return {
    plugins: [react()],
    server: {
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
