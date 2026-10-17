import assert from "node:assert/strict";
import { test } from "node:test";
import { isMixedContent, mediaProvider, streamingPlatform, validMediaUrl, youtubeVideoId } from "../shared/media.js";
import { createHlsPlayer, hlsErrorMessage } from "../src/player/hlsPlayer.js";
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
  assert.equal(validMediaUrl("https://cdn.example/video.m3u8"), true);
});

test("URL auto-detection selects HLS and recognized streaming services only", () => {
  assert.equal(mediaProvider("https://media.example/live/master.m3u8?token=abc"), "hls");
  assert.equal(mediaProvider("https://cdn.example/movie.mp4?token=abc"), "url");
  assert.equal(mediaProvider(`https://www.youtube.com/watch?v=${videoId}`), "youtube");
  assert.equal(mediaProvider("https://www.netflix.com/title/80057281"), "external");
  assert.equal(streamingPlatform("https://www.netflix.com/title/80057281")?.name, "Netflix");
  assert.equal(streamingPlatform("https://www.primevideo.com/detail/example")?.name, "Prime Video");
  assert.equal(streamingPlatform("https://www.amazon.com/gp/video/detail/example")?.name, "Prime Video");
  assert.equal(streamingPlatform("https://www.amazon.com/dp/example"), null);
  assert.equal(streamingPlatform("https://www.disneyplus.com/movies/example")?.name, "Disney+");
  assert.equal(streamingPlatform("https://www.max.com/movies/example")?.name, "Max");
  assert.equal(mediaProvider("https://netflix.com.attacker.example/title/123"), null);
  assert.equal(mediaProvider("https://attacker.example/?next=https://netflix.com/title/123"), null);
  assert.equal(mediaProvider("ftp://media.example/master.m3u8"), null);
});

test("mixed-content detection identifies HTTP media on HTTPS pages", () => {
  assert.equal(isMixedContent("http://media.example/live.m3u8", "https:"), true);
  assert.equal(isMixedContent("https://media.example/live.m3u8", "https:"), false);
  assert.equal(isMixedContent("http://media.example/live.m3u8", "http:"), false);
});

test("HLS player adapter attaches Hls.js, reports fatal CORS errors and destroys listeners", async () => {
  const listeners = new Map();
  const element = {
    currentTime: 4,
    duration: 100,
    playbackRate: 1,
    canPlayType: () => "",
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    play() { return Promise.resolve(); },
    pause() {},
  };
  const errors = [];
  let hlsInstance;
  class FakeHls {
    static Events = { ERROR: "hlsError" };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    static isSupported() { return true; }
    constructor() { hlsInstance = this; }
    on(event, callback) { this.event = event; this.onError = callback; }
    attachMedia(media) { this.media = media; }
    loadSource(source) { this.source = source; }
    destroy() { this.destroyed = true; }
  }

  const player = createHlsPlayer(element, "https://media.example/master.m3u8", {
    HlsConstructor: FakeHls,
    onError: code => errors.push(code),
  });
  await player.ready;
  assert.equal(hlsInstance.media, element);
  assert.equal(hlsInstance.source, "https://media.example/master.m3u8");
  hlsInstance.onError("hlsError", { fatal: true, type: "networkError" });
  assert.deepEqual(errors, ["hls-cors"]);
  player.destroy();
  assert.equal(hlsInstance.destroyed, true);
  assert.equal(listeners.size, 0);
  assert.match(hlsErrorMessage("hls-cors"), /CORS headers/);
});

test("HLS player adapter uses native playback when supported", async () => {
  const calls = [];
  const element = {
    canPlayType: () => "probably",
    addEventListener: () => {},
    removeEventListener: () => {},
    load: () => calls.push("load"),
    pause: () => calls.push("pause"),
    removeAttribute: name => calls.push(`remove:${name}`),
  };
  const player = createHlsPlayer(element, "https://media.example/native.m3u8", {
    HlsConstructor: { isSupported: () => { throw new Error("native branch should not initialize Hls.js"); } },
  });
  await player.ready;
  assert.equal(element.src, "https://media.example/native.m3u8");
  assert.deepEqual(calls, ["load"]);
  player.destroy();
  assert.deepEqual(calls, ["load", "pause", "remove:src", "load"]);
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
