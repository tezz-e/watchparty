import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import { createYoutubePlayer } from "../src/player/youtubePlayer.js";
import { enforcePausedPlayback, handlePlayerStateChange } from "../src/utils/playbackSync.js";

const serverFile = fileURLToPath(new URL("../server.js", import.meta.url));
const ytSource = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const sockets = new Set();
let child;
let baseUrl;
let roomCounter = 0;

async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.listen(0, "127.0.0.1", resolve).once("error", reject));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(url) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      if (child.exitCode !== null) throw new Error(`Watch party server exited (${child.exitCode})`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Watch party server did not become healthy in time.");
}

function eventOnce(socket, name, predicate = () => true, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`Timed out waiting for ${name}.`));
    }, timeoutMs);
    const handler = (...args) => {
      if (!predicate(...args)) return;
      clearTimeout(timeout);
      socket.off(name, handler);
      resolve(args);
    };
    socket.on(name, handler);
  });
}

async function connectClient() {
  const socket = io(baseUrl, { forceNew: true, reconnection: false, timeout: 2000 });
  sockets.add(socket);
  await eventOnce(socket, "connect");
  return socket;
}

class FakeYTPlayer {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.time = 0;
    this.durationSeconds = 120;
    this.rate = 1;
    this.isPlaying = false;
    this.state = -1; // -1 unstarted, 1 playing, 2 paused, 3 buffering, 5 cued
    this.frame = { style: {} };
    if (options.events?.onReady) {
      queueMicrotask(() => {
        options.events.onReady({ target: this });
      });
    }
  }
  getIframe() { return this.frame; }
  getCurrentTime() { return this.time; }
  getDuration() { return this.durationSeconds; }
  getPlayerState() { return this.state; }
  seekTo(pos) { this.time = pos; }
  setPlaybackRate(rate) { this.rate = rate; }
  playVideo() {
    this.isPlaying = true;
    this.state = 1;
    this.options.events?.onStateChange?.({ data: 1 });
  }
  pauseVideo() {
    this.isPlaying = false;
    this.state = 2;
    this.options.events?.onStateChange?.({ data: 2 });
  }
  destroy() { this.destroyed = true; }
}

before(async () => {
  const port = await availablePort();
  child = spawn(process.execPath, [serverFile], {
    env: { ...process.env, PORT: String(port) },
    stdio: "pipe",
  });
  baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);
});

after(() => {
  for (const s of sockets) {
    try { s.disconnect(); } catch {}
  }
  sockets.clear();
  if (child) child.kill("SIGTERM");
});

test("host pause -> attendee paused and stays paused", async () => {
  const roomId = `yt-room-${++roomCounter}`;
  const hostSocket = await connectClient();
  const attendeeSocket = await connectClient();

  const hostJoined = eventOnce(hostSocket, "room:joined");
  hostSocket.emit("room:create", {
    roomId,
    memberId: "member_host_1",
    name: "Host",
    title: "YouTube Video",
    source: ytSource,
    control: "host",
  });
  await hostJoined;

  const attendeeJoined = eventOnce(attendeeSocket, "room:joined");
  attendeeSocket.emit("room:join", {
    roomId,
    memberId: "member_attendee_1",
    name: "Attendee",
  });
  const [joinedPayload] = await attendeeJoined;

  let attendeeYTInstance = null;
  let attendeeState = { ...joinedPayload.state };
  let enforcementInterval = null;

  const attendeeAdapter = createYoutubePlayer({}, "dQw4w9WgXcQ", {
    loadApi: async () => ({
      Player: function(container, options) {
        attendeeYTInstance = new FakeYTPlayer(container, options);
        return attendeeYTInstance;
      },
    }),
    onStateChange: event => {
      handlePlayerStateChange({
        eventState: event.data,
        roomPlaying: attendeeState.playing,
        roomPosition: attendeeState.position,
        hasRemote: false,
        player: attendeeAdapter,
      });
    },
  });
  await attendeeAdapter.ready;
  await new Promise(resolve => setTimeout(resolve, 20));

  attendeeSocket.on("playback:state", (next, ack) => {
    attendeeState = { ...attendeeState, ...next };
    if (!next.playing) {
      attendeeAdapter.pause();
      if (Math.abs(next.position - attendeeAdapter.currentTime()) > 1.0) {
        attendeeAdapter.seek(next.position);
      }
      if (!enforcementInterval) {
        enforcementInterval = setInterval(() => {
          if (!attendeeState.playing) {
            enforcePausedPlayback(attendeeAdapter, attendeeState.position);
          }
        }, 100);
      }
    } else {
      if (enforcementInterval) {
        clearInterval(enforcementInterval);
        enforcementInterval = null;
      }
      attendeeAdapter.play();
    }
    if (ack) ack();
  });

  // 1. Host plays at position 10
  const statePlaying = eventOnce(attendeeSocket, "playback:state", s => s.playing === true);
  hostSocket.emit("playback:update", { playing: true, position: 10, version: 1, sentAt: Date.now() });
  await statePlaying;
  assert.equal(attendeeYTInstance.isPlaying, true);

  // 2. Host pauses at position 25
  const statePaused = eventOnce(attendeeSocket, "playback:state", s => s.playing === false);
  hostSocket.emit("playback:update", { playing: false, position: 25, version: 2, sentAt: Date.now() });
  await statePaused;

  assert.equal(attendeeYTInstance.isPlaying, false);
  assert.equal(attendeeYTInstance.time, 25);

  // Wait to allow enforcement loop to run and verify attendee stays paused
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(attendeeYTInstance.isPlaying, false);
  assert.equal(attendeeYTInstance.time, 25);

  if (enforcementInterval) clearInterval(enforcementInterval);
  attendeeAdapter.destroy();
});

