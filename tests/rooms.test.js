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
const sampleUrl = "https://media.example/approved-test.mp4";
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
    env: {
      ...process.env,
      PORT: String(port),
      RECONNECT_GRACE_MS: "350",
      MEDIA_DIR: mediaDirectory,
      LIVEKIT_URL: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8").on("data", text => { serverOutput += text; });
  child.stderr.setEncoding("utf8").on("data", text => { serverOutput += text; });
  await waitForHealth(baseUrl);
});

test("LiveKit remains explicitly unavailable when credentials are not configured", async () => {
  const status = await fetch(`${baseUrl}/api/livekit/status`);
  assert.deepEqual(await status.json(), { enabled: false });

  const missingTicket = await fetch(`${baseUrl}/api/livekit/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingTicket.status, 503);
  assert.match((await missingTicket.json()).error, /not configured/i);
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

test("HLS and recognized streaming links can create rooms; arbitrary pages remain rejected", async () => {
  const host = await connect("provider-host-0001");
  const playlistPage = eventOnce(host.socket, "room:error");
  host.socket.emit("room:create", {
    roomId: "external-invalid",
    memberId: host.memberId,
    name: host.name,
    title: "Invalid external link",
    source: "https://unknown.example/watch/123",
  });
  assert.equal((await playlistPage)[0].code, "invalid-source");

  const hlsRoom = await createRoom(host, { source: "https://media.example/live/master.m3u8?token=sample" });
  assert.equal(hlsRoom.state.config.source, "https://media.example/live/master.m3u8?token=sample");

  const externalHost = await connect("external-host-0001");
  const externalRoom = await createRoom(externalHost, { source: "https://www.netflix.com/title/80057281" });
  assert.equal(externalRoom.state.config.source, "https://www.netflix.com/title/80057281");
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

  const updates = viewers.map(viewer => eventOnce(viewer.socket, "playback:state", () => true, 6_000));
  const telemetry = eventOnce(host.socket, "room:telemetry", value => value.deliverySamples > 0, 6_000);
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

  const driftSample = eventOnce(host.socket, "room:telemetry", value => value.driftSamples === 1, 6_000);
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

test("media-title endpoint validates URLs and resolves metadata", async t => {
  const missing = await fetch(`${baseUrl}/api/media-title`);
  assert.equal(missing.status, 400);

  const invalid = await fetch(`${baseUrl}/api/media-title?url=${encodeURIComponent("https://example.com/not-youtube")}`);
  assert.equal(invalid.status, 400);

  const valid = await fetch(`${baseUrl}/api/media-title?url=${encodeURIComponent("https://www.youtube.com/watch?v=aqz-KE-bpKQ")}`);
  if (valid.status === 502 || valid.status === 504) {
    t.skip("oEmbed is unreachable");
    return;
  }
  assert.equal(valid.status, 200);
  const data = await valid.json();
  assert.ok(data.title);
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

test("custom polls support changeable votes, host closure, winner queuing, and voted auto-advance", async () => {
  const host = await connect("poll-host-0001");
  const { roomId } = await createRoom(host);
  const viewer = await connect("poll-viewer-0001");
  await joinRoom(viewer, roomId);

  const pollCreated = eventOnce(host.socket, "poll:update");
  host.socket.emit("poll:create", {
    question: "What should we watch next?",
    options: [
      { label: "First pick", item: { title: "First pick", source: "https://media.example/first.mp4" } },
      { label: "Second pick", item: { title: "Second pick", source: "https://media.example/second.webm" } },
    ],
  });
  const [poll] = await pollCreated;
  assert.equal(poll.options.length, 2);
  assert.equal(poll.closed, false);

  const hostVote = eventOnce(viewer.socket, "poll:update", update => Object.keys(update.votes).length === 1);
  host.socket.emit("poll:vote", { optionId: poll.options[0].id });
  assert.equal(Object.keys((await hostVote)[0].votes).length, 1);
  const viewerVote = eventOnce(host.socket, "poll:update");
  viewer.socket.emit("poll:vote", { optionId: poll.options[1].id });
  await viewerVote;
  const changedVote = eventOnce(host.socket, "poll:update");
  viewer.socket.emit("poll:vote", { optionId: poll.options[0].id });
  assert.equal(Object.values((await changedVote)[0].votes).filter(id => id === poll.options[0].id).length, 2);

  const deniedClose = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("poll:close");
  assert.equal((await deniedClose)[0].code, "host-only");
  const closedPoll = eventOnce(host.socket, "poll:update", update => update.closed);
  host.socket.emit("poll:close");
  assert.equal((await closedPoll)[0].closed, true);

  const queuedWinner = eventOnce(host.socket, "playlist:state");
  host.socket.emit("poll:queue-winner");
  const [firstQueue] = await queuedWinner;
  assert.equal(firstQueue[0].title, "First pick");
  const addedSecond = eventOnce(host.socket, "playlist:state", update => update.length === 2);
  viewer.socket.emit("playlist:add", { title: "Second pick", source: "https://media.example/second.webm" });
  const [twoPicks] = await addedSecond;
  const secondId = twoPicks.find(item => item.title === "Second pick").id;
  const addedThird = eventOnce(host.socket, "playlist:state", update => update.length === 3);
  host.socket.emit("playlist:add", { title: "Third pick", source: "https://media.example/third.mp4" });
  const [threePicks] = await addedThird;
  const thirdId = threePicks.find(item => item.title === "Third pick").id;

  const removeDenied = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("playlist:remove", { id: thirdId });
  assert.equal((await removeDenied)[0].code, "host-only");
  const removed = eventOnce(host.socket, "playlist:state", update => update.length === 2);
  host.socket.emit("playlist:remove", { id: thirdId });
  await removed;

  const secondUpvote = eventOnce(host.socket, "playlist:state", update => update.find(item => item.id === secondId)?.votes?.[viewer.memberId]);
  viewer.socket.emit("playlist:vote", { id: secondId });
  await secondUpvote;
  const moveDenied = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("playlist:move", { id: secondId, direction: "up" });
  assert.equal((await moveDenied)[0].code, "host-only");

  const reordered = eventOnce(host.socket, "playlist:state", update => update[0]?.id === secondId);
  host.socket.emit("playlist:move", { id: secondId, direction: "up" });
  assert.equal((await reordered)[0][0].title, "Second pick");

  const started = eventOnce(host.socket, "playback:state", state => state.playing);
  host.socket.emit("playback:update", { playing: true, position: 12, version: 0 });
  const [playingState] = await started;
  const nextConfig = eventOnce(host.socket, "room:config", config => config.title === "Second pick");
  const advancedState = eventOnce(host.socket, "room:state", state => state.config.title === "Second pick" && state.playing);
  host.socket.emit("playback:ended", { version: playingState.version });
  assert.equal((await nextConfig)[0].source, "https://media.example/second.webm");
  const [advance] = await advancedState;
  assert.equal(advance.activePlaylistItemId, secondId);
  const staleEnd = eventOnce(host.socket, "room:state", state => state.config.title === "Second pick");
  host.socket.emit("playback:ended", { version: playingState.version });
  assert.equal((await staleEnd)[0].playlist.length, 1);
});

test("reaction heatmap records media positions and sync-health panel receives member telemetry", async () => {
  const host = await connect("health-host-0001");
  const { roomId } = await createRoom(host);
  const viewer = await connect("health-viewer-0001");
  await joinRoom(viewer, roomId);

  const started = eventOnce(host.socket, "playback:state", state => state.playing);
  host.socket.emit("playback:update", { playing: true, position: 42, version: 0 });
  const [playingState] = await started;

  const reactionAtViewer = eventOnce(viewer.socket, "reaction");
  host.socket.emit("reaction:send", { emoji: "👏" });
  assert.ok((await reactionAtViewer)[0].position >= 42);
  const heatmapAtHost = eventOnce(host.socket, "reaction:heatmap", items => items.length === 2);
  viewer.socket.emit("reaction:send", { emoji: "👏" });
  const [heatmap] = await heatmapAtHost;
  assert.equal(heatmap[0].emoji, "👏");
  assert.equal(heatmap[0].position >= 42, true);

  const health = eventOnce(host.socket, "room:presence", members => members.some(member => member.id === viewer.memberId && member.rttMs === 120));
  viewer.socket.emit("sync:health", { rttMs: 120, clockOffsetMs: -32 });
  const [members] = await health;
  const viewerHealth = members.find(member => member.id === viewer.memberId);
  assert.equal(viewerHealth.clockOffsetMs, -32);

  const drift = eventOnce(host.socket, "room:presence", members => members.some(member => member.id === viewer.memberId && member.drift === 0.25));
  viewer.socket.emit("sync:health", { rttMs: -1, clockOffsetMs: Number.NaN });
  viewer.socket.emit("sync:drift", { drift: 0.25 });
  const [membersWithDrift] = await drift;
  const healthAfterInvalidSample = membersWithDrift.find(member => member.id === viewer.memberId);
  assert.equal(healthAfterInvalidSample.rttMs, 120);
  assert.equal(healthAfterInvalidSample.clockOffsetMs, -32);

  const ended = eventOnce(host.socket, "room:state", state => state.reactionHighlights?.items?.length);
  host.socket.emit("playback:ended", { version: playingState.version });
  const [endState] = await ended;
  assert.equal(endState.reactionHighlights.title, "Integration test");
  assert.equal(endState.reactionHighlights.items[0].count, 2);
});

test("server enforces reaction rate limit (max 5 per 1000ms per socket) and preserves reaction id", async () => {
  const host = await connect("rate-host-0001");
  const { roomId } = await createRoom(host);
  const viewer = await connect("rate-viewer-0001");
  await joinRoom(viewer, roomId);

  let reactionsReceived = 0;
  viewer.socket.on("reaction", () => {
    reactionsReceived++;
  });

  const customId = "my-custom-reaction-id-123";
  const reactionWithIdPromise = eventOnce(viewer.socket, "reaction", r => r.id === customId);
  host.socket.emit("reaction:send", { emoji: "✨", id: customId });
  const [received] = await reactionWithIdPromise;
  assert.equal(received.id, customId);
  assert.equal(received.emoji, "✨");

  for (let i = 0; i < 8; i++) {
    viewer.socket.emit("reaction:send", { emoji: "😂", id: `burst-${i}` });
  }

  await new Promise(resolve => setTimeout(resolve, 250));

  // 1 from host + max 5 from viewer's rapid burst = 6
  assert.equal(reactionsReceived, 6);
});

test("sync-only rooms require a ready check, use a host countdown, and keep the clock host-controlled", async () => {
  const host = await connect("sync-only-host-0001");
  const { roomId } = await createRoom(host, {
    source: "https://www.netflix.com/title/80057281",
    control: "shared",
  });
  const viewer = await connect("sync-only-viewer-0001");
  await joinRoom(viewer, roomId);

  const immediateStartError = eventOnce(host.socket, "room:error");
  host.socket.emit("playback:update", { playing: true, position: 0, version: 0 });
  assert.equal((await immediateStartError)[0].code, "external-countdown-required");

  const readyError = eventOnce(host.socket, "room:error");
  host.socket.emit("external:countdown");
  assert.equal((await readyError)[0].code, "external-not-ready");

  const hostReady = eventOnce(host.socket, "room:presence", members => members.some(member => member.id === host.memberId && member.externalReady));
  host.socket.emit("external:ready", { ready: true });
  assert.ok((await hostReady)[0].some(member => member.id === host.memberId && member.externalReady));
  const viewerReady = eventOnce(host.socket, "room:presence", members => members.some(member => member.id === viewer.memberId && member.externalReady));
  viewer.socket.emit("external:ready", { ready: true });
  assert.ok((await viewerReady)[0].some(member => member.id === viewer.memberId && member.externalReady));

  const countdown = eventOnce(host.socket, "room:state", state => Boolean(state.externalCountdown));
  host.socket.emit("external:countdown");
  const [scheduled] = await countdown;
  assert.equal(scheduled.externalStarted, false);
  assert.equal(scheduled.playing, true);
  assert.ok(scheduled.externalCountdown.startsAt >= Date.now() + 2_500);

  const viewerHostError = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("external:countdown");
  assert.equal((await viewerHostError)[0].code, "host-only");

  const started = eventOnce(host.socket, "room:state", state => state.externalStarted, 4_000);
  const [running] = await started;
  assert.equal(running.playing, true);

  const pause = eventOnce(host.socket, "playback:state", state => !state.playing);
  host.socket.emit("playback:update", { playing: false, position: 4, version: running.version });
  const [paused] = await pause;
  const resume = eventOnce(host.socket, "playback:state", state => state.playing);
  host.socket.emit("playback:update", { playing: true, position: paused.position, version: paused.version });
  assert.equal((await resume)[0].playing, true);

  const viewerControlError = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("playback:update", { playing: false, position: 0, version: running.version });
  assert.equal((await viewerControlError)[0].code, "host-controls");
});

test("a new sync-only participant cancels a pending countdown and must rejoin the ready check", async () => {
  const host = await connect("countdown-host-0001");
  const { roomId } = await createRoom(host, { source: "https://www.netflix.com/title/80057281" });
  const viewer = await connect("countdown-viewer-0001");
  await joinRoom(viewer, roomId);
  host.socket.emit("external:ready", { ready: true });
  viewer.socket.emit("external:ready", { ready: true });
  await new Promise(resolve => setTimeout(resolve, 30));

  const countdown = eventOnce(host.socket, "room:state", state => Boolean(state.externalCountdown));
  host.socket.emit("external:countdown");
  await countdown;

  const lateViewer = await connect("countdown-late-0001");
  const lateState = await joinRoom(lateViewer, roomId);
  assert.equal(lateState.externalCountdown, null);
  assert.equal(lateState.externalStarted, false);
  assert.equal(lateState.playing, false);
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

test("host can change media source mid-room and peers receive updated config and reset state", async () => {
  const host = await connect("change-host-0001");
  const { roomId } = await createRoom(host);
  const guest = await connect("change-guest-0001");
  await joinRoom(guest, roomId);

  const newSource = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  const guestConfigUpdate = eventOnce(guest.socket, "room:config", config => config.source === newSource);
  const guestStateUpdate = eventOnce(guest.socket, "room:state", state => state.config.source === newSource);

  host.socket.emit("room:change-source", { title: "Blender Nature Short", source: newSource });

  const [receivedConfig] = await guestConfigUpdate;
  assert.equal(receivedConfig.source, newSource);
  assert.equal(receivedConfig.title, "Blender Nature Short");

  const [receivedState] = await guestStateUpdate;
  assert.equal(receivedState.config.source, newSource);
  assert.equal(receivedState.playing, false);
  assert.equal(receivedState.position, 0);
});

test("host or remote holder can start/stop screen sharing and relay WebRTC signals", async () => {
  const host = await connect("share-host-0001");
  const { roomId } = await createRoom(host);
  const guest = await connect("share-guest-0001");
  await joinRoom(guest, roomId);

  const sharingStatusPromise = eventOnce(guest.socket, "webrtc:sharing-status");
  host.socket.emit("webrtc:start-share", { title: "Host Screen" });
  const [sharingStatus] = await sharingStatusPromise;
  assert.equal(sharingStatus.sharerMemberId, host.memberId);
  assert.equal(sharingStatus.title, "Host Screen");

  const signalPromise = eventOnce(guest.socket, "webrtc:signal");
  host.socket.emit("webrtc:signal", {
    toMemberId: guest.memberId,
    signal: { type: "offer", offer: { sdp: "dummy-sdp", type: "offer" } },
  });
  const [receivedSignal] = await signalPromise;
  assert.equal(receivedSignal.fromMemberId, host.memberId);
  assert.equal(receivedSignal.signal.type, "offer");

  const stopStatusPromise = eventOnce(guest.socket, "webrtc:sharing-status");
  host.socket.emit("webrtc:stop-share");
  const [stopStatus] = await stopStatusPromise;
  assert.equal(stopStatus, null);
});

test("screen-share signals prevent hijacking by rejecting offers from non-sharers", async () => {
  const host = await connect("hijack-host-0001");
  const { roomId } = await createRoom(host, { control: "host" });
  const viewerA = await connect("hijack-viewer-a");
  await joinRoom(viewerA, roomId);
  const viewerB = await connect("hijack-viewer-b");
  await joinRoom(viewerB, roomId);

  const sharingStatusPromise = eventOnce(viewerA.socket, "webrtc:sharing-status");
  host.socket.emit("webrtc:start-share", { title: "Host Screen" });
  const [sharingStatus] = await sharingStatusPromise;
  assert.equal(sharingStatus.sharerMemberId, host.memberId);

  let viewerBReceivedOffer = false;
  const signalHandler = args => {
    if (args?.signal?.type === "offer" && args?.fromMemberId === viewerA.memberId) {
      viewerBReceivedOffer = true;
    }
  };
  viewerB.socket.on("webrtc:signal", signalHandler);

  viewerA.socket.emit("webrtc:signal", {
    toMemberId: viewerB.memberId,
    signal: { type: "offer", offer: { sdp: "hijack-sdp", type: "offer" } },
  });

  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(viewerBReceivedOffer, false);
  viewerB.socket.off("webrtc:signal", signalHandler);

  const realSignalPromise = eventOnce(viewerB.socket, "webrtc:signal");
  host.socket.emit("webrtc:signal", {
    toMemberId: viewerB.memberId,
    signal: { type: "offer", offer: { sdp: "legit-sdp", type: "offer" } },
  });
  const [receivedSignal] = await realSignalPromise;
  assert.equal(receivedSignal.fromMemberId, host.memberId);
  assert.equal(receivedSignal.signal.offer.sdp, "legit-sdp");
});

test("second sharer is rejected with already-sharing error while first sharer remains active", async () => {
  const host = await connect("share-limit-host");
  const { roomId } = await createRoom(host, { control: "shared" });
  const memberA = await connect("share-limit-a");
  await joinRoom(memberA, roomId);
  const memberB = await connect("share-limit-b");
  await joinRoom(memberB, roomId);

  const shareStatusPromise = eventOnce(memberB.socket, "webrtc:sharing-status");
  memberA.socket.emit("webrtc:start-share", { title: "Member A Screen" });
  const [shareStatus] = await shareStatusPromise;
  assert.equal(shareStatus.sharerMemberId, memberA.memberId);

  const errorPromise = eventOnce(memberB.socket, "room:error");
  memberB.socket.emit("webrtc:start-share", { title: "Member B Screen" });
  const [error] = await errorPromise;
  assert.equal(error.code, "already-sharing");

  const signalPromise = eventOnce(memberB.socket, "webrtc:signal");
  memberA.socket.emit("webrtc:signal", {
    toMemberId: memberB.memberId,
    signal: { type: "offer", offer: { sdp: "member-a-sdp", type: "offer" } },
  });
  const [relayed] = await signalPromise;
  assert.equal(relayed.fromMemberId, memberA.memberId);

  const clearPromise = eventOnce(memberA.socket, "webrtc:sharing-status");
  host.socket.emit("room:configure", { source: sampleUrl, control: "host" });
  const [cleared] = await clearPromise;
  assert.equal(cleared, null);
});

test("auto-advance into sync-only item sets playing to false and enables ready-check and countdown flow", async () => {
  const host = await connect("advance-host-0001");
  const { roomId } = await createRoom(host, { source: sampleUrl });
  const viewer = await connect("advance-viewer-0001");
  await joinRoom(viewer, roomId);

  const playingPromise = eventOnce(host.socket, "playback:state", state => state.playing);
  host.socket.emit("playback:update", { playing: true, position: 10, version: 0 });
  const [playingState] = await playingPromise;
  assert.equal(playingState.playing, true);

  const netflixSource = "https://www.netflix.com/watch/80100172";
  const queuePromise = eventOnce(host.socket, "playlist:state", list => list.length === 1);
  host.socket.emit("playlist:add", { title: "Netflix Feature", source: netflixSource });
  await queuePromise;

  const advancePromise = eventOnce(host.socket, "room:state", state => state.config.source === netflixSource);
  host.socket.emit("playback:ended", { version: playingState.version });
  const [advancedState] = await advancePromise;

  assert.equal(advancedState.config.source, netflixSource);
  assert.equal(advancedState.playing, false);
  assert.equal(advancedState.externalStarted, false);

  host.socket.emit("external:ready", { ready: true });
  viewer.socket.emit("external:ready", { ready: true });
  await new Promise(resolve => setTimeout(resolve, 50));

  const countdownPromise = eventOnce(host.socket, "room:state", state => Boolean(state.externalCountdown));
  host.socket.emit("external:countdown");
  const [scheduledState] = await countdownPromise;
  assert.equal(scheduledState.playing, true);
  assert.equal(scheduledState.externalStarted, false);
  assert.ok(scheduledState.externalCountdown.startsAt > Date.now());
});

test("server relays webrtc:request-offer only to current online sharer and drops invalid requests", async () => {
  const host = await connect("req-offer-host");
  const { roomId } = await createRoom(host);
  const viewerA = await connect("req-offer-viewer-a");
  await joinRoom(viewerA, roomId);
  const viewerB = await connect("req-offer-viewer-b");
  await joinRoom(viewerB, roomId);

  // Request when no screenShare exists is dropped
  let hostReceivedWhenNoShare = false;
  const noShareHandler = () => { hostReceivedWhenNoShare = true; };
  host.socket.on("webrtc:request-offer", noShareHandler);
  viewerA.socket.emit("webrtc:request-offer", { toMemberId: host.memberId });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(hostReceivedWhenNoShare, false);
  host.socket.off("webrtc:request-offer", noShareHandler);

  // Host starts screen share
  const sharingStatusPromise = eventOnce(viewerA.socket, "webrtc:sharing-status");
  host.socket.emit("webrtc:start-share", { title: "Host Screen" });
  await sharingStatusPromise;

  // Viewer A sends request-offer targeting a non-sharer (viewerB) -> receives nothing
  let viewerBReceivedRequest = false;
  const viewerBHandler = () => { viewerBReceivedRequest = true; };
  viewerB.socket.on("webrtc:request-offer", viewerBHandler);
  viewerA.socket.emit("webrtc:request-offer", { toMemberId: viewerB.memberId });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(viewerBReceivedRequest, false);
  viewerB.socket.off("webrtc:request-offer", viewerBHandler);

  // Viewer A sends request-offer targeting the legitimate sharer (host) -> receives { fromMemberId: viewerId }
  const hostRequestPromise = eventOnce(host.socket, "webrtc:request-offer");
  viewerA.socket.emit("webrtc:request-offer", { toMemberId: host.memberId });
  const [requestPayload] = await hostRequestPromise;
  assert.deepEqual(requestPayload, { fromMemberId: viewerA.memberId });
});

test("host sends heartbeat with version v, then pause with the same v, and the room ends paused", async () => {
  const host = await connect("pause-race-host");
  const { roomId } = await createRoom(host, { source: sampleUrl });
  const viewer = await connect("pause-race-viewer");
  await joinRoom(viewer, roomId);

  const playingPromise = eventOnce(host.socket, "playback:state", state => state.playing);
  host.socket.emit("playback:update", { playing: true, position: 10, version: 0 });
  const [playingState] = await playingPromise;
  assert.equal(playingState.playing, true);
  const v = playingState.version;

  const pausedPromise = eventOnce(host.socket, "playback:state", state => !state.playing);
  host.socket.emit("playback:update", { playing: true, position: 12, version: v, heartbeat: true });
  host.socket.emit("playback:update", { playing: false, position: 12, version: v });

  const [finalState] = await pausedPromise;
  assert.equal(finalState.playing, false);
});

test("source transition in sync-only room resets playback and ready check", async () => {
  const host = await connect("sync-trans-host-0001");
  const stream1 = "https://www.netflix.com/title/80057281";
  const stream2 = "https://www.primevideo.com/detail/0T8O5K1L";
  const { roomId } = await createRoom(host, { source: stream1 });
  const viewer = await connect("sync-trans-viewer-0001");
  await joinRoom(viewer, roomId);

  host.socket.emit("external:ready", { ready: true });
  viewer.socket.emit("external:ready", { ready: true });
  await new Promise(resolve => setTimeout(resolve, 50));

  const countdown = eventOnce(host.socket, "room:state", state => Boolean(state.externalCountdown));
  host.socket.emit("external:countdown");
  await countdown;

  const started = eventOnce(host.socket, "room:state", state => state.externalStarted, 4000);
  const [running] = await started;
  assert.equal(running.externalStarted, true);
  assert.equal(running.playing, true);

  const stream2StatePromise = eventOnce(host.socket, "room:state", state => state.config.source === stream2);
  host.socket.emit("room:change-source", { title: "Prime Video Title", source: stream2 });
  const [stream2State] = await stream2StatePromise;

  assert.equal(stream2State.config.source, stream2);
  assert.equal(stream2State.externalStarted, false);
  assert.equal(stream2State.playing, false);
  assert.equal(stream2State.position, 0);
});

test("second join with same memberId kicks first socket with session-replaced error", async () => {
  const memberId = "duplicate-member-001";
  const socket1 = await connect(memberId);
  const { roomId } = await createRoom(socket1);

  const replacedErrorPromise = eventOnce(socket1.socket, "room:error");

  const socket2 = await connect(memberId);
  await joinRoom(socket2, roomId);

  const [error] = await replacedErrorPromise;
  assert.equal(error.code, "session-replaced");
  assert.match(error.message, /another tab/);
});

test("room playing at 600s, set-title, then position and playing are unchanged", async () => {
  const host = await connect("set-title-host-001");
  const { roomId } = await createRoom(host, { source: sampleUrl });
  const viewer = await connect("set-title-viewer-001");
  await joinRoom(viewer, roomId);

  const playingPromise = eventOnce(host.socket, "playback:state", state => state.playing);
  host.socket.emit("playback:update", { playing: true, position: 600, version: 0 });
  const [playingState] = await playingPromise;
  assert.equal(playingState.playing, true);
  assert.ok(playingState.position >= 600 && playingState.position <= 602);
  const versionBefore = playingState.version;

  const configPromise = eventOnce(viewer.socket, "room:config");
  const statePromise = eventOnce(viewer.socket, "room:state");
  host.socket.emit("room:set-title", { title: "Custom Set Title", source: sampleUrl });

  const [newConfig] = await configPromise;
  assert.equal(newConfig.title, "Custom Set Title");

  const [newState] = await statePromise;
  assert.equal(newState.config.title, "Custom Set Title");
  assert.equal(newState.playing, true);
  assert.ok(newState.position >= 600 && newState.position <= 605);
  assert.equal(newState.version, versionBefore);
  assert.equal(newState.externalStarted, false);

  const errorPromise = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("room:set-title", { title: "Viewer Forbidden Title", source: sampleUrl });
  const [error] = await errorPromise;
  assert.equal(error.code, "host-controls");
});

test("set-title with a stale source leaves the title unchanged", async () => {
  const host = await connect("stale-source-title-host");
  const { roomId } = await createRoom(host, { source: sampleUrl, title: "Original Title" });

  let errorFired = false;
  const onError = () => { errorFired = true; };
  host.socket.on("room:error", onError);

  let configFired = false;
  const onConfig = () => { configFired = true; };
  host.socket.on("room:config", onConfig);

  host.socket.emit("room:set-title", { title: "Stale Source Title", source: "https://old.example/video.mp4" });
  await new Promise(resolve => setTimeout(resolve, 150));

  host.socket.off("room:error", onError);
  host.socket.off("room:config", onConfig);

  assert.equal(errorFired, false);
  assert.equal(configFired, false);

  const configPromise = eventOnce(host.socket, "room:config");
  host.socket.emit("room:set-title", { title: "Fresh Source Title", source: sampleUrl });
  const [newConfig] = await configPromise;
  assert.equal(newConfig.title, "Fresh Source Title");
});

test("when a stale heartbeat is dropped, emit roomSnapshot(room) to that socket at most once every 5s per socket", async () => {
  const host = await connect("stale-throttle-host");
  const { roomId } = await createRoom(host, { source: sampleUrl });

  let currentV = 0;
  for (let i = 1; i <= 3; i += 1) {
    const p = eventOnce(host.socket, "playback:state");
    host.socket.emit("playback:update", { playing: true, position: i * 10, version: currentV });
    const [st] = await p;
    currentV = st.version;
  }
  assert.ok(currentV >= 3);

  const firstSnapshotPromise = eventOnce(host.socket, "room:state");
  host.socket.emit("playback:update", { playing: true, position: 5, version: 1, heartbeat: true });
  const [snapshot] = await firstSnapshotPromise;
  assert.equal(snapshot.version, currentV);

  let secondSnapshotEmitted = false;
  const onState = () => { secondSnapshotEmitted = true; };
  host.socket.on("room:state", onState);
  host.socket.emit("playback:update", { playing: true, position: 5, version: 1, heartbeat: true });
  await new Promise(resolve => setTimeout(resolve, 200));
  host.socket.off("room:state", onState);
  assert.equal(secondSnapshotEmitted, false);
});



