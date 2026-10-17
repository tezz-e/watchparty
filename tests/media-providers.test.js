import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaProvider, validMediaUrl, youtubeVideoId } from "../shared/media.js";
import { createYoutubePlayer, youtubeErrorMessage } from "../src/player/youtubePlayer.js";

const videoId = "dQw4w9WgXcQ";

test("YouTube URL detection supports watch, short, shorts, embed, and live links", () => {
  for (const source of [
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube.com/live/${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
  ]) {
    assert.equal(youtubeVideoId(source), videoId);
    assert.equal(mediaProvider(source), "youtube");
    assert.equal(validMediaUrl(source), true);
  }
});

test("media URL validation rejects malformed or deceptive YouTube links", () => {
  for (const source of [
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    `https://youtube.com@evil.example/watch?v=${videoId}`,
    `javascript://youtube.com/watch?v=${videoId}`,
    "https://youtu.be/not-a-valid-id",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=invalid",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ/extra",
    "not a url",
  ]) {
    assert.equal(youtubeVideoId(source), null, source);
    assert.equal(validMediaUrl(source), false, source);
  }

  assert.equal(mediaProvider("https://cdn.example/video.MP4?token=abc"), "url");
  assert.equal(validMediaUrl("https://cdn.example/video.webm"), true);
  assert.equal(validMediaUrl("https://cdn.example/page"), false);
  assert.equal(validMediaUrl("https://cdn.example/video.m3u8"), false);
});

test("YouTube player adapter exposes seek, play, pause and ready state callbacks", async () => {
  let playerOptions;
  let instance;
  class FakePlayer {
    constructor(_container, options) {
      playerOptions = options;
      instance = this;
      this.time = 3;
      this.durationSeconds = 90;
      this.frame = { style: {} };
    }
    getIframe() { return this.frame; }
    getCurrentTime() { return this.time; }
    getDuration() { return this.durationSeconds; }
    seekTo(position) { this.time = position; }
    setPlaybackRate(rate) { this.rate = rate; }
    playVideo() { this.playing = true; }
    pauseVideo() { this.playing = false; }
    destroy() { this.destroyed = true; }
  }
  const states = [];
  let ready = false;
  const adapter = createYoutubePlayer({}, videoId, {
    loadApi: async () => ({ Player: FakePlayer }),
    onReady: () => { ready = true; },
    onStateChange: event => states.push(event.data),
  });
  await adapter.ready;
  playerOptions.events.onReady({ target: instance });

  assert.equal(ready, true);
  assert.equal(playerOptions.playerVars.controls, 0);
  assert.equal(instance.frame.style.width, "100%");
  assert.equal(adapter.currentTime(), 3);
  assert.equal(adapter.duration(), 90);
  adapter.seek(12);
  adapter.setPlaybackRate(1);
  adapter.play();
  assert.equal(adapter.currentTime(), 12);
  assert.equal(instance.rate, 1);
  assert.equal(instance.playing, true);
  playerOptions.events.onStateChange({ data: 3 });
  assert.deepEqual(states, [3]);
  adapter.pause();
  assert.equal(instance.playing, false);
  adapter.destroy();
  assert.equal(instance.destroyed, true);
});

test("YouTube embedding restrictions have a clear explanation", () => {
  assert.match(youtubeErrorMessage(101), /disabled playback on other websites/);
  assert.match(youtubeErrorMessage(150), /disabled playback on other websites/);
});
