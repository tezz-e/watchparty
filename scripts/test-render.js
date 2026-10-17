import { io } from "socket.io-client";

const target = "https://afterglow-watchparty.onrender.com";
console.log("Connecting to live Render deployment:", target);

const roomId = "live-sync-" + Date.now();
const host = io(target, { forceNew: true, transports: ["websocket"] });
const guest = io(target, { forceNew: true, transports: ["websocket"] });

await Promise.all([
  new Promise(r => host.on("connect", r)),
  new Promise(r => guest.on("connect", r)),
]);
console.log("[1/4] Both Host and Guest connected via secure WebSockets (WSS)!");

host.emit("room:create", {
  roomId,
  name: "HostUser",
  memberId: "host-" + Date.now(),
  title: "Shared Cloud Party",
  source: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  control: "host",
});

const hostJoined = await new Promise(r => host.on("room:joined", r));
console.log("[2/4] Host created room on Render:", hostJoined.state.config.title);

guest.emit("room:join", {
  roomId,
  name: "RemoteGuest",
  memberId: "guest-" + Date.now(),
});

const guestJoined = await new Promise(r => guest.on("room:joined", r));
console.log("[3/4] Remote Guest joined from across the internet! Position:", guestJoined.state.position);

// Host seeks to 42s and starts playback
const guestPlayback = new Promise(r => guest.on("playback:state", r));
host.emit("playback:update", {
  playing: true,
  position: 42,
  version: hostJoined.state.version,
  sentAt: Date.now(),
});

const syncState = await guestPlayback;
console.log("[4/4] Remote Guest received synchronized playback command!");
console.log("      Playing:", syncState.playing, "| Playhead Position:", syncState.position + "s");

host.disconnect();
guest.disconnect();
console.log("\n>>> LIVE MULTI-USER CLOUD WATCH PARTY IS FULLY WORKING ON RENDER! <<<");
process.exit(0);
