import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { io } from "socket.io-client";

const [serverUrl = process.env.AFTERGLOW_URL || "http://localhost:3001", clientsArg = "10", commandsArg = "20"] = process.argv.slice(2);
const clientCount = Number(clientsArg);
const commandCount = Number(commandsArg);
const sockets = [];

function validateArguments() {
  if (!Number.isInteger(clientCount) || clientCount < 1 || clientCount > 20) {
    throw new Error("Client count must be an integer from 1 to 20.");
  }
  if (!Number.isInteger(commandCount) || commandCount < 1 || commandCount > 10_000) {
    throw new Error("Command count must be an integer from 1 to 10000.");
  }
}

function connectSocket(url) {
  const socket = io(url, { transports: ["websocket", "polling"], reconnection: false, timeout: 5_000 });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
    const onConnect = () => { cleanup(); resolve(socket); };
    const onError = error => { cleanup(); reject(error); };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
}

function waitForRoomJoin(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the room join response."));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("room:joined", onJoined);
      socket.off("room:error", onRoomError);
    };
    const onJoined = state => { cleanup(); resolve(state); };
    const onRoomError = error => { cleanup(); reject(new Error(error.message)); };
    socket.once("room:joined", onJoined);
    socket.once("room:error", onRoomError);
  });
}

function waitForPlayback(socket, version, startedAt) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("playback:state", onPlayback);
      reject(new Error(`Timed out waiting for playback version ${version}.`));
    }, 5_000);
    const onPlayback = state => {
      if (state.version !== version) return;
      clearTimeout(timeout);
      socket.off("playback:state", onPlayback);
      resolve(performance.now() - startedAt);
    };
    socket.on("playback:state", onPlayback);
  });
}

function waitForPresence(socket, memberId, online) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("room:presence", onPresence);
      reject(new Error(`Timed out waiting for member ${memberId} online=${online}.`));
    }, 5_000);
    const onPresence = members => {
      if (!members.some(member => member.id === memberId && member.online === online)) return;
      clearTimeout(timeout);
      socket.off("room:presence", onPresence);
      resolve();
    };
    socket.on("room:presence", onPresence);
  });
}

async function getLatencyMetrics(url) {
  const response = await fetch(new URL("/metrics/latency", url));
  if (!response.ok) throw new Error(`Latency metrics request failed with HTTP ${response.status}.`);
  return response.json();
}

function percentile(values, percentage) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentage * sorted.length) - 1];
}

