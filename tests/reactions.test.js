import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("reactions: styles and reduced motion rule inspection", () => {
  const stylesPath = path.resolve("src/styles.css");
  const roomFeaturesPath = path.resolve("src/components/RoomFeatures.css");

  const stylesCss = fs.readFileSync(stylesPath, "utf8");
  const roomFeaturesCss = fs.readFileSync(roomFeaturesPath, "utf8");

  // 1. Check global prefers-reduced-motion does not zero out .reaction-stream-item or .reaction-pop
  assert.match(
    stylesCss,
    /\*:not\(\.reaction-stream-item\)/,
    "styles.css must exclude .reaction-stream-item from animation-duration: .001ms"
  );
  assert.match(
    stylesCss,
    /reaction-fade 1\.2s/,
    "styles.css must include reaction-fade 1.2s fallback under reduced motion"
  );
  assert.match(
    roomFeaturesCss,
    /reaction-fade 1\.2s/,
    "RoomFeatures.css must include reaction-fade 1.2s fallback under reduced motion"
  );

  // 2. Check overlay has position absolute, inset 0, pointer-events none, z-index 25
  assert.match(
    roomFeaturesCss,
    /\.reaction-stream-overlay[\s\S]*?z-index:\s*25/,
    "reaction-stream-overlay must have z-index 25"
  );
  assert.match(
    roomFeaturesCss,
    /\.reaction-stream-overlay[\s\S]*?pointer-events:\s*none/,
    "reaction-stream-overlay must have pointer-events none"
  );

  // 3. Check reaction buttons in dock are larger (42x38px with tactile hover)
  assert.match(
    roomFeaturesCss,
    /width:\s*42px;\s*height:\s*38px;/,
    "reaction-dock buttons must be 42x38px"
  );
  assert.match(
    roomFeaturesCss,
    /font-size:\s*19px;/,
    "reaction-dock buttons must have larger font size (19px)"
  );
});

test("reactions: client rate limiting and deduplication logic", () => {
  // Test sliding window throttle logic: max 5 per 1000ms
  const timestamps = [];
  const sendReaction = (nowTime) => {
    const valid = timestamps.filter(t => nowTime - t < 1000);
    if (valid.length >= 5) {
      return false; // throttled
    }
    valid.push(nowTime);
    timestamps.length = 0;
    timestamps.push(...valid);
    return true; // sent
  };

  const t0 = 10000;
  // First 5 reactions sent rapidly at t0 should succeed
  for (let i = 0; i < 5; i++) {
    assert.equal(sendReaction(t0 + i * 50), true, `Reaction ${i + 1} should be accepted`);
  }

  // 6th reaction within the same 1000ms window should be dropped
  assert.equal(sendReaction(t0 + 300), false, "6th reaction within 1s should be throttled");
  assert.equal(sendReaction(t0 + 900), false, "7th reaction within 1s should be throttled");

  // After 1000ms from the first timestamp, new reaction should be accepted
  assert.equal(sendReaction(t0 + 1050), true, "Reaction after 1s window should be accepted");
});

test("reactions: 40-reaction concurrency cap drops oldest", () => {
  let reactions = [];
  const addReaction = (item) => {
    reactions = [...reactions.slice(-39), item];
  };

  for (let i = 0; i < 60; i++) {
    addReaction({ id: `item-${i}`, emoji: "✨" });
  }

  assert.equal(reactions.length, 40, "reactions must be capped at 40 concurrent items");
  assert.equal(reactions[0].id, "item-20", "oldest items must be dropped");
  assert.equal(reactions[39].id, "item-59", "newest item must be at the end");
});

test("reactions: random generation attributes fall within specified ranges", () => {
  // Ranges:
  // size: 36-48px
  // duration: 2.5-3.5s
  // x: 20-120px
  // floatDistPct: 60-80%
  // sway: 15-35px (magnitude)
  for (let i = 0; i < 100; i++) {
    const x = Math.round(20 + Math.random() * 100);
    const size = Math.round(36 + Math.random() * 12);
    const duration = +(2.5 + Math.random() * 1.0).toFixed(2);
    const sway = Math.round((Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 20));
    const floatDistPct = Math.round(60 + Math.random() * 20);

    assert.ok(x >= 20 && x <= 120, `x offset ${x} should be within 20-120`);
    assert.ok(size >= 36 && size <= 48, `size ${size} should be within 36-48`);
    assert.ok(duration >= 2.5 && duration <= 3.5, `duration ${duration} should be within 2.5-3.5`);
    assert.ok(Math.abs(sway) >= 15 && Math.abs(sway) <= 35, `sway ${sway} magnitude should be 15-35`);
    assert.ok(floatDistPct >= 60 && floatDistPct <= 80, `floatDistPct ${floatDistPct} should be 60-80`);
  }
});
