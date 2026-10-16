import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const rooms = new Map();

const now = () => Date.now();
const roomSnapshot = (room) => ({
  version: room.version,
  playing: room.playing,
  position: room.playing ? room.position + (now() - room.updatedAt) / 1000 : room.position,
  updatedAt: now(),
  hostId: room.hostId,
  poll: room.poll,
  config: room.config,
});

function makeRoom(id) {
  return {
    id, version: 0, playing: false, position: 0, updatedAt: now(), hostId: null, members: new Map(), messages: [],
    config: { title: "Untitled watch party", source: "", control: "host" },
    poll: { question: "What should we watch next?", options: ["Moonlit Drive", "Stay for the credits"], votes: {}, voters: {} },
  };
}

function publishPresence(room) {
  const members = [...room.members.values()].map((member) => ({ ...member, host: member.id === room.hostId }));
  io.to(room.id).emit("room:presence", members);
}

function electHost(room) {
  const nextHost = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
  room.hostId = nextHost?.id ?? null;
  room.version += 1;
  room.updatedAt = now();
}

function getRoomFor(socket) {
  return socket.data.roomId ? rooms.get(socket.data.roomId) : null;
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, name }) => {
    if (typeof roomId !== "string" || !/^[a-z0-9-]{3,40}$/i.test(roomId)) return socket.emit("room:error", "That room code is invalid.");
    const room = rooms.get(roomId) ?? makeRoom(roomId);
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    const member = { id: socket.id, name: String(name || "Guest").slice(0, 28), joinedAt: now() };
    room.members.set(socket.id, member);
    if (!room.hostId) electHost(room);
    socket.emit("room:joined", { selfId: socket.id, state: roomSnapshot(room), messages: room.messages });
    publishPresence(room);
  });

  socket.on("room:configure", ({ title, source, control }) => {
    const room = getRoomFor(socket);
    if (!room || room.hostId !== socket.id) return;
    const safeTitle = typeof title === "string" ? title.trim().slice(0, 56) : "";
    const safeSource = typeof source === "string" && /^https?:\/\//i.test(source) ? source.slice(0, 2048) : "";
    room.config = { title: safeTitle || room.config.title, source: safeSource, control: control === "shared" ? "shared" : "host" };
    room.version += 1;
    io.to(room.id).emit("room:config", room.config);
    io.to(room.id).emit("playback:state", roomSnapshot(room));
  });

  socket.on("playback:update", ({ playing, position, version }) => {
    const room = getRoomFor(socket);
    const canControl = room?.config.control === "shared" || room?.hostId === socket.id;
    if (!room || !canControl || typeof position !== "number" || (version !== undefined && version < room.version)) return;
    room.playing = Boolean(playing);
    room.position = Math.max(0, Math.min(position, 744));
    room.updatedAt = now();
    room.version += 1;
    io.to(room.id).emit("playback:state", roomSnapshot(room));
  });

  socket.on("chat:send", ({ text }) => {
    const room = getRoomFor(socket);
    const member = room?.members.get(socket.id);
    const clean = typeof text === "string" ? text.trim().slice(0, 400) : "";
    if (!room || !member || !clean) return;
    const message = { id: `${socket.id}-${now()}`, name: member.name, text: clean, time: now(), senderId: socket.id };
    room.messages = [...room.messages.slice(-99), message];
    io.to(room.id).emit("chat:message", message);
  });

  socket.on("reaction:send", ({ emoji }) => {
    const room = getRoomFor(socket);
    if (!room || typeof emoji !== "string" || emoji.length > 4) return;
    io.to(room.id).emit("reaction:burst", { emoji, senderId: socket.id });
  });

  socket.on("poll:vote", ({ option }) => {
    const room = getRoomFor(socket);
    if (!room || !Number.isInteger(option) || !room.poll.options[option]) return;
    const previous = room.poll.voters[socket.id];
    if (previous !== undefined) room.poll.votes[previous] = Math.max(0, (room.poll.votes[previous] || 1) - 1);
    room.poll.voters[socket.id] = option;
    room.poll.votes[option] = (room.poll.votes[option] || 0) + 1;
    io.to(room.id).emit("poll:state", room.poll);
  });

  socket.on("disconnect", () => {
    const room = getRoomFor(socket);
    if (!room) return;
    room.members.delete(socket.id);
    if (room.hostId === socket.id) electHost(room);
    if (room.members.size === 0) return rooms.delete(room.id);
    publishPresence(room);
    io.to(room.id).emit("playback:state", roomSnapshot(room));
  });
});

app.get("/health", (_request, response) => response.json({ ok: true, rooms: rooms.size }));
httpServer.listen(process.env.PORT || 3001, () => console.log("Afterglow realtime server listening on :3001"));