async function run() {
  validateArguments();
  const roomId = `load-${randomUUID().slice(0, 12)}`;
  const hostSocket = await connectSocket(serverUrl);
  const hostIdentity = {
    memberId: `load-host-${randomUUID().replaceAll("-", "")}`,
    name: "Load-test host",
  };
  hostSocket.on("playback:state", (_state, acknowledge) => {
    if (typeof acknowledge === "function") acknowledge();
  });
  const joined = waitForRoomJoin(hostSocket);
  hostSocket.emit("room:create", {
    roomId,
    ...hostIdentity,
    title: "Load test",
    source: "https://example.com/load-test.mp4",
    control: "shared",
  });
  const created = await joined;
  let version = created.state.version;
  const participants = [{ socket: hostSocket, ...hostIdentity }];

  for (let index = 1; index < clientCount; index += 1) {
    const socket = await connectSocket(serverUrl);
    socket.on("playback:state", (_state, acknowledge) => {
      if (typeof acknowledge === "function") acknowledge();
    });
    const joinedRoom = waitForRoomJoin(socket);
    const identity = {
      memberId: `load-viewer-${String(index).padStart(2, "0")}-${randomUUID().slice(0, 8)}`,
      name: `Load-test viewer ${index}`,
    };
    socket.emit("room:join", {
      roomId,
      ...identity,
    });
    await joinedRoom;
    participants.push({ socket, ...identity });
  }

  const metricsBefore = await getLatencyMetrics(serverUrl);
  const propagationLatencies = [];
  for (let command = 0; command < commandCount; command += 1) {
    const nextVersion = version + 1;
    const startedAt = performance.now();
    const acknowledgements = participants.map(({ socket }) => waitForPlayback(socket, nextVersion, startedAt));
    hostSocket.emit("playback:update", {
      playing: command % 2 === 0,
      position: command,
      version,
      sentAt: Date.now(),
    });
    propagationLatencies.push(...await Promise.all(acknowledgements));
    version = nextVersion;
  }

  const simultaneousVersion = version + 1;
  const simultaneousStartedAt = performance.now();
  const simultaneousPropagation = participants.map(({ socket }) => waitForPlayback(socket, simultaneousVersion, simultaneousStartedAt));
  const simultaneousStatePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      hostSocket.off("playback:state", onState);
      reject(new Error("Timed out waiting for simultaneous command resolution."));
    }, 5_000);
    const onState = state => {
      if (state.version !== simultaneousVersion) return;
      clearTimeout(timeout);
      hostSocket.off("playback:state", onState);
      resolve(state);
    };
    hostSocket.on("playback:state", onState);
  });
  for (const [index, participant] of participants.entries()) {
    participant.socket.emit("playback:update", {
      playing: index % 2 === 0,
      position: commandCount + index,
      version,
      sentAt: Date.now(),
    });
  }
  const simultaneousLatencies = await Promise.all(simultaneousPropagation);
  const simultaneousState = await simultaneousStatePromise;
  version = simultaneousVersion;

  const reconnectTarget = participants.at(-1);
  const offlinePresence = waitForPresence(hostSocket, reconnectTarget.memberId, false);
  const disconnectedAt = performance.now();
  reconnectTarget.socket.disconnect();
  await offlinePresence;
  const replacement = await connectSocket(serverUrl);
  replacement.on("playback:state", (_state, acknowledge) => {
    if (typeof acknowledge === "function") acknowledge();
  });
  const onlinePresence = waitForPresence(hostSocket, reconnectTarget.memberId, true);
  const rejoined = waitForRoomJoin(replacement);
  replacement.emit("room:join", {
    roomId,
    memberId: reconnectTarget.memberId,
    name: reconnectTarget.name,
  });
  const rejoinedState = await rejoined;
  const reconnectDurationMs = performance.now() - disconnectedAt;
  await onlinePresence;
  participants[participants.length - 1] = { ...reconnectTarget, socket: replacement };
  const postReconnectVersion = version + 1;
  const postReconnectStartedAt = performance.now();
  const postReconnectPropagation = participants.map(({ socket }) => waitForPlayback(socket, postReconnectVersion, postReconnectStartedAt));
  hostSocket.emit("playback:update", {
    playing: true,
    position: commandCount + clientCount + 1,
    version,
    sentAt: Date.now(),
  });
  const postReconnectLatencies = await Promise.all(postReconnectPropagation);
  version = postReconnectVersion;

  const metricsDeadline = Date.now() + 5_000;
  let serverMetrics;
  do {
    serverMetrics = await getLatencyMetrics(serverUrl);
    if (serverMetrics.sampleCount > metricsBefore.sampleCount) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < metricsDeadline);
  if (serverMetrics.sampleCount <= metricsBefore.sampleCount) {
    throw new Error("The server did not record delivery latency for the load test.");
  }

  console.log(JSON.stringify({
    roomId,
    clients: clientCount,
    sequentialCommands: commandCount,
    simultaneousCommands: clientCount,
    concurrentConflictResolvedToSingleVersion: simultaneousState.version === simultaneousVersion
      && simultaneousState.telemetry.commands === commandCount + 1,
    forcedReconnect: {
      memberId: reconnectTarget.memberId,
      resumedAtVersion: rejoinedState.state.version,
      durationMs: reconnectDurationMs,
    },
    postReconnectCommandDeliveredToAll: postReconnectLatencies.length === clientCount,
    clientPropagationSamples: propagationLatencies.length,
    clientPropagationLatencyMs: {
      p50: percentile(propagationLatencies, 0.5),
      p95: percentile(propagationLatencies, 0.95),
      p99: percentile(propagationLatencies, 0.99),
    },
    simultaneousPropagationLatencyMs: {
      p50: percentile(simultaneousLatencies, 0.5),
      p95: percentile(simultaneousLatencies, 0.95),
      p99: percentile(simultaneousLatencies, 0.99),
    },
    postReconnectPropagationLatencyMs: {
      p50: percentile(postReconnectLatencies, 0.5),
      p95: percentile(postReconnectLatencies, 0.95),
      p99: percentile(postReconnectLatencies, 0.99),
    },
    serverDeliveryLatency: serverMetrics,
  }, null, 2));
}

try {
  await run();
} catch (error) {
  console.error(`Load test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
}
