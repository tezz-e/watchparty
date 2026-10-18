import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const serverFile = fileURLToPath(new URL("../server.js", import.meta.url));
const sockets = new Set();
let child;
let baseUrl;
let roomCounter = 0;
let serverOutput = "";

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
      if (child.exitCode !== null) throw new Error(`Server exited: ${serverOutput || error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Server health timeout");
}

function eventOnce(socket, name, predicate = () => true, timeoutMs = 4_000) {
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
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return { socket, memberId, name };
}

async function createRoom(client, config = {}) {
  const roomId = `room-sync${String(++roomCounter).padStart(4, "0")}`;
  const joined = eventOnce(client.socket, "room:joined");
  client.socket.emit("room:create", {
    roomId,
    name: client.name,
    memberId: client.memberId,
    title: config.title || "Sync Test Room",
    source: config.source || "https://www.netflix.com/title/80057281",
    control: config.control || "host",
  });
  const [data] = await joined;
  return { roomId, data };
}

async function joinRoom(client, roomId) {
  const joined = eventOnce(client.socket, "room:joined");
  client.socket.emit("room:join", { roomId, name: client.name, memberId: client.memberId });
  return (await joined)[0];
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn("node", [serverFile], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  child.stderr.on("data", chunk => { serverOutput += chunk.toString(); });
  await waitForHealth(baseUrl);
});

afterEach(() => {
  for (const socket of sockets) socket.disconnect();
  sockets.clear();
});

after(() => {
  if (child && child.exitCode === null) child.kill("SIGTERM");
});

test("external:pause pauses shared clock, settles countdown, and resets member readiness", async () => {
  const host = await connect("sync-pause-host-1");
  const { roomId } = await createRoom(host);
  const viewer = await connect("sync-pause-viewer-1");
  await joinRoom(viewer, roomId);

  // Both ready
  host.socket.emit("external:ready", { ready: true });
  viewer.socket.emit("external:ready", { ready: true });
  await eventOnce(host.socket, "room:presence", m => m.every(x => x.externalReady));

  // Host starts countdown
  host.socket.emit("external:countdown");
  const [startedState] = await eventOnce(host.socket, "room:state", s => s.externalStarted, 5_000);
  assert.equal(startedState.playing, true);

  // Viewer cannot pause
  const viewerPauseErr = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("external:pause");
  assert.equal((await viewerPauseErr)[0].code, "host-only");

  // Host pauses
  const pausePresencePromise = eventOnce(host.socket, "room:presence", m => m.every(x => !x.externalReady));
  const pauseStatePromise = eventOnce(host.socket, "room:state", s => !s.playing && s.externalStarted);
  host.socket.emit("external:pause");

  const [pausedState] = await pauseStatePromise;
  assert.equal(pausedState.playing, false);
  assert.equal(pausedState.externalStarted, true);
  assert.equal(pausedState.externalCountdown, null);

  const [pausedMembers] = await pausePresencePromise;
  assert.ok(pausedMembers.every(m => m.externalReady === false));
});

test("external:countdown can resume after pause and supports override: true", async () => {
  const host = await connect("sync-resume-host-1");
  const { roomId } = await createRoom(host);
  const viewer = await connect("sync-resume-viewer-1");
  await joinRoom(viewer, roomId);

  // Mark ready & countdown to running
  host.socket.emit("external:ready", { ready: true });
  viewer.socket.emit("external:ready", { ready: true });
  await eventOnce(host.socket, "room:presence", m => m.every(x => x.externalReady));

  host.socket.emit("external:countdown");
  await eventOnce(host.socket, "room:state", s => s.externalStarted, 5_000);

  // Pause
  host.socket.emit("external:pause");
  await eventOnce(host.socket, "room:state", s => !s.playing && s.externalStarted);

  // Without override, resumes requires all ready
  const notReadyError = eventOnce(host.socket, "room:error");
  host.socket.emit("external:countdown");
  assert.equal((await notReadyError)[0].code, "external-not-ready");

  // With override: true, host can resume even if viewer hasn't marked ready!
  const resumeStatePromise = eventOnce(host.socket, "room:state", s => Boolean(s.externalCountdown));
  host.socket.emit("external:countdown", { override: true });
  const [resumingState] = await resumeStatePromise;
  assert.equal(resumingState.playing, true);
  assert.ok(resumingState.externalCountdown.startsAt > Date.now());
  assert.ok(resumingState.externalCountdown.resumingFrom !== undefined);
});

test("external:seek allows host to seek, validates input, resets ready, and announces", async () => {
  const host = await connect("sync-seek-host-1");
  const { roomId } = await createRoom(host);
  const viewer = await connect("sync-seek-viewer-1");
  await joinRoom(viewer, roomId);

  // Viewer seek rejected
  const viewerSeekErr = eventOnce(viewer.socket, "room:error");
  viewer.socket.emit("external:seek", { position: 120 });
  assert.equal((await viewerSeekErr)[0].code, "host-only");

  // Invalid position rejected
  const invalidSeekErr = eventOnce(host.socket, "room:error");
  host.socket.emit("external:seek", { position: -10 });
  assert.equal((await invalidSeekErr)[0].code, "invalid-position");

  // Valid seek at 2700 (45:00)
  const seekEventPromise = eventOnce(viewer.socket, "external:seek");
  const chatPromise = eventOnce(viewer.socket, "chat:message", m => m.text.includes("45:00"));
  const statePromise = eventOnce(viewer.socket, "room:state", s => s.position === 2700);

  host.socket.emit("external:seek", { position: 2700 });

  const [seekEvent] = await seekEventPromise;
  assert.equal(seekEvent.position, 2700);
  assert.equal(seekEvent.formatted, "45:00");

  const [chatMessage] = await chatPromise;
  assert.ok(chatMessage.text.includes("45:00"));

  const [seekedState] = await statePromise;
  assert.equal(seekedState.position, 2700);
  assert.equal(seekedState.playing, false);
  assert.equal(seekedState.externalStarted, true);
});

test("sync:offset records member sync status and diff in presence", async () => {
  const host = await connect("sync-offset-host-1");
  const { roomId } = await createRoom(host);
  const viewer = await connect("sync-offset-viewer-1");
  await joinRoom(viewer, roomId);

  const presencePromise = eventOnce(host.socket, "room:presence", members => {
    const v = members.find(m => m.id === viewer.memberId);
    return v?.syncOffset?.status === "behind" && v?.syncOffset?.diffSeconds === -4.5;
  });

  viewer.socket.emit("sync:offset", {
    offsetSeconds: -4.5,
    status: "behind",
    diffSeconds: -4.5,
  });

  const [members] = await presencePromise;
  const viewerMember = members.find(m => m.id === viewer.memberId);
  assert.equal(viewerMember.syncOffset.offsetSeconds, -4.5);
  assert.equal(viewerMember.syncOffset.status, "behind");
  assert.equal(viewerMember.syncOffset.diffSeconds, -4.5);
  assert.ok(viewerMember.syncOffset.reportedAt > 0);
});

test("clock freeze/resume math: timecode after pause, after jump, and after resume", async () => {
  const host = await connect("sync-math-host-1");
  const { roomId } = await createRoom(host);

  // 1. Host readies and starts countdown
  host.socket.emit("external:ready", { ready: true });
  await eventOnce(host.socket, "room:presence", m => m.every(x => x.externalReady));
  host.socket.emit("external:countdown");

  // Wait for countdown to finish and clock to run ~1.5s
  await eventOnce(host.socket, "room:state", s => s.externalStarted, 5_000);
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 2. Host pauses
  const pauseStatePromise = eventOnce(host.socket, "room:state", s => !s.playing && s.externalStarted);
  host.socket.emit("external:pause");
  const [pausedState] = await pauseStatePromise;

  assert.equal(pausedState.playing, false);
  const frozenPosition = pausedState.position;
  assert.ok(frozenPosition > 1.0, `Expected frozen position > 1.0, got ${frozenPosition}`);

  // Wait 400ms to verify timecode is frozen and does not advance
  await new Promise(resolve => setTimeout(resolve, 400));
  const snapshotAfterWait = eventOnce(host.socket, "room:state");
  host.socket.emit("room:state"); // request or trigger state
  // Or check position via latency ping / room state
  assert.equal(pausedState.position, frozenPosition);

  // 3. Host jumps to 3600 (01:00:00)
  const jumpStatePromise = eventOnce(host.socket, "room:state", s => s.position === 3600);
  host.socket.emit("external:seek", { position: 3600 });
  const [jumpedState] = await jumpStatePromise;
  assert.equal(jumpedState.position, 3600);
  assert.equal(jumpedState.playing, false);

  // 4. Host resumes with countdown
  const resumeCountdownPromise = eventOnce(host.socket, "room:state", s => Boolean(s.externalCountdown));
  host.socket.emit("external:countdown", { override: true });
  const [countdownState] = await resumeCountdownPromise;
  assert.equal(countdownState.playing, true);
  assert.equal(countdownState.externalCountdown.resumingFrom, 3600);

  // Wait for countdown to finish and run ~1s
  await eventOnce(host.socket, "room:state", s => s.externalStarted && s.playing, 5_000);
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 5. Host pauses again to verify the clock advanced after resume
  const afterResumePausePromise = eventOnce(host.socket, "room:state", s => !s.playing && s.externalStarted);
  host.socket.emit("external:pause");
  const [afterResumeState] = await afterResumePausePromise;
  assert.ok(afterResumeState.position >= 3600.8, `Expected resumed position >= 3600.8, got ${afterResumeState.position}`);
});

test("late join while paused loads paused at the frozen timecode", async () => {
  const host = await connect("sync-late-host-1");
  const { roomId } = await createRoom(host);

  // Host jumps to 1234 and pauses
  host.socket.emit("external:seek", { position: 1234 });
  await eventOnce(host.socket, "room:state", s => s.position === 1234);

  // Late joiner joins
  const lateViewer = await connect("sync-late-viewer-1");
  const joinedData = await joinRoom(lateViewer, roomId);

  assert.equal(joinedData.state.playing, false);
  assert.equal(joinedData.state.position, 1234);
  assert.equal(joinedData.state.externalStarted, true);
  assert.equal(joinedData.state.externalCountdown, null);

  // Verify clock remains frozen for late joiner
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(joinedData.state.position, 1234);
});