test("stray state-1 event while paused gets re-paused", async () => {
  let ytInstance = null;
  const roomState = { playing: false, position: 15 };

  const adapter = createYoutubePlayer({}, "dQw4w9WgXcQ", {
    loadApi: async () => ({
      Player: function(container, options) {
        ytInstance = new FakeYTPlayer(container, options);
        return ytInstance;
      },
    }),
    onStateChange: event => {
      handlePlayerStateChange({
        eventState: event.data,
        roomPlaying: roomState.playing,
        roomPosition: roomState.position,
        hasRemote: false,
        player: adapter,
      });
    },
  });
  await adapter.ready;
  await new Promise(resolve => setTimeout(resolve, 20));

  adapter.pause();
  adapter.seek(15);
  assert.equal(ytInstance.isPlaying, false);

  // Stray state-1 event while room is paused (e.g. YouTube buffer finishes and reports 1)
  ytInstance.isPlaying = true;
  ytInstance.options.events?.onStateChange?.({ data: 1 });

  // Verify it was immediately re-paused and position restored
  assert.equal(ytInstance.isPlaying, false);
  assert.equal(ytInstance.time, 15);

  // Verify enforcePausedPlayback re-pauses if player enters playing state without event
  ytInstance.isPlaying = true;
  ytInstance.state = 1;
  ytInstance.time = 22;
  enforcePausedPlayback(adapter, roomState.position);

  assert.equal(ytInstance.isPlaying, false);
  assert.equal(ytInstance.time, 15);

  adapter.destroy();
});

test("pause arriving before player is ready is applied on ready", async () => {
  let resolveApi;
  const apiPromise = new Promise(resolve => { resolveApi = resolve; });
  let ytInstance = null;

  const adapter = createYoutubePlayer({}, "dQw4w9WgXcQ", {
    loadApi: () => apiPromise,
  });

  // Issue pause and seek before player is ready
  adapter.seek(30);
  adapter.setPlaybackRate(1.25);
  adapter.pause();

  assert.equal(adapter.currentTime(), 30);

  resolveApi({
    Player: function(container, options) {
      ytInstance = new FakeYTPlayer(container, options);
      ytInstance.isPlaying = true;
      ytInstance.state = 3;
      return ytInstance;
    },
  });

  await adapter.ready;
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify onReady applied queued pause, seek, and rate
  assert.equal(ytInstance.isPlaying, false);
  assert.equal(ytInstance.time, 30);
  assert.equal(ytInstance.rate, 1.25);
  assert.equal(adapter.currentTime(), 30);

  adapter.destroy();
});

test("late join while paused loads paused at the correct position", async () => {
  const roomId = `yt-room-${++roomCounter}`;
  const hostSocket = await connectClient();

  const hostJoined = eventOnce(hostSocket, "room:joined");
  hostSocket.emit("room:create", {
    roomId,
    memberId: "member_host_1",
    name: "Host",
    title: "YouTube Video",
    source: ytSource,
    control: "host",
  });
  await hostJoined;

  // Host sets room playback to paused at position 45
  hostSocket.emit("playback:update", { playing: false, position: 45, version: 1, sentAt: Date.now() });
  await new Promise(resolve => setTimeout(resolve, 100));

  // Late joiner joins
  const lateSocket = await connectClient();
  const lateJoined = eventOnce(lateSocket, "room:joined");
  lateSocket.emit("room:join", {
    roomId,
    memberId: "member_late_1",
    name: "Late Joiner",
  });
  const [joinedPayload] = await lateJoined;

  assert.equal(joinedPayload.state.playing, false);
  assert.equal(joinedPayload.state.position, 45);

  let lateYTInstance = null;
  const lateAdapter = createYoutubePlayer({}, "dQw4w9WgXcQ", {
    loadApi: async () => ({
      Player: function(container, options) {
        lateYTInstance = new FakeYTPlayer(container, options);
        return lateYTInstance;
      },
    }),
    onReady: () => {
      lateAdapter.seek(joinedPayload.state.position);
      if (joinedPayload.state.playing) {
        lateAdapter.play();
      } else {
        lateAdapter.pause();
      }
    },
  });

  lateAdapter.seek(joinedPayload.state.position);
  lateAdapter.pause();

  await lateAdapter.ready;
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(lateYTInstance.isPlaying, false);
  assert.equal(lateYTInstance.time, 45);
  assert.equal(lateAdapter.currentTime(), 45);

  lateAdapter.destroy();
});

test("host pause in onStateChange uses live hasRemoteRef so pause is not dropped by stale mount closure", async () => {
  // Simulate mount where hasRemote is initially false (before identity/host resolution)
  let hasRemote = false;
  const hasRemoteRef = { current: false };

  let emittedUpdate = null;
  const sendPlayback = (playing, position) => {
    // If it checked the stale `hasRemote` variable, it would reject!
    if (!hasRemoteRef.current) return "rejected";
    emittedUpdate = { playing, position };
  };
  const sendPlaybackRef = { current: sendPlayback };

  const roomState = { playing: true, position: 20 };
  const onRemotePause = pos => (sendPlaybackRef.current || sendPlayback)(false, pos);

  // Host identity resolves: hasRemoteRef becomes true, but stale closure `hasRemote` was false
  hasRemoteRef.current = true;

  // Host pauses on YouTube video (event data: 2)
  handlePlayerStateChange({
    eventState: 2,
    roomPlaying: roomState.playing,
    roomPosition: roomState.position,
    hasRemote: hasRemoteRef.current,
    player: { currentTime: () => 20 },
    onRemotePause,
  });

  assert.deepEqual(emittedUpdate, { playing: false, position: 20 });
});
