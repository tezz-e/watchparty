import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createYoutubePlayer } from "../src/player/youtubePlayer.js";
import { handlePlayerStateChange } from "../src/utils/playbackSync.js";

class FakeYTPlayer {
  constructor(container, options) {
    this.options = options;
    this.time = 0;
    this.state = -1;
    queueMicrotask(() => options.events?.onReady?.({ target: this }));
  }
  getIframe() { return { style: {} }; }
  getCurrentTime() { return this.time; }
  getDuration() { return 120; }
  getPlayerState() { return this.state; }
  seekTo(position) { this.time = position; }
  setPlaybackRate() {}
  playVideo() { this.emit(1); }
  pauseVideo() { this.emit(2); }
  emit(state) { this.state = state; this.options.events?.onStateChange?.({ data: state }); }
  destroy() {}
}

async function setup({ hasRemote, roomPlaying, roomPosition = 10 }) {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const calls = { remotePlay: [], remotePause: [] };
  let yt;
  const room = { playing: roomPlaying };
  const player = createYoutubePlayer({}, "dQw4w9WgXcQ", {
    loadApi: async () => ({ Player: function (container, options) { yt = new FakeYTPlayer(container, options); return yt; } }),
    onStateChange: event => handlePlayerStateChange({
      eventState: event.data,
      roomPlaying: room.playing,
      roomPosition,
      hasRemote,
      player,
      onRemotePlay: pos => calls.remotePlay.push(pos),
      onRemotePause: pos => calls.remotePause.push(pos),
    }),
  });
  await player.ready;
  await Promise.resolve();
  return { player, yt, calls, room };
}

afterEach(() => {
  mock.timers.reset();
});

test("host clicking play inside the embed on a paused room is sent to the room", async () => {
  const { player, yt, calls } = await setup({ hasRemote: true, roomPlaying: false });
  player.pause();
  mock.timers.tick(5_000);
  yt.time = 10;
  yt.emit(3);
  yt.emit(1);
  assert.deepEqual(calls.remotePlay, [10]);
  assert.equal(yt.state, 1, "the embed must stay playing");
});

test("host: a play event right after our own pause/seek is still undone", async () => {
  const { player, yt, calls } = await setup({ hasRemote: true, roomPlaying: false });
  player.pause();
  player.seek(10);
  yt.emit(1);
  assert.deepEqual(calls.remotePlay, []);
  assert.equal(yt.state, 2);
});

test("attendee clicking play inside the embed on a paused room is undone", async () => {
  const { player, yt, calls } = await setup({ hasRemote: false, roomPlaying: false });
  player.pause();
  mock.timers.tick(5_000);
  yt.emit(3);
  yt.emit(1);
  assert.deepEqual(calls.remotePlay, []);
  assert.equal(yt.state, 2);
});

test("host clicking pause inside the embed on a playing room is sent to the room", async () => {
  const { player, yt, calls } = await setup({ hasRemote: true, roomPlaying: true });
  player.play();
  mock.timers.tick(5_000);
  yt.time = 42;
  yt.emit(2);
  assert.deepEqual(calls.remotePause, [42]);
});

test("attendee clicking pause inside the embed on a playing room resumes", async () => {
  const { player, yt, calls } = await setup({ hasRemote: false, roomPlaying: true });
  player.play();
  mock.timers.tick(5_000);
  yt.emit(2);
  assert.deepEqual(calls.remotePause, []);
  assert.equal(yt.state, 1);
});
