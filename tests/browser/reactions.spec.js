import { expect, test } from "@playwright/test";

test("reactions: overlay layer, bigger dock buttons, optimistic rendering, and reduced-motion fade", async ({ page, baseURL }) => {
  await page.goto(baseURL);

  // Enter identity
  await page.getByLabel("DISPLAY NAME").fill("ReactionTester");
  await page.getByRole("button", { name: /Enter the control room/ }).click();

  // Create room
  await page.getByRole("button", { name: /Start a room/ }).click();
  await page.getByLabel("ROOM NAME").fill("Reaction Room");
  await page.getByPlaceholder(/Paste a video/).fill("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  await page.getByRole("button", { name: /Create the room/ }).click();

  // 1. Verify reaction overlay is present above player, inside screen-chassis with z-index 25 and pointer-events none
  const overlay = page.locator(".reaction-stream-overlay");
  await expect(overlay).toBeAttached();
  const overlayStyle = await overlay.evaluate(el => {
    const s = window.getComputedStyle(el);
    return {
      position: s.position,
      pointerEvents: s.pointerEvents,
      zIndex: s.zIndex,
    };
  });
  expect(overlayStyle.position).toBe("absolute");
  expect(overlayStyle.pointerEvents).toBe("none");
  expect(overlayStyle.zIndex).toBe("25");

  // 2. Verify reaction buttons in the dock are bigger (42x38px with larger font)
  const sparkBtn = page.getByRole("button", { name: "✨", exact: true });
  await expect(sparkBtn).toBeVisible();
  const btnBox = await sparkBtn.boundingBox();
  expect(btnBox).not.toBeNull();
  expect(btnBox.width).toBeGreaterThanOrEqual(40);
  expect(btnBox.height).toBeGreaterThanOrEqual(36);

  // 3. Test optimistic reaction rendering: clicking reaction button instantly spawns an item
  await sparkBtn.click();
  const reactionItem = page.locator(".reaction-stream-item").first();
  await expect(reactionItem).toBeVisible();
  await expect(reactionItem).toHaveText("✨");

  // 4. Test reduced-motion mode: reaction does NOT disappear instantly, stays visible with opacity fade
  await page.emulateMedia({ reducedMotion: "reduce" });
  const heartBtn = page.getByRole("button", { name: "♥", exact: true });
  await heartBtn.click();

  const heartReaction = page.locator(".reaction-stream-item", { hasText: "♥" });
  await expect(heartReaction).toBeVisible();

  // In reduced motion, opacity should be visible (> 0) after 300ms instead of 0
  await page.waitForTimeout(300);
  const opacity = await heartReaction.evaluate(el => parseFloat(window.getComputedStyle(el).opacity));
  expect(opacity).toBeGreaterThan(0.5);
});
