import assert from "node:assert/strict";
import { test } from "node:test";
import { canPublishScreen, createLiveKitService } from "../server/livekit.js";

const credentials = {
  LIVEKIT_URL: "wss://livekit.example.test/",
  LIVEKIT_API_KEY: "test-key",
  LIVEKIT_API_SECRET: "test-secret-that-is-not-used-outside-tests",
};

function tokenClaims(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

test("LiveKit configuration requires a valid signaling URL and both credentials", () => {
  assert.equal(createLiveKitService({ ...credentials, LIVEKIT_API_SECRET: "" }).enabled, false);
  assert.equal(createLiveKitService({ ...credentials, LIVEKIT_URL: "https://livekit.example.test" }).enabled, false);
  assert.equal(createLiveKitService(credentials).enabled, true);
});

test("screen-share permission is host-only unless room control is shared", () => {
  const room = { hostId: "host-001", config: { control: "host" } };
  assert.equal(canPublishScreen(room, "host-001"), true);
  assert.equal(canPublishScreen(room, "guest-001"), false);
  room.config.control = "shared";
  assert.equal(canPublishScreen(room, "guest-001"), true);
});

test("LiveKit tickets are one-use and tokens only grant screen-share publishing", async () => {
  const service = createLiveKitService(credentials);
  const ticket = service.issueTicket({
    roomId: "room-001",
    memberId: "member-001",
    name: "Test member",
    canPublish: true,
  });
  const token = await service.createToken(ticket, () => ({ name: "Test member", canPublish: true }));
  assert.equal(token.url, "wss://livekit.example.test");
  assert.equal(token.canPublish, true);
  assert.deepEqual(tokenClaims(token.token).video, {
    roomJoin: true,
    room: "room-001",
    canSubscribe: true,
    canPublish: true,
    canPublishSources: ["screen_share"],
    canPublishData: false,
  });
  assert.equal(await service.createToken(ticket), null);
});

test("ticket redemption rechecks membership and current publish permission", async () => {
  const service = createLiveKitService(credentials);
  const ticket = service.issueTicket({
    roomId: "room-001",
    memberId: "member-002",
    name: "Guest",
    canPublish: true,
  });
  const token = await service.createToken(ticket, () => ({ name: "Guest", canPublish: false }));
  assert.equal(token.canPublish, false);
  assert.equal(tokenClaims(token.token).video.canPublish, false);
  assert.deepEqual(tokenClaims(token.token).video.canPublishSources, []);

  const staleTicket = service.issueTicket({
    roomId: "room-001",
    memberId: "member-003",
    name: "Departed guest",
    canPublish: false,
  });
  assert.equal(await service.createToken(staleTicket, () => null), null);
});

test("expired tickets cannot be exchanged for LiveKit credentials", async () => {
  let clock = 1000;
  const service = createLiveKitService(credentials, () => clock);
  const ticket = service.issueTicket({
    roomId: "room-001",
    memberId: "member-004",
    name: "Guest",
    canPublish: false,
  });
  clock += 30_001;
  assert.equal(await service.createToken(ticket), null);
});
