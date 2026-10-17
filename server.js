import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./server/handlers.js";
import { MAX_MEMBERS, RECONNECT_GRACE_MS, rooms } from "./server/rooms.js";
import { serverTelemetry } from "./server/telemetry.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3001;

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    capacity: MAX_MEMBERS,
    reconnectGraceMs: RECONNECT_GRACE_MS,
    telemetry: serverTelemetry(rooms),
  });
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => console.log(`Watch party server listening on http://localhost:${PORT}`));
