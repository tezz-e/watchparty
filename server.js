import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./server/handlers.js";
import { listLibraryItems } from "./server/library.js";
import { MAX_MEMBERS, RECONNECT_GRACE_MS, rooms } from "./server/rooms.js";
import { serverLatencyMetrics, serverTelemetry } from "./server/telemetry.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3001;
const mediaDirectory = process.env.MEDIA_DIR || fileURLToPath(new URL("./media/", import.meta.url));

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.vary("Origin");
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    capacity: MAX_MEMBERS,
    reconnectGraceMs: RECONNECT_GRACE_MS,
    telemetry: serverTelemetry(rooms),
  });
});

app.get("/api/library", async (_req, res) => {
  res.json(await listLibraryItems(mediaDirectory));
});

app.get("/media/:filename", (req, res, next) => {
  const { filename } = req.params;
  if (filename !== filename.split(/[\\/]/).pop() || !/\.(mp4|webm)$/i.test(filename)) {
    res.sendStatus(404);
    return;
  }

  res.sendFile(filename, {
    root: mediaDirectory,
    dotfiles: "deny",
    acceptRanges: true,
  }, error => {
    if (error && !res.headersSent) next(error);
  });
});

app.get("/metrics/latency", (_req, res) => {
  res.json(serverLatencyMetrics());
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => console.log(`Watch party server listening on http://localhost:${PORT}`));
