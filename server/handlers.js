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
  currentPosition,
  roomSnapshot,
  rooms,
  settleExternalCountdown,
} from "./rooms.js";
import { cleanText, validMediaUrl, validMemberId, validRoomId } from "./validation.js";
import { publishPlayback } from "./telemetry.js";
import { mediaProvider } from "../shared/media.js";
import { canPublishScreen, liveKitService } from "./livekit.js";

const moodByEmoji = { "✨": "uplifting", "♥": "cozy", "⚡": "energetic", "👏": "thrilling", "😂": "playful" };
const isSyncOnly = source => mediaProvider(source) === "external";

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
      settleExternalCountdown(room);
      const existing = room.members.get(memberId);
      if (!existing && room.members.size >= MAX_MEMBERS) return reject(socket, "room-full", "This room is at its 20-person capacity.");

      if (existing?.socketId && existing.socketId !== socket.id) {
        const prior = io.sockets.sockets.get(existing.socketId);
        prior?.emit("room:error", { code: "session-replaced", message: "This room was opened in another tab." });
        prior?.disconnect(true);
      }
      const member = existing || { id: memberId, joinedAt: now() };
      member.name = cleanText(name, "Guest", 32);
      member.online = true;
      member.buffering = false;
      member.externalReady = Boolean(member.externalReady);
      member.rttMs ??= null;
      member.clockOffsetMs ??= null;
      member.drift ??= null;
      member.socketId = socket.id;
      room.members.set(memberId, member);
      if (room.externalCountdown && !room.externalStarted) {
        room.externalCountdown = null;
        room.playing = false;
        room.updatedAt = now();
      }
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
      if (!validMediaUrl(source)) return reject(socket, "invalid-source", "Use a direct .mp4, .webm, or .m3u8 URL, a valid YouTube link, or a recognized streaming-platform link.");
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
      if (!validMediaUrl(source)) return reject(socket, "invalid-source", "Use a direct .mp4, .webm, or .m3u8 URL, a valid YouTube link, or a recognized streaming-platform link.");
      room.config = {
        title: cleanText(title, room.config.title, 80),
        source: cleanText(source, "", 1000),
        control: control === "shared" ? "shared" : "host",
      };
      if (room.screenShare && !canPublishScreen(room, room.screenShare.sharerMemberId)) {
        room.screenShare = null;
        io.to(room.id).emit("webrtc:sharing-status", null);
      }
      room.position = 0;
      room.playing = false;
      room.externalStarted = false;
      room.externalCountdown = null;
      room.activePlaylistItemId = null;
      room.reactionHeatmap = [];
      room.reactionHighlights = null;
      for (const member of room.members.values()) member.externalReady = false;
      room.updatedAt = now();
      room.version += 1;
      io.to(room.id).emit("room:config", room.config);
      publishPresence(room);
      publishState(room);
    });

    socket.on("playback:update", ({ playing, position, version, sentAt, heartbeat } = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      settleExternalCountdown(room);
      const externalRoom = isSyncOnly(room.config.source);
      if ((externalRoom || room.config.control !== "shared") && !isHost(room, socket)) return reject(socket, "host-controls", "The host has the remote.");
      if (externalRoom && Boolean(playing) && !room.externalStarted) {
        return reject(socket, "external-countdown-required", "Use the ready check to start a sync-only room.");
      }
      if (!Number.isFinite(position) || position < 0 || position > 86_400) return reject(socket, "invalid-position", "That playback position is invalid.");
      if (heartbeat) {
        if (!room.playing) return;
        if (Number.isFinite(version) && version < room.version) {
          const lastStaleSnapshot = socket.data.lastStaleSnapshotAt || 0;
          if (now() - lastStaleSnapshot >= 5_000) {
            socket.data.lastStaleSnapshotAt = now();
            socket.emit("room:state", roomSnapshot(room));
          }
          return;
        }
      }
      room.playing = Boolean(playing);
      room.position = position;
      room.updatedAt = now();
      if (!playing && room.externalCountdown && !room.externalStarted) room.externalCountdown = null;
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
      const member = room.members.get(socket.data.memberId);
      if (member) member.drift = drift;
      socket.emit("room:telemetry", roomSnapshot(room).telemetry);
      publishPresence(room);
    });

    socket.on("sync:health", ({ rttMs, clockOffsetMs } = {}) => {
      const room = roomFor(socket);
      const member = room?.members.get(socket.data.memberId);
      if (!room || !member || !Number.isFinite(rttMs) || rttMs < 0 || rttMs > 60_000
        || !Number.isFinite(clockOffsetMs) || Math.abs(clockOffsetMs) > 86_400_000) return;
      member.rttMs = rttMs;
      member.clockOffsetMs = clockOffsetMs;
      publishPresence(room);
    });

    socket.on("media:buffering", ({ buffering } = {}) => {
      const room = roomFor(socket);
      const member = room?.members.get(socket.data.memberId);
      if (!room || !member || typeof buffering !== "boolean") return;
      if (member.buffering === buffering) return;
      member.buffering = buffering;
      publishPresence(room);
    });

    socket.on("external:ready", ({ ready } = {}) => {
      const room = roomFor(socket);
      if (room) settleExternalCountdown(room);
      const member = room?.members.get(socket.data.memberId);
      if (!room || !member || !isSyncOnly(room.config.source) || typeof ready !== "boolean") {
        return reject(socket, "external-ready-unavailable", "The ready check is only available in sync-only rooms.");
      }
      member.externalReady = ready;
      if (!ready && room.externalCountdown && !room.externalStarted) {
        room.externalCountdown = null;
        room.playing = false;
        room.updatedAt = now();
      }
      publishPresence(room);
      publishState(room);
    });

    socket.on("external:countdown", () => {
      const room = roomFor(socket);
      if (!room || !isSyncOnly(room.config.source)) {
        return reject(socket, "external-countdown-unavailable", "The countdown is only available in sync-only rooms.");
      }
      settleExternalCountdown(room);
      if (!isHost(room, socket)) return reject(socket, "host-only", "Only the host can start the room countdown.");
      if (room.externalStarted) return reject(socket, "external-already-started", "The shared clock is already running; pause or resume it with the room controls.");
      const participants = onlineMembers(room);
      if (!participants.length || participants.some(member => !member.externalReady)) {
        return reject(socket, "external-not-ready", "Everyone online must mark themselves ready before the countdown.");
      }
      const startsAt = now() + 3000;
      room.externalStarted = false;
      room.externalCountdown = { startsAt };
      room.playing = true;
      room.position = 0;
      room.updatedAt = startsAt;
      room.version += 1;
      publishState(room);
      setTimeout(() => {
        if (rooms.get(room.id) !== room || room.externalCountdown?.startsAt !== startsAt) return;
        room.externalStarted = true;
        publishState(room);
      }, 3000);
    });

    socket.on("external:countdown-cancel", () => {
      const room = roomFor(socket);
      if (room) settleExternalCountdown(room);
      if (!room || !isSyncOnly(room.config.source)) return;
      if (!isHost(room, socket)) return reject(socket, "host-only", "Only the host can cancel the room countdown.");
      if (!room.externalCountdown || room.externalCountdown.startsAt <= now()) return;
      room.externalCountdown = null;
      room.externalStarted = false;
      room.playing = false;
      room.position = 0;
      room.updatedAt = now();
      room.version += 1;
      publishState(room);
    });

    socket.on("media:failure", ({ code } = {}) => {
      const room = roomFor(socket);
      const member = room?.members.get(socket.data.memberId);
      const validCodes = new Set([2, 5, 100, 101, 150, 153, "api-unavailable", "hls-cors", "hls-media", "hls-network", "hls-unsupported", "media-load", "mixed-content"]);
      if (!room || !member || !validCodes.has(code)) return;
      io.to(room.id).emit("media:failure", {
        memberId: member.id,
        name: member.name,
        code,
      });
    });

    socket.on("playlist:add", (item = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      const source = cleanText(item.source, "", 1000);
      if (!validMediaUrl(source)) return reject(socket, "invalid-source", "This pick needs a supported video, HLS, YouTube, or recognized streaming-platform URL.");
      if (room.playlist.length >= 50) return reject(socket, "queue-full", "The shared queue is full.");
      const entry = {
        id: `${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title: cleanText(item.title, "Untitled selection", 80),
        source,
        category: cleanText(item.category, "Other", 28),
        duration: cleanText(item.duration, "", 20),
        addedBy: socket.data.memberId,
        votes: {},
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
      room.activePlaylistItemId = item.id;
      room.playlist = room.playlist.filter(entry => entry.id !== item.id);
      room.reactionHeatmap = [];
      room.reactionHighlights = null;
      room.externalStarted = false;
      room.externalCountdown = null;
      for (const member of room.members.values()) member.externalReady = false;
      room.updatedAt = now();
      room.version += 1;
      io.to(room.id).emit("room:config", room.config);
      io.to(room.id).emit("playlist:state", room.playlist);
      publishPresence(room);
      publishState(room);
    });

    socket.on("room:change-source", ({ title, source } = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      const canControl = room.config.control === "shared" || isHost(room, socket);
      if (!canControl) return reject(socket, "host-controls", "The host has the remote.");
      if (typeof source !== "string" || !validMediaUrl(source)) return reject(socket, "invalid-source", "Provide a supported media URL.");

      room.config = { ...room.config, title: typeof title === "string" && title.trim() ? title.trim() : "Shared Video", source };
      room.position = 0;
      room.activePlaylistItemId = null;
      room.reactionHeatmap = [];
      room.reactionHighlights = null;
      room.playing = false;
      room.externalStarted = false;
      room.externalCountdown = null;
      for (const member of room.members.values()) member.externalReady = false;
      room.updatedAt = now();
      room.version += 1;
      io.to(room.id).emit("room:config", room.config);
      publishPresence(room);
      publishState(room);
    });

    socket.on("room:set-title", ({ title, source } = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      if (source !== room.config.source) return;
      const canControl = room.config.control === "shared" || isHost(room, socket);
      if (!canControl) return reject(socket, "host-controls", "The host has the remote.");
      const nextTitle = cleanText(title, "", 80);
      if (!nextTitle) return;
      room.config = { ...room.config, title: nextTitle };
      io.to(room.id).emit("room:config", room.config);
      publishState(room);
    });

    socket.on("webrtc:start-share", ({ title } = {}) => {
      const room = roomFor(socket);
      if (!room) return;
      if (!canPublishScreen(room, socket.data.memberId)) return reject(socket, "permission-denied", "Only host or remote holder can share screen.");
      if (room.screenShare && room.screenShare.sharerMemberId !== socket.data.memberId) {
        return reject(socket, "already-sharing", "Another member is already sharing their screen.");
      }
      room.screenShare = {
        sharerSocketId: socket.id,
        sharerMemberId: socket.data.memberId,
        title: title || "Screen Share",
      };
      io.to(room.id).emit("webrtc:sharing-status", room.screenShare);
      publishState(room);
    });

    socket.on("webrtc:stop-share", () => {
      const room = roomFor(socket);
      if (!room) return;
      if (room.screenShare?.sharerSocketId === socket.id) {
        room.screenShare = null;
        io.to(room.id).emit("webrtc:sharing-status", null);
        publishState(room);
      }
    });

    socket.on("webrtc:signal", ({ toMemberId, signal } = {}) => {
      const room = roomFor(socket);
      if (!room || !room.screenShare) return;
      if (!signal || typeof signal !== "object") return;
      const validTypes = new Set(["offer", "answer", "candidate"]);
      if (typeof signal.type !== "string" || !validTypes.has(signal.type)) return;

      const sharerId = room.screenShare.sharerMemberId;
      const senderId = socket.data.memberId;

      if (signal.type === "offer") {
        if (senderId !== sharerId) return;
      } else {
        if (senderId !== sharerId && toMemberId !== sharerId) return;
      }

      for (const [sId, member] of room.members.entries()) {
        if (member.id === toMemberId && member.online && member.socketId) {
          io.to(member.socketId).emit("webrtc:signal", {
            fromMemberId: senderId,
            fromSocketId: socket.id,
            signal,
          });
          break;
        }
      }
    });

    socket.on("webrtc:request-offer", ({ toMemberId } = {}) => {
      const room = roomFor(socket);
      if (!room || !room.screenShare) return;
      const sharerId = room.screenShare.sharerMemberId;
      if (!toMemberId || toMemberId !== sharerId) return;

      const sharer = room.members.get(sharerId);
      if (sharer && sharer.online && sharer.socketId) {
        io.to(sharer.socketId).emit("webrtc:request-offer", {
          fromMemberId: socket.data.memberId,
        });
      }
    });

    socket.on("playlist:vote", ({ id } = {}) => {
      const room = roomFor(socket);
      const item = room?.playlist.find(entry => entry.id === id);
      if (!room || !item) return reject(socket, "missing-item", "That queue item is no longer available.");
      item.votes ||= {};
      if (item.votes[socket.data.memberId]) delete item.votes[socket.data.memberId];
      else item.votes[socket.data.memberId] = true;
      io.to(room.id).emit("playlist:state", room.playlist);
    });

    socket.on("playlist:move", ({ id, direction } = {}) => {
      const room = roomFor(socket);
      if (!room || !isHost(room, socket)) return reject(socket, "host-only", "Only the host can reorder the queue.");
      if (direction !== "up" && direction !== "down") return reject(socket, "invalid-direction", "Choose an adjacent queue position.");
      const index = room.playlist.findIndex(item => item.id === id);
      const nextIndex = index + (direction === "up" ? -1 : 1);
      if (index < 0 || nextIndex < 0 || nextIndex >= room.playlist.length) return;
      [room.playlist[index], room.playlist[nextIndex]] = [room.playlist[nextIndex], room.playlist[index]];
      io.to(room.id).emit("playlist:state", room.playlist);
    });

    socket.on("playback:ended", ({ version } = {}) => {
      const room = roomFor(socket);
      if (!room || !isHost(room, socket)) return;
      if (!room.playing || (Number.isFinite(version) && version < room.version)) {
        socket.emit("room:state", roomSnapshot(room));
        return;
      }
      const endedAt = currentPosition(room);
      room.playing = false;
      room.position = endedAt;
      room.updatedAt = now();
      const buckets = new Map();
      for (const reaction of room.reactionHeatmap) {
        const bucketPosition = Math.floor(reaction.position / 30) * 30;
        const key = `${reaction.emoji}:${bucketPosition}`;
        const bucket = buckets.get(key) || { emoji: reaction.emoji, position: bucketPosition, count: 0 };
        bucket.count += 1;
        buckets.set(key, bucket);
      }
      room.reactionHighlights = {
        title: room.config.title,
        items: [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      };
      const next = room.playlist
        .map((item, index) => ({ item, index, votes: Object.keys(item.votes || {}).length }))
        .sort((a, b) => b.votes - a.votes || a.index - b.index)[0]?.item;
      if (next) {
        room.config = { ...room.config, title: next.title, source: next.source };
        room.position = 0;
        room.playing = !isSyncOnly(next.source);
        room.activePlaylistItemId = next.id;
        room.playlist = room.playlist.filter(item => item.id !== next.id);
        room.reactionHeatmap = [];
        room.externalStarted = false;
        room.externalCountdown = null;
        for (const member of room.members.values()) member.externalReady = false;
        io.to(room.id).emit("room:config", room.config);
        io.to(room.id).emit("playlist:state", room.playlist);
        publishPresence(room);
      }
      room.version += 1;
      publishState(room);
    });

    socket.on("host:transfer", ({ memberId } = {}) => {
      const room = roomFor(socket);
      const target = room?.members.get(memberId);
      if (!room || !isHost(room, socket) || !target?.online) return reject(socket, "transfer-failed", "Choose an online participant to host.");
      room.hostId = target.id;
      if (room.screenShare && !canPublishScreen(room, room.screenShare.sharerMemberId)) {
        room.screenShare = null;
        io.to(room.id).emit("webrtc:sharing-status", null);
      }
      room.version += 1;
      publishPresence(room);
      publishState(room);
    });

    socket.on("screen:ticket", (_payload, acknowledge) => {
      const room = roomFor(socket);
      const member = room?.members.get(socket.data.memberId);
      if (!room || !member?.online || member.socketId !== socket.id) {
        if (typeof acknowledge === "function") acknowledge({ error: "Join the room before requesting screen sharing." });
        return;
      }
      const ticket = liveKitService.issueTicket({
        roomId: room.id,
        memberId: member.id,
        name: member.name,
        canPublish: canPublishScreen(room, member.id),
      });
      if (!ticket) {
        if (typeof acknowledge === "function") acknowledge({ error: "LiveKit screen sharing is not configured on this server." });
        return;
      }
      if (typeof acknowledge === "function") acknowledge({ ticket });
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

    socket.on("reaction:send", ({ emoji, id } = {}) => {
      const room = roomFor(socket);
      const member = room?.members.get(socket.data.memberId);
      if (!room || !member || !moodByEmoji[emoji]) return;

      const currentNow = now();
      if (!socket.data.reactionTimestamps) {
        socket.data.reactionTimestamps = [];
      }
      socket.data.reactionTimestamps = socket.data.reactionTimestamps.filter(t => currentNow - t < 1000);
      if (socket.data.reactionTimestamps.length >= 5) {
        return;
      }
      socket.data.reactionTimestamps.push(currentNow);

      room.moods[socket.data.memberId] = moodByEmoji[emoji];
      const reaction = {
        id: (typeof id === "string" && id.trim()) ? id.trim() : `${currentNow}-${socket.id}-${Math.random().toString(36).slice(2, 6)}`,
        emoji,
        mood: moodByEmoji[emoji],
        memberId: member.id,
        name: member.name,
        position: currentPosition(room),
        createdAt: currentNow,
      };
      room.reactionHeatmap.push(reaction);
      room.reactionHeatmap = room.reactionHeatmap.slice(-250);
      io.to(room.id).emit("reaction", reaction);
      io.to(room.id).emit("reaction:heatmap", room.reactionHeatmap);
      io.to(room.id).emit("mood:update", roomSnapshot(room).mood);
    });

    socket.on("poll:create", ({ question, options } = {}) => {
      const room = roomFor(socket);
      if (room?.poll && !room.poll.closed) return reject(socket, "poll-active", "Close the current poll before starting another.");
      if (!room || !Array.isArray(options)) return reject(socket, "invalid-poll", "Add a question and two to six options.");
      const cleanOptions = options
        .filter(option => option && typeof option.label === "string")
        .slice(0, 6)
        .map((option, index) => ({
          id: `${now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
          label: cleanText(option.label, "", 80),
          item: option.item && validMediaUrl(option.item.source)
            ? {
                title: cleanText(option.item.title, option.label, 80),
                source: cleanText(option.item.source, "", 1000),
                category: cleanText(option.item.category, "Poll pick", 28),
                duration: cleanText(option.item.duration, "", 20),
              }
            : null,
        }))
        .filter(option => option.label);
      if (cleanOptions.length < 2) return reject(socket, "invalid-poll", "A poll needs at least two non-empty options.");
      room.poll = {
        id: `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        question: cleanText(question, "What should we watch next?", 120),
        options: cleanOptions,
        votes: {},
        closed: false,
        createdBy: socket.data.memberId,
      };
      io.to(room.id).emit("poll:update", room.poll);
    });

    socket.on("poll:vote", ({ optionId } = {}) => {
      const room = roomFor(socket);
      if (!room?.poll || room.poll.closed || !room.poll.options.some(option => option.id === optionId)) {
        return reject(socket, "poll-closed", "That poll is closed or the option is no longer available.");
      }
      room.poll.votes[socket.data.memberId] = optionId;
      io.to(room.id).emit("poll:update", room.poll);
    });

    socket.on("poll:close", () => {
      const room = roomFor(socket);
      if (!room?.poll) return reject(socket, "poll-missing", "There is no poll to close.");
      if (!isHost(room, socket)) return reject(socket, "host-only", "Only the host can close the poll.");
      room.poll.closed = true;
      io.to(room.id).emit("poll:update", room.poll);
    });

    socket.on("poll:queue-winner", () => {
      const room = roomFor(socket);
      if (!room?.poll?.closed) return reject(socket, "poll-open", "Close the poll before sending its winner to the queue.");
      if (!isHost(room, socket)) return reject(socket, "host-only", "Only the host can queue the poll winner.");
      const winner = room.poll.options
        .map((option, index) => ({
          option,
          index,
          votes: Object.values(room.poll.votes).filter(vote => vote === option.id).length,
        }))
        .sort((a, b) => b.votes - a.votes || a.index - b.index)[0];
      if (!winner?.votes) return reject(socket, "no-poll-votes", "The poll needs at least one vote before its winner can be queued.");
      if (!winner?.option.item) return reject(socket, "winner-unplayable", "The winning option needs a supported media URL before it can be queued.");
      if (room.playlist.length >= 50) return reject(socket, "queue-full", "The shared queue is full.");
      room.playlist.push({
        id: `${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ...winner.option.item,
        addedBy: socket.data.memberId,
        votes: {},
      });
      io.to(room.id).emit("playlist:state", room.playlist);
    });

    socket.on("latency:ping", ({ clientSentAt } = {}, acknowledge) => {
      const payload = { clientSentAt, serverReceivedAt: now(), serverSentAt: now() };
      if (typeof acknowledge === "function") acknowledge(payload);
      else socket.emit("latency:pong", payload);
    });

    socket.on("disconnect", () => {
      const room = roomFor(socket);
      if (!room) return;
      settleExternalCountdown(room);
      const member = room.members.get(socket.data.memberId);
      if (!member || member.socketId !== socket.id) return;
      member.online = false;
      member.socketId = null;
      member.externalReady = false;
      const cancelledCountdown = Boolean(room.externalCountdown && !room.externalStarted);
      if (cancelledCountdown) {
        room.externalCountdown = null;
        room.playing = false;
        room.updatedAt = now();
      }
      if (room.screenShare?.sharerSocketId === socket.id) {
        room.screenShare = null;
        io.to(room.id).emit("webrtc:sharing-status", null);
      }
      publishPresence(room);
      if (cancelledCountdown || !room.screenShare) publishState(room);
      const key = `${room.id}:${member.id}`;
      clearDisconnectTimer(room.id, member.id);
      disconnectTimers.set(key, setTimeout(() => {
        const liveRoom = rooms.get(room.id);
        const liveMember = liveRoom?.members.get(member.id);
        if (!liveRoom || !liveMember || liveMember.online) return;
        liveRoom.members.delete(member.id);
        delete liveRoom.moods[member.id];
        if (liveRoom.poll?.votes[member.id]) {
          delete liveRoom.poll.votes[member.id];
          io.to(liveRoom.id).emit("poll:update", liveRoom.poll);
        }
        for (const item of liveRoom.playlist) delete item.votes?.[member.id];
        io.to(liveRoom.id).emit("playlist:state", liveRoom.playlist);
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
