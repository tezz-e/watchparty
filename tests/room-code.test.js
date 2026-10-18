import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import { parseRoomCode, roomId } from "../src/utils/watchParty.js";

const serverFile = fileURLToPath(new URL("../server.js", import.meta.url));
let child;
let baseUrl;
let serverOutput = "";
const sockets = new Set();

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
      if (child.exitCode !== null) throw new Error(`Server exited (${child.exitCode}): ${serverOutput || error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become healthy: ${serverOutput}`);
}

function eventOnce(socket, name, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`Timed out waiting for socket event ${name}.`));
    }, timeoutMs);
    const handler = (...args) => {
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(args);
    };
    socket.on(name, handler);
  });
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      PORT: String(port),
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

after(() => {
  for (const s of sockets) {
    try { s.disconnect(); } catch {}
  }
  sockets.clear();
  if (child && child.exitCode === null) {
    child.kill();
  }
});

test("parseRoomCode: correctly handles lowercase code with room- prefix", () => {
  assert.equal(parseRoomCode("room-a1b2c3"), "room-a1b2c3");
  assert.equal(parseRoomCode("room-012345"), "room-012345");
  assert.equal(parseRoomCode("room-zzzzzz"), "room-zzzzzz");
});

test("parseRoomCode: correctly normalizes uppercase code with prefix", () => {
  assert.equal(parseRoomCode("ROOM-A1B2C3"), "room-a1b2c3");
  assert.equal(parseRoomCode("ROOM-XYZ789"), "room-xyz789");
  assert.equal(parseRoomCode("Room-AbCdEf"), "room-abcdef");
});

test("parseRoomCode: accepts 6-character code without prefix", () => {
  assert.equal(parseRoomCode("a1b2c3"), "room-a1b2c3");
  assert.equal(parseRoomCode("012345"), "room-012345");
  assert.equal(parseRoomCode("xyz789"), "room-xyz789");
});

test("parseRoomCode: normalizes uppercase 6-character code without prefix", () => {
  assert.equal(parseRoomCode("A1B2C3"), "room-a1b2c3");
  assert.equal(parseRoomCode("XYZ789"), "room-xyz789");
  assert.equal(parseRoomCode("AbCdEf"), "room-abcdef");
});

test("parseRoomCode: ignores leading, trailing, and around whitespace", () => {
  assert.equal(parseRoomCode("   room-a1b2c3   "), "room-a1b2c3");
  assert.equal(parseRoomCode("\t\nROOM-A1B2C3 \n "), "room-a1b2c3");
  assert.equal(parseRoomCode("   a1b2c3   "), "room-a1b2c3");
  assert.equal(parseRoomCode("  A1B2C3 \t "), "room-a1b2c3");
  assert.equal(parseRoomCode("room - a1b2c3"), "room-a1b2c3");
  assert.equal(parseRoomCode("  room-   a1b2c3  "), "room-a1b2c3");
});

test("parseRoomCode: extracts room ID from pasted invite URLs", () => {
  assert.equal(parseRoomCode("http://localhost:5173/?room=room-a1b2c3"), "room-a1b2c3");
  assert.equal(parseRoomCode("http://localhost:5173/?room=a1b2c3"), "room-a1b2c3");
  assert.equal(parseRoomCode("http://localhost:5173/?room=A1B2C3"), "room-a1b2c3");
  assert.equal(parseRoomCode("https://watchparty.example.com/app?other=1&room=ROOM-XYZ789#top"), "room-xyz789");
  assert.equal(parseRoomCode("https://watchparty.example.com/?room=%20a1b2c3%20"), "room-a1b2c3");
  assert.equal(parseRoomCode("https://watchparty.example.com/party?user=alice&room=room-k4m9p2&ref=chat"), "room-k4m9p2");
});

test("parseRoomCode: rejects invalid inputs returning null", () => {
  assert.equal(parseRoomCode(""), null);
  assert.equal(parseRoomCode("   "), null);
  assert.equal(parseRoomCode(null), null);
  assert.equal(parseRoomCode(undefined), null);
  assert.equal(parseRoomCode(123456), null);
  assert.equal(parseRoomCode({}), null);

  // Wrong length (too short or too long)
  assert.equal(parseRoomCode("room-12345"), null);
  assert.equal(parseRoomCode("room-1234567"), null);
  assert.equal(parseRoomCode("12345"), null);
  assert.equal(parseRoomCode("1234567"), null);
  assert.equal(parseRoomCode("room-"), null);

  // Invalid characters
  assert.equal(parseRoomCode("room-!@#$%^"), null);
  assert.equal(parseRoomCode("!@#$%^"), null);
  assert.equal(parseRoomCode("room-abc 12"), null);

  // URLs without valid room parameter
  assert.equal(parseRoomCode("http://localhost:5173/"), null);
  assert.equal(parseRoomCode("http://localhost:5173/?room="), null);
  assert.equal(parseRoomCode("http://localhost:5173/?room=invalid"), null);
  assert.equal(parseRoomCode("http://localhost:5173/?room=12345"), null);
  assert.equal(parseRoomCode("http://localhost:5173/?other=xyz"), null);
});

test("GET /api/rooms/:id returns 404 for unknown rooms", async () => {
  const response = await fetch(`${baseUrl}/api/rooms/room-nonexistent99`);
  assert.equal(response.status, 404);
  const data = await response.json();
  assert.deepEqual(data, { error: "Room not found" });
});

test("GET /api/rooms/:id returns room info when room exists", async () => {
  const testRoomId = `room-${Math.random().toString(36).slice(2, 8).padStart(6, "0")}`;
  const parsed = parseRoomCode(testRoomId);
  assert.equal(parsed, testRoomId);

  const clientSocket = io(baseUrl, { forceNew: true, reconnection: false, timeout: 2000 });
  sockets.add(clientSocket);
  await eventOnce(clientSocket, "connect");

  const joinedPromise = eventOnce(clientSocket, "room:joined");
  clientSocket.emit("room:create", {
    roomId: testRoomId,
    memberId: "test-host-member",
    name: "Host User",
    title: "Awesome Watch Party",
    source: "https://media.example/sample.mp4",
    control: "host",
  });
  await joinedPromise;

  // Verify GET /api/rooms/:id returns { exists: true, id: room.id, title: room.config.title }
  const response = await fetch(`${baseUrl}/api/rooms/${testRoomId}`);
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.exists, true);
  assert.equal(info.id, testRoomId);
  assert.equal(info.title, "Awesome Watch Party");

  // Verify uppercase lookup works against server
  const upperResponse = await fetch(`${baseUrl}/api/rooms/${testRoomId.toUpperCase()}`);
  assert.equal(upperResponse.status, 200);
  const upperInfo = await upperResponse.json();
  assert.equal(upperInfo.exists, true);
  assert.equal(upperInfo.id, testRoomId);
  assert.equal(upperInfo.title, "Awesome Watch Party");
});
