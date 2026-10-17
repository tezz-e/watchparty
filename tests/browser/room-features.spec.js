import { expect, test } from "@playwright/test";

test("center play hero poster displays for YouTube and allows mid-room video change", async ({ page, baseURL }) => {
  await page.goto(baseURL);

  // Enter identity
  await page.getByLabel("DISPLAY NAME").fill("Tester");
  await page.getByRole("button", { name: /Enter the control room/ }).click();

  // Create YouTube room
  await page.getByRole("button", { name: /Start a room/ }).click();
  const ytUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  await page.getByLabel("ROOM NAME").fill("Nature Documentary");
  await page.getByPlaceholder(/Paste a video/).fill(ytUrl);
  await page.getByRole("button", { name: /Create the room/ }).click();

  // 1. Verify Center Play Hero Poster is visible before playback
  const centerOverlay = page.locator(".center-play-overlay");
  await expect(centerOverlay).toBeVisible();
  const posterImg = page.locator(".center-play-poster");
  await expect(posterImg).toHaveAttribute("src", /img\.youtube\.com\/vi\/aqz-KE-bpKQ\/hqdefault\.jpg/);
  await expect(page.locator(".center-play-title")).toContainText("Nature Documentary");
  await expect(page.locator(".center-play-badge")).toContainText("READY TO WATCH");

  // 2. Verify "Change Video" and "Screen Share" buttons exist in now-line
  const changeBtn = page.locator(".now-action-pill", { hasText: "Change Video" });
  await expect(changeBtn).toBeVisible();
  const screenShareBtn = page.getByRole("button", { name: /Screen Share/ });
  await expect(screenShareBtn).toBeVisible();

  // 3. Open Change Video modal and switch to local clip
  await changeBtn.click();
  const modal = page.locator(".change-media-modal");
  await expect(modal).toBeVisible();

  const newClipUrl = `${baseURL}/tests/fixtures/afterglow-timecode.webm`;
  await page.getByLabel("NEW VIDEO URL").fill(newClipUrl);
  await page.getByLabel("TITLE (OPTIONAL)").fill("Timecode Test Clip");
  await page.getByRole("button", { name: /Update Video for Everyone/ }).click();

  // Verify room updated
  await expect(modal).not.toBeVisible();
  await expect(page.locator(".now-line b")).toContainText("Timecode Test Clip");

  // 4. Start playback via Center Play button
  const centerPlayBtn = page.locator(".center-play-glow-btn");
  if (await centerPlayBtn.isVisible()) {
    await centerPlayBtn.click();
  }

  // Verify video starts playing and overlay hides
  const video = page.locator(".screen-chassis video:not(.livekit-video)");
  await expect.poll(() => video.evaluate(v => !v.paused), { timeout: 10_000 }).toBe(true);
  await expect(centerOverlay).not.toBeVisible();
});
