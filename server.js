import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./server/handlers.js";
import { listLibraryItems } from "./server/library.js";
import { MAX_MEMBERS, RECONNECT_GRACE_MS, rooms } from "./server/rooms.js";
import { serverLatencyMetrics, serverTelemetry } from "./server/telemetry.js";
import { canPublishScreen, liveKitService } from "./server/livekit.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3001;
const mediaDirectory = process.env.MEDIA_DIR || fileURLToPath(new URL("./media/", import.meta.url));
const distDirectory = fileURLToPath(new URL("./dist/", import.meta.url));
const builtClient = fileURLToPath(new URL("./dist/index.html", import.meta.url));

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

app.get("/api/livekit/status", (_req, res) => {
  res.json({ enabled: liveKitService.enabled });
});

app.post("/api/livekit/token", express.json({ limit: "2kb" }), async (req, res) => {
  if (!liveKitService.enabled) {
    res.status(503).json({ error: "Screen sharing is not configured on this server." });
    return;
  }
  const ticket = req.body?.ticket;
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    res.status(400).json({ error: "A valid room-issued screen-share ticket is required." });
    return;
  }
  const credentials = await liveKitService.createToken(ticket, ({ roomId, memberId }) => {
    const room = rooms.get(roomId);
    const member = room?.members.get(memberId);
    if (!member?.online) return null;
    return {
      name: member.name,
      canPublish: canPublishScreen(room, memberId),
    };
  });
  if (!credentials) {
    res.status(403).json({ error: "The room ticket is invalid, expired, or already used." });
    return;
  }
  res.json(credentials);
});

if (existsSync(builtClient)) {
  app.use(express.static(distDirectory));
  app.use((req, res, next) => {
    if (req.method !== "GET" || extname(req.path) || req.path.startsWith("/api/") || req.path.startsWith("/media/") || req.path.startsWith("/metrics/")) {
      next();
      return;
    }

    res.sendFile(builtClient, error => {
      if (error && !res.headersSent) next(error);
    });
  });
}

registerSocketHandlers(io);

httpServer.listen(PORT, () => console.log(`Watch party server listening on http://localhost:${PORT}`));
