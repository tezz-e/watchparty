import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLocalClockOffset, clampLocalClockOffset, correctionZone, createClockOffsetEstimator, estimateClockOffset, shouldSendHeartbeat } from "../src/utils/playbackSync.js";
import { createHtmlVideoPlayer } from "../src/player/htmlVideoPlayer.js";
import { desiredPosition } from "../src/utils/watchParty.js";

test("clock offset estimation accounts for client and server processing time", () => {
  assert.equal(estimateClockOffset({
    clientSentAt: 1000,
    serverReceivedAt: 1120,
    serverSentAt: 1124,
    clientReceivedAt: 1044,
  }), 100);
});

test("clock offset estimation rejects incomplete timestamp samples", () => {
  assert.equal(estimateClockOffset({
    clientSentAt: 1000,
    serverReceivedAt: 1120,
    serverSentAt: Number.NaN,
    clientReceivedAt: 1044,
  }), null);
});

test("clock offset estimator uses median offsets from the lowest-RTT samples", () => {
  const estimator = createClockOffsetEstimator({ lowestRttCount: 3 });
  const sample = (offsetMs, roundTripMs) => ({
    clientSentAt: 1000,
    serverReceivedAt: 1000 + offsetMs + roundTripMs / 2,
    serverSentAt: 1000 + offsetMs + roundTripMs / 2,
    clientReceivedAt: 1000 + roundTripMs,
  });

  assert.equal(estimator.add(sample(100, 80)), 100);
  assert.equal(estimator.add(sample(200, 10)), 150);
  assert.equal(estimator.add(sample(110, 20)), 110);
  assert.equal(estimator.add(sample(1000, 500)), 110);
});

test("playback correction classifies the three drift zones and boundaries", () => {
  assert.equal(correctionZone(0), "steady");
  assert.equal(correctionZone(0.08), "steady");
  assert.equal(correctionZone(-0.0801), "rate");
  assert.equal(correctionZone(0.5), "rate");
  assert.equal(correctionZone(-0.5001), "seek");
  assert.equal(correctionZone(Number.NaN), "steady");
});

test("players without playback-rate support stay steady inside tolerance and seek beyond it", () => {
  const youtubeCorrection = { supportsPlaybackRate: false, seekThreshold: 0.5 };
  assert.equal(correctionZone(0.5, youtubeCorrection), "steady");
  assert.equal(correctionZone(-0.5001, youtubeCorrection), "seek");
});

test("desired playback position uses the estimated server clock offset", () => {
  assert.equal(desiredPosition({ playing: true, position: 5, updatedAt: 1000 }, 1100, 200), 5.3);
});

test("sync-only local clock nudges are quarter-second steps bounded to fifteen seconds", () => {
  assert.equal(clampLocalClockOffset(2.12), 2);
  assert.equal(clampLocalClockOffset(18), 15);
  assert.equal(clampLocalClockOffset(-18), -15);
  assert.equal(applyLocalClockOffset(12, -2.5), 9.5);
  assert.equal(applyLocalClockOffset(1, -2), 0);
});

test("HTML video player adapter exposes playback controls", async () => {
  const element = {
    currentTime: 4,
    duration: 30,
    playbackRate: 1,
    play() { this.isPlaying = true; return Promise.resolve(); },
    pause() { this.isPlaying = false; },
  };
  const player = createHtmlVideoPlayer(element);

  assert.equal(player.currentTime(), 4);
  assert.equal(player.duration(), 30);
  player.seek(12);
  player.setPlaybackRate(1.04);
  await player.play();
  assert.equal(element.currentTime, 12);
  assert.equal(element.playbackRate, 1.04);
  assert.equal(element.isPlaying, true);
  player.pause();
  assert.equal(element.isPlaying, false);
});

test("shouldSendHeartbeat gates heartbeats based on host, readiness, buffering, drift, and interval", () => {
  const base = {
    hasRemote: true,
    playing: true,
    ready: true,
    buffering: false,
    drift: 0.2,
    isHost: true,
    lastHeartbeatAt: 1000,
    now: 3500,
  };

  assert.equal(shouldSendHeartbeat(base), true);
  assert.equal(shouldSendHeartbeat({ ...base, isHost: false }), false);
  assert.equal(shouldSendHeartbeat({ ...base, hasRemote: false }), false);
  assert.equal(shouldSendHeartbeat({ ...base, playing: false }), false);
  assert.equal(shouldSendHeartbeat({ ...base, ready: false }), false);
  assert.equal(shouldSendHeartbeat({ ...base, buffering: true }), false);
  assert.equal(shouldSendHeartbeat({ ...base, drift: 2.1 }), false);
  assert.equal(shouldSendHeartbeat({ ...base, drift: -2.5 }), false);
  assert.equal(shouldSendHeartbeat({ ...base, now: 2500 }), false);
});

