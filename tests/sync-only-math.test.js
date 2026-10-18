import assert from "node:assert/strict";
import { test } from "node:test";
import { compareSyncOffset, formatTimecode, parseTimecodeInput } from "../src/utils/syncOnlyMath.js";

test("formatTimecode formats mm:ss by default and hh:mm:ss when >= 1hr or forceHours is true", () => {
  assert.equal(formatTimecode(0), "00:00");
  assert.equal(formatTimecode(59), "00:59");
  assert.equal(formatTimecode(60), "01:00");
  assert.equal(formatTimecode(125), "02:05");
  assert.equal(formatTimecode(3600), "01:00:00");
  assert.equal(formatTimecode(3665), "01:01:05");

  // Force hours
  assert.equal(formatTimecode(0, true), "00:00:00");
  assert.equal(formatTimecode(125, true), "00:02:05");
  assert.equal(formatTimecode(125, { forceHours: true }), "00:02:05");
  assert.equal(formatTimecode(125, { standard: true }), "00:02:05");

  // Edge cases
  assert.equal(formatTimecode(-10), "00:00");
  assert.equal(formatTimecode(null), "00:00");
  assert.equal(formatTimecode(undefined), "00:00");
});

test("parseTimecodeInput parses various formats and rejects invalid strings", () => {
  // Numbers
  assert.equal(parseTimecodeInput(0), 0);
  assert.equal(parseTimecodeInput(45), 45);
  assert.equal(parseTimecodeInput("120"), 120);
  assert.equal(parseTimecodeInput("120s"), 120);

  // mm:ss
  assert.equal(parseTimecodeInput("00:00"), 0);
  assert.equal(parseTimecodeInput("45:00"), 2700);
  assert.equal(parseTimecodeInput("01:05"), 65);
  assert.equal(parseTimecodeInput("90:30"), 5430);

  // hh:mm:ss
  assert.equal(parseTimecodeInput("00:45:00"), 2700);
  assert.equal(parseTimecodeInput("01:15:30"), 4530);

  // Invalid cases
  assert.equal(parseTimecodeInput(""), null);
  assert.equal(parseTimecodeInput("   "), null);
  assert.equal(parseTimecodeInput(null), null);
  assert.equal(parseTimecodeInput(undefined), null);
  assert.equal(parseTimecodeInput(-5), null);
  assert.equal(parseTimecodeInput("invalid"), null);
  assert.equal(parseTimecodeInput("12:65"), null); // ss >= 60
  assert.equal(parseTimecodeInput("01:65:00"), null); // mm >= 60 in hh:mm:ss
});

test("compareSyncOffset correctly identifies in-sync, behind, and ahead states with instructions", () => {
  // Exactly equal
  const exact = compareSyncOffset(100, 100);
  assert.equal(exact.diff, 0);
  assert.equal(exact.diffAbs, 0);
  assert.equal(exact.status, "in-sync");
  assert.equal(exact.label, "In sync (±1s)");
  assert.equal(exact.instruction, "You are locked with the shared clock.");

  // Within ±1s
  const slightlyBehind = compareSyncOffset(99.5, 100);
  assert.equal(slightlyBehind.status, "in-sync");
  assert.equal(slightlyBehind.label, "In sync (±1s)");

  const slightlyAhead = compareSyncOffset(100.8, 100);
  assert.equal(slightlyAhead.status, "in-sync");
  assert.equal(slightlyAhead.label, "In sync (±1s)");

  // Behind by 5 seconds (diff = -5)
  const behind = compareSyncOffset(95, 100);
  assert.equal(behind.diff, -5);
  assert.equal(behind.diffAbs, 5);
  assert.equal(behind.status, "behind");
  assert.equal(behind.label, "You're 5s behind");
  assert.equal(behind.instruction, "Skip forward 5s or seek to 01:40");

  // Ahead by 10 seconds (diff = +10)
  const ahead = compareSyncOffset(110, 100);
  assert.equal(ahead.diff, 10);
  assert.equal(ahead.diffAbs, 10);
  assert.equal(ahead.status, "ahead");
  assert.equal(ahead.label, "You're 10s ahead");
  assert.equal(ahead.instruction, "Pause for 10s or seek to 01:40");
});
