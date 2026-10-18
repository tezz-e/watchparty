import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CompanionCueManager,
  FALLBACK_PIP_EXPLANATION,
  createWakeLockController,
  formatTimecodeSpeech,
  getSyncGuideDismissed,
  getSyncRoomTabTitle,
  isDocumentPipSupported,
  openDocumentPictureInPicture,
  setSyncGuideDismissed,
  triggerVibration,
} from "../src/utils/companionCues.js";

test("getSyncRoomTabTitle formats tab titles correctly for sync-only states", () => {
  // Non-sync only room
  assert.equal(
    getSyncRoomTabTitle({ isSyncOnly: false, isPlaying: true, position: 100 }),
    "Afterglow — Watch together"
  );

  // Sync only - countdown active
  assert.equal(
    getSyncRoomTabTitle({ isSyncOnly: true, isCountdown: true, isPlaying: false, position: 0 }),
    "3… 2… 1… GO! · Afterglow"
  );
  assert.equal(
    getSyncRoomTabTitle({ isSyncOnly: true, isCountdown: true, isPlaying: true, position: 50 }),
    "3… 2… 1… GO! · Afterglow"
  );

  // Sync only - paused at 00:00
  assert.equal(
    getSyncRoomTabTitle({ isSyncOnly: true, isCountdown: false, isPlaying: false, position: 0 }),
    "⏸ PAUSED 0:00 · Afterglow"
  );

  // Sync only - paused at 1:15
  assert.equal(
    getSyncRoomTabTitle({ isSyncOnly: true, isCountdown: false, isPlaying: false, position: 75 }),
    "⏸ PAUSED 1:15 · Afterglow"
  );

  // Sync only - playing at 2:30
  assert.equal(
    getSyncRoomTabTitle({ isSyncOnly: true, isCountdown: false, isPlaying: true, position: 150 }),
    "▶ 2:30 · Afterglow"
  );
});

test("formatTimecodeSpeech formats spoken timecodes clearly", () => {
  assert.equal(formatTimecodeSpeech(0), "0 seconds");
  assert.equal(formatTimecodeSpeech(45), "45 seconds");
  assert.equal(formatTimecodeSpeech(75), "1 minute, 15 seconds");
  assert.equal(formatTimecodeSpeech(3665), "1 hour, 1 minute, 5 seconds");
});

test("FALLBACK_PIP_EXPLANATION contains the required clear fallback message", () => {
  assert.equal(
    FALLBACK_PIP_EXPLANATION,
    "Floating timer requires Chrome or Edge 111+ on desktop. Tip: use a side-by-side window or open Afterglow on your phone as a remote!"
  );
});

test("isDocumentPipSupported returns false in headless node without errors", () => {
  assert.equal(isDocumentPipSupported(), false);
});

test("openDocumentPictureInPicture rejects with explanation in unsupported environments", async () => {
  await assert.rejects(
    async () => {
      await openDocumentPictureInPicture();
    },
    {
      message: FALLBACK_PIP_EXPLANATION,
    }
  );
});

test("CompanionCueManager handles lifecycle and scheduling safely in node environment", () => {
  const manager = new CompanionCueManager();
  assert.equal(manager.soundEnabled, false);

  manager.disableSound();
  assert.equal(manager.soundEnabled, false);

  // Toggle state
  manager.soundEnabled = true;
  assert.equal(manager.soundEnabled, true);

  // Schedule and cancellation without errors
  manager.scheduleCountdownCues({ startsAt: Date.now() + 3000, getServerNow: () => Date.now() });
  manager.cancelCountdownCues();
  assert.equal(manager.countdownTimeoutId, null);

  manager.playPauseCue("01:23");
  manager.disableSound();
  assert.equal(manager.soundEnabled, false);
});

test("createWakeLockController operates safely in headless environment", async () => {
  const controller = createWakeLockController();
  assert.equal(controller.isActive(), false);
  const result = await controller.start();
  assert.equal(result, null);
  assert.equal(controller.isActive(), false);
  controller.stop();
  assert.equal(controller.isActive(), false);
});

test("triggerVibration returns false safely when navigator.vibrate is unavailable", () => {
  assert.equal(triggerVibration([100, 50, 100]), false);
});

test("getSyncGuideDismissed handles missing window/storage safely in node", () => {
  assert.equal(getSyncGuideDismissed("room-test123"), true);
  // Calling set does not throw
  setSyncGuideDismissed("room-test123");
});
