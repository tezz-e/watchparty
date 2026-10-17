import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, afterEach, before, test } from "node:test";
import { io } from "socket.io-client";
import { fileURLToPath } from "node:url";

const serverFile = fileURLToPath(new URL("../server.js", import.meta.url));
const sampleUrl = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const sockets = new Set();
let child;
let baseUrl;
let roomCounter = 0;
let serverOutput = "";
let mediaDirectory;

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
    } catch (error) {
      if (child.exitCode !== null) throw new Error(`Watch party server exited (${child.exitCode}): ${serverOutput || error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Watch party server did not become healthy: ${serverOutput}`);
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

async function connect(memberId, name = memberId) {
  const socket = io(baseUrl, { forceNew: true, reconnection: false, timeout: 2_000 });
  sockets.add(socket);
  await eventOnce(socket, "connect");
  socket.on("playback:state", (_state, acknowledge) => {
    if (typeof acknowledge === "function") acknowledge();
  });
  return { socket, memberId, name };
}

async function createRoom(host, overrides = {}) {
  const roomId = `test-room-${++roomCounter}`;
  const joined = eventOnce(host.socket, "room:joined");
  host.socket.emit("room:create", {
    roomId,
    memberId: host.memberId,
    name: host.name,
    title: "Integration test",
    source: sampleUrl,
    control: "host",
    ...overrides,
  });
  const [payload] = await joined;
  return { roomId, state: payload.state };
}

async function joinRoom(client, roomId) {
  const joined = eventOnce(client.socket, "room:joined");
  client.socket.emit("room:join", { roomId, memberId: client.memberId, name: client.name });
  const [payload] = await joined;
  return payload.state;
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  mediaDirectory = mkdtempSync(join(tmpdir(), "afterglow-library-"));
  writeFileSync(join(mediaDirectory, "sample_clip.mp4"), "0123456789");
  writeFileSync(join(mediaDirectory, "ignore.txt"), "not media");
  child = spawn(process.execPath, [serverFile], {
    env: { ...process.env, PORT: String(port), RECONNECT_GRACE_MS: "350", MEDIA_DIR: mediaDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8").on("data", text => { serverOutput += text; });
  child.stderr.setEncoding("utf8").on("data", text => { serverOutput += text; });
  await waitForHealth(baseUrl);
});

afterEach(() => {
  for (const socket of sockets) {
    socket.disconnect();
    sockets.delete(socket);
  }
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once("exit", resolve));
    child.kill();
    await exited;
  }
  if (mediaDirectory) rmSync(mediaDirectory, { recursive: true, force: true });
});

test("room creation is explicit, joins require an existing room, and media URLs are direct MP4/WebM", async () => {
  const host = await connect("host-member-0001");
  const missingRoomError = eventOnce(host.socket, "room:error");
  host.socket.emit("room:join", { roomId: "missing-room", memberId: host.memberId, name: host.name });
  assert.equal((await missingRoomError)[0].code, "room-not-found");

  const invalidSourceError = eventOnce(host.socket, "room:error");
  host.socket.emit("room:create", {
    roomId: "bad-source-room",
    memberId: host.memberId,
    name: host.name,
    title: "Invalid",
    source: "https://example.com/watch",
  });
  assert.equal((await invalidSourceError)[0].code, "invalid-source");

  const { roomId, state } = await createRoom(host, { source: "https://example.com/movie.WEBM?token=sample" });
  assert.equal(state.config.source, "https://example.com/movie.WEBM?token=sample");

  const secondHost = await connect("host-member-0002");
  const duplicateError = eventOnce(secondHost.socket, "room:error");
  secondHost.socket.emit("room:create", {
    roomId,
    memberId: secondHost.memberId,
    name: secondHost.name,
    title: "Duplicate",
    source: sampleUrl,
  });
  assert.equal((await duplicateError)[0].code, "room-exists");
});

test("YouTube links can create rooms, enter the shared playlist, and report failures and buffering", async () => {
  const host = await connect("youtube-host-0001");
  const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { roomId, state } = await createRoom(host, { source: youtubeUrl });
  assert.equal(state.config.source, youtubeUrl);

  const viewer = await connect("youtube-viewer-0001");
  await joinRoom(viewer, roomId);

  const queueUpdate = eventOnce(host.socket, "playlist:state");
  viewer.socket.emit("playlist:add", { title: "YouTube pick", source: youtubeUrl });
  const [queue] = await queueUpdate;
  assert.equal(queue[0].source, youtubeUrl);

  const presence = eventOnce(host.socket, "room:presence", members => members.some(member => member.id === viewer.memberId && member.buffering));
  viewer.socket.emit("media:buffering", { buffering: true });
  const [members] = await presence;
  assert.equal(members.find(member => member.id === viewer.memberId).buffering, true);

  const failure = eventOnce(viewer.socket, "media:failure", payload => payload.memberId === viewer.memberId);
  viewer.socket.emit("media:failure", { code: 150 });
  assert.deepEqual((await failure)[0], { memberId: viewer.memberId, name: viewer.name, code: 150 });

  let unexpectedFailure = false;
  const onFailure = payload => { if (payload.code === 999) unexpectedFailure = true; };
  viewer.socket.on("media:failure", onFailure);
  viewer.socket.emit("media:failure", { code: 999 });
  await new Promise(resolve => setTimeout(resolve, 50));
  viewer.socket.off("media:failure", onFailure);
  assert.equal(unexpectedFailure, false);
});

test("ten clients receive authoritative playback commands and server records delivery and drift", async () => {
  const host = await connect("group-host-0001");
  const { roomId } = await createRoom(host);
  const viewers = [host];
  for (let index = 1; index < 10; index += 1) {
    const viewer = await connect(`group-viewer-${String(index).padStart(4, "0")}`);
    await joinRoom(viewer, roomId);
    viewers.push(viewer);
  }

  const updates = viewers.map(viewer => eventOnce(viewer.socket, "playback:state"));
  const telemetry = eventOnce(host.socket, "room:telemetry", value => value.deliverySamples > 0);
  host.socket.emit("playback:update", { playing: true, position: 6, version: 0, sentAt: Date.now() });
  const payloads = await Promise.all(updates);
  for (const [state] of payloads) {
    assert.equal(state.playing, true);
    assert.equal(state.position, 6);
  }
  const [metrics] = await telemetry;
  assert.equal(metrics.commands, 1);
  assert.equal(metrics.deliverySamples, 1);
  assert.ok(metrics.averageDeliveryRoundTripMs >= 0);

  const driftSample = eventOnce(host.socket, "room:telemetry", value => value.driftSamples === 1);
  host.socket.emit("sync:drift", { drift: -0.25 });
  const [driftMetrics] = await driftSample;
  assert.equal(driftMetrics.averageDrift, 0.25);
  assert.equal(driftMetrics.maxDrift, 0.25);
});

test("local library lists video files and serves byte ranges", async () => {
  const response = await fetch(`${baseUrl}/api/library`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const items = await response.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "sample clip");
  assert.equal(items[0].source, "/media/sample_clip.mp4");

  const partial = await fetch(`${baseUrl}${items[0].source}`, { headers: { Range: "bytes=2-5" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await partial.text(), "2345");

  const unsatisfiable = await fetch(`${baseUrl}${items[0].source}`, { headers: { Range: "bytes=20-30" } });
  assert.equal(unsatisfiable.status, 416);
  assert.equal((await fetch(`${baseUrl}/media/ignore.txt`)).status, 404);
});

test("latency metrics endpoint reports server delivery percentiles", async () => {
  const host = await connect("metrics-host-0001");
  await createRoom(host);
  const before = await (await fetch(`${baseUrl}/metrics/latency`)).json();
  const update = eventOnce(host.socket, "playback:state");
  host.socket.emit("playback:update", { playing: true, position: 3, version: 0 });
  await update;

  const deadline = Date.now() + 2_000;
  let metrics;
  do {
    metrics = await (await fetch(`${baseUrl}/metrics/latency`)).json();
    if (metrics.sampleCount > before.sampleCount) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);

  assert.ok(metrics.sampleCount > before.sampleCount);
  assert.ok(metrics.p50Ms >= 0);
  assert.ok(metrics.p95Ms >= metrics.p50Ms);
  assert.ok(metrics.p99Ms >= metrics.p95Ms);
  assert.ok(metrics.timeoutCount >= 0);
});

test("host-only playback controls and explicit host transfer enforce the active remote", async () => {
  const host = await connect("remote-host-0001");
  const { roomId } = await createRoom(host);
  const viewer = await connect("remote-viewer-0001");
  await joinRoom(viewer, roomId);

  const denied = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("playback:update", { playing: true, position: 2, version: 0 });
  assert.equal((await denied)[0].code, "host-controls");

  const transferred = eventOnce(viewer.socket, "room:state", state => state.hostId === viewer.memberId);
  host.socket.emit("host:transfer", { memberId: viewer.memberId });
  const [hostState] = await transferred;
  const accepted = eventOnce(host.socket, "playback:state");
  viewer.socket.emit("playback:update", { playing: true, position: 4, version: hostState.version });
  assert.equal((await accepted)[0].position, 4);
});

test("late joiners receive the canonical playhead; invalid queue URLs are rejected and queue picks synchronize", async () => {
  const host = await connect("late-host-0001");
  const { roomId } = await createRoom(host);
  const playingState = eventOnce(host.socket, "playback:state");
  host.socket.emit("playback:update", { playing: true, position: 18, version: 0 });
  assert.equal((await playingState)[0].playing, true);

  const lateViewer = await connect("late-viewer-0001");
  const lateState = await joinRoom(lateViewer, roomId);
  assert.equal(lateState.playing, true);
  assert.ok(lateState.position >= 18 && lateState.position < 22);
  assert.equal(lateState.config.source, sampleUrl);

  const invalidPick = eventOnce(lateViewer.socket, "room:error");
  lateViewer.socket.emit("playlist:add", { title: "Page", source: "https://example.com/page" });
  assert.equal((await invalidPick)[0].code, "invalid-source");

  const queueUpdate = eventOnce(host.socket, "playlist:state");
  lateViewer.socket.emit("playlist:add", { title: "Queued sample", source: sampleUrl, category: "Test" });
  const [queue] = await queueUpdate;
  assert.equal(queue.length, 1);
  const configUpdate = eventOnce(lateViewer.socket, "room:config");
  host.socket.emit("playlist:play", { id: queue[0].id });
  assert.equal((await configUpdate)[0].title, "Queued sample");
});

test("reconnect within grace retains host identity; expiry elects the next online participant", async () => {
  const host = await connect("reconnect-host-0001");
  const { roomId } = await createRoom(host);
  const viewer = await connect("reconnect-viewer-0001");
  await joinRoom(viewer, roomId);

  host.socket.disconnect();
  const resumedHost = await connect(host.memberId, host.name);
  const resumedState = await joinRoom(resumedHost, roomId);
  assert.equal(resumedState.hostId, host.memberId);

  const promoted = eventOnce(viewer.socket, "room:state", state => state.hostId === viewer.memberId, 2_000);
  resumedHost.socket.disconnect();
  const [state] = await promoted;
  assert.equal(state.hostId, viewer.memberId);
});

test("stale concurrent playback commands are rejected and shared mood recommendations aggregate one vote per person", async () => {
  const host = await connect("shared-host-0001");
  const { roomId } = await createRoom(host, { control: "shared" });
  const viewer = await connect("shared-viewer-0001");
  await joinRoom(viewer, roomId);

  const acceptedCommand = eventOnce(host.socket, "playback:state");
  host.socket.emit("playback:update", { playing: true, position: 3, version: 0 });
  viewer.socket.emit("playback:update", { playing: false, position: 8, version: 0 });
  const [commandState] = await acceptedCommand;
  assert.equal(commandState.version, 1);
  assert.equal(commandState.telemetry.commands, 1);

  const moodUpdate = eventOnce(host.socket, "mood:update");
  viewer.socket.emit("reaction:send", { emoji: "😂" });
  const [firstMood] = await moodUpdate;
  assert.equal(firstMood.current, "playful");
  assert.equal(firstMood.voters, 1);

  const changedMood = eventOnce(host.socket, "mood:update");
  viewer.socket.emit("reaction:send", { emoji: "♥" });
  const [secondMood] = await changedMood;
  assert.equal(secondMood.current, "cozy");
  assert.equal(secondMood.voters, 1);
  assert.deepEqual(secondMood.counts, { cozy: 1 });
});

test("room capacity counts reconnect-grace members toward twenty", async () => {
  const host = await connect("capacity-host-0001");
  const { roomId } = await createRoom(host);
  let temporarilyOffline;
  for (let index = 1; index < 20; index += 1) {
    const participant = await connect(`capacity-member-${String(index).padStart(4, "0")}`);
    await joinRoom(participant, roomId);
    if (index === 1) temporarilyOffline = participant;
  }
  const presence = eventOnce(host.socket, "room:presence", members => members.some(member => member.id === temporarilyOffline.memberId && !member.online));
  temporarilyOffline.socket.disconnect();
  await presence;
  const overflow = await connect("capacity-overflow-01");
  const fullError = eventOnce(overflow.socket, "room:error");
  overflow.socket.emit("room:join", { roomId, memberId: overflow.memberId, name: overflow.name });
  assert.equal((await fullError)[0].code, "room-full");
});
