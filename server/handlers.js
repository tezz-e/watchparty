import {
  clearDisconnectTimer,
  disconnectTimers,
  electHost,
  makeRoom,
  memberList,
  MAX_MEMBERS,
  now,
  onlineMembers,
  RECONNECT_GRACE_MS,
  roomSnapshot,
  rooms,
} from "./rooms.js";
import { cleanText, validMediaUrl, validMemberId, validRoomId } from "./validation.js";
import { publishPlayback } from "./telemetry.js";

const moodByEmoji = { "✨": "uplifting", "♥": "cozy", "⚡": "energetic", "👏": "thrilling", "😂": "playful" };

export function registerSocketHandlers(io) {
  const publishPresence = room => io.to(room.id).emit("room:presence", memberList(room));
  const publishState = room => io.to(room.id).emit("room:state", roomSnapshot(room));
  const roomFor = socket => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !socket.data.memberId) return null;
    return room;
  };
  const isHost = (room, socket) => room.hostId === socket.data.memberId;
  const reject = (socket, code, message) => socket.emit("room:error", { code, message });

  io.on("connection", socket => {
    const joinRoom = (room, name, memberId) => {
      const roomId = room.id;
      const existing = room.members.get(memberId);
      if (!existing && room.members.size >= MAX_MEMBERS) return reject(socket, "room-full", "This room is at its 20-person capacity.");

      if (existing?.socketId && existing.socketId !== socket.id) {
        const prior = io.sockets.sockets.get(existing.socketId);
        prior?.disconnect(true);
      }
      const member = existing || { id: memberId, joinedAt: now() };
      member.name = cleanText(name, "Guest", 32);
      member.online = true;
      member.socketId = socket.id;
      room.members.set(memberId, member);
      clearDisconnectTimer(roomId, memberId);
      if (!room.hostId || !room.members.get(room.hostId)?.online) electHost(room);

      socket.data.roomId = roomId;
      socket.data.memberId = memberId;
      socket.join(roomId);
      socket.emit("room:joined", { selfId: memberId, state: roomSnapshot(room), messages: room.messages });
      publishPresence(room);
      publishState(room);
    };

    socket.on("room:create", ({ roomId, name, memberId, title, source, control } = {}) => {
      if (!validRoomId(roomId) || !validMemberId(memberId)) return reject(socket, "invalid-create", "That room setup is invalid.");
      const existingRoom = rooms.get(roomId);
      if (existingRoom) {
        if (existingRoom.hostId === memberId) return joinRoom(existingRoom, name, memberId);
        return reject(socket, "room-exists", "That room already exists. Choose a new room code.");
      }
      if (!validMediaUrl(source)) return reject(socket, "invalid-source", "Use a direct .mp4 or .webm video URL.");
      const room = makeRoom(roomId);
      room.config = {
        title: cleanText(title, "Untitled watch party", 80),
        source: cleanText(source, "", 1000),
        control: control === "shared" ? "shared" : "host",
      };
      rooms.set(roomId, room);
      joinRoom(room, name, memberId);
    });

    socket.on("room:join", ({ roomId, name, memberId } = {}) => {
      if (!validRoomId(roomId) || !validMemberId(memberId)) return reject(socket, "invalid-join", "That room link is invalid.");
      const room = rooms.get(roomId);
      if (!room) return reject(socket, "room-not-found", "That room does not exist or has expired.");
      joinRoom(room, name, memberId);
    });

    socket.on("room:configure", ({ title, source, control } = {}) => {
      const room = roomFor(socket);
      if (!room || !isHost(room, socket)) return reject(socket, "host-only", "Only the host can change room settings.");
      if (!validMediaUrl(source)) return reject(socket, "invalid-source", "Use a direct .mp4 or .webm video URL.");
      room.config = {
        title: cleanText(title, room.config.title, 80),
        source: cleanText(source, "", 1000),
        control: control === "shared" ? "shared" : "host",
      };
      room.position = 0;
      room.playing = false;
      room.updatedAt = now();
      room.version += 1;
      io.to(room.id).emit("room:config", room.config);
      publishState(room);
    });

    socket.on("playback:update", ({ playing, position, version, sentAt } = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      if (room.config.control !== "shared" && !isHost(room, socket)) return reject(socket, "host-controls", "The host has the remote.");
      if (!Number.isFinite(position) || position < 0 || position > 86_400) return reject(socket, "invalid-position", "That playback position is invalid.");
      if (Number.isFinite(version) && version < room.version) {
        socket.emit("room:state", roomSnapshot(room));
        return;
      }
      room.playing = Boolean(playing);
      room.position = position;
      room.updatedAt = now();
      room.telemetry.commands += 1;
      room.version = Math.max(room.version + 1, Number.isFinite(version) ? version + 1 : room.version + 1);
      publishPlayback(io, room, { ...roomSnapshot(room), commandSentAt: Number.isFinite(sentAt) ? sentAt : null });
    });

    socket.on("sync:drift", ({ drift } = {}) => {
      const room = roomFor(socket);
      if (!room || !Number.isFinite(drift) || Math.abs(drift) > 86_400) return;
      const absoluteDrift = Math.abs(drift);
      room.telemetry.driftSamples += 1;
      room.telemetry.driftTotal += absoluteDrift;
      room.telemetry.maxDrift = Math.max(room.telemetry.maxDrift, absoluteDrift);
      socket.emit("room:telemetry", roomSnapshot(room).telemetry);
    });

    socket.on("playlist:add", (item = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      const source = cleanText(item.source, "", 1000);
      if (!validMediaUrl(source)) return reject(socket, "invalid-source", "This pick needs a direct .mp4 or .webm URL.");
      if (room.playlist.length >= 50) return reject(socket, "queue-full", "The shared queue is full.");
      const entry = {
        id: `${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title: cleanText(item.title, "Untitled selection", 80),
        source,
        category: cleanText(item.category, "Other", 28),
        duration: cleanText(item.duration, "", 20),
        addedBy: socket.data.memberId,
      };
      room.playlist.push(entry);
      io.to(room.id).emit("playlist:state", room.playlist);
    });

    socket.on("playlist:remove", ({ id } = {}) => {
      const room = roomFor(socket);
      if (!room || !isHost(room, socket)) return reject(socket, "host-only", "Only the host can edit the queue.");
      room.playlist = room.playlist.filter(item => item.id !== id);
      io.to(room.id).emit("playlist:state", room.playlist);
    });

    socket.on("playlist:play", ({ id } = {}) => {
      const room = roomFor(socket);
      if (!room || !isHost(room, socket)) return reject(socket, "host-only", "Only the host can start a queue item.");
      const item = room.playlist.find(entry => entry.id === id);
      if (!item) return reject(socket, "missing-item", "That queue item is no longer available.");
      room.config = { ...room.config, title: item.title, source: item.source };
      room.position = 0;
      room.playing = false;
      room.updatedAt = now();
      room.version += 1;
      io.to(room.id).emit("room:config", room.config);
      publishState(room);
    });

    socket.on("host:transfer", ({ memberId } = {}) => {
      const room = roomFor(socket);
      const target = room?.members.get(memberId);
      if (!room || !isHost(room, socket) || !target?.online) return reject(socket, "transfer-failed", "Choose an online participant to host.");
      room.hostId = target.id;
      room.version += 1;
      publishPresence(room);
      publishState(room);
    });

    socket.on("chat:send", ({ text } = {}) => {
      const room = roomFor(socket);
      const member = room?.members.get(socket.data.memberId);
      const message = cleanText(text, "", 480);
      if (!room || !member || !message) return;
      const payload = { id: `${now()}-${socket.id}`, name: member.name, text: message, createdAt: now() };
      room.messages.push(payload);
      room.messages = room.messages.slice(-120);
      io.to(room.id).emit("chat:message", payload);
    });

    socket.on("reaction:send", ({ emoji } = {}) => {
      const room = roomFor(socket);
      if (!room || !moodByEmoji[emoji]) return;
      room.moods[socket.data.memberId] = moodByEmoji[emoji];
      io.to(room.id).emit("reaction", { emoji, memberId: socket.data.memberId, createdAt: now() });
      io.to(room.id).emit("mood:update", roomSnapshot(room).mood);
    });

    socket.on("poll:vote", ({ option } = {}) => {
      const room = roomFor(socket);
      if (!room || !room.poll.options.includes(option)) return;
      room.poll.votes[socket.data.memberId] = option;
      io.to(room.id).emit("poll:update", room.poll);
    });

    socket.on("latency:ping", ({ clientSentAt } = {}, acknowledge) => {
      const payload = { clientSentAt, serverReceivedAt: now(), serverSentAt: now() };
      if (typeof acknowledge === "function") acknowledge(payload);
      else socket.emit("latency:pong", payload);
    });

    socket.on("disconnect", () => {
      const room = roomFor(socket);
      if (!room) return;
      const member = room.members.get(socket.data.memberId);
      if (!member || member.socketId !== socket.id) return;
      member.online = false;
      member.socketId = null;
      publishPresence(room);
      const key = `${room.id}:${member.id}`;
      clearDisconnectTimer(room.id, member.id);
      disconnectTimers.set(key, setTimeout(() => {
        const liveRoom = rooms.get(room.id);
        const liveMember = liveRoom?.members.get(member.id);
        if (!liveRoom || !liveMember || liveMember.online) return;
        liveRoom.members.delete(member.id);
        delete liveRoom.moods[member.id];
        if (liveRoom.hostId === member.id) electHost(liveRoom);
        if (liveRoom.members.size === 0) {
          rooms.delete(liveRoom.id);
        } else {
          publishPresence(liveRoom);
          publishState(liveRoom);
        }
        disconnectTimers.delete(key);
      }, RECONNECT_GRACE_MS));
    });
  });
}
