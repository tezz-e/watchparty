import { expect, test } from "@playwright/test";

test("sync-only room with host and 2 attendees: countdown -> pause -> resume -> jump", async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1280, height: 800 },
  });
  const guest1Context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const guest2Context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const dismissSetupGuide = async (page) => {
    try {
      const gotItBtn = page.getByRole("button", { name: "Got it!" });
      if (await gotItBtn.isVisible({ timeout: 2500 })) {
        await gotItBtn.click();
      }
    } catch {
      // Guide modal not visible or already dismissed
    }
  };

  try {
    const host = await hostContext.newPage();
    const guest1 = await guest1Context.newPage();
    const guest2 = await guest2Context.newPage();

    // 1. Host enters identity and creates sync-only room
    await host.goto(baseURL);
    await host.getByLabel("DISPLAY NAME").fill("Host Sync");
    await host.getByRole("button", { name: /Enter the control room/i }).click();

    await host.getByRole("button", { name: /Start a room/i }).click();
    await host.getByLabel("ROOM NAME").fill("Netflix Stranger Things Watch");
    await host.getByPlaceholder(/Paste a video/i).fill("https://www.netflix.com/title/80057281");
    await host.locator(".modal-backdrop .primary-action").click();

    // Verify sync-only companion panel is rendered
    await expect(host.locator(".sync-only-companion")).toBeVisible({ timeout: 10_000 });
    await expect(host.locator(".sync-explainer-banner")).toBeVisible();

    // Dismiss setup guide modal if open
    await dismissSetupGuide(host);

    // Get room invite link directly from host URL (isolated from parallel worker clipboards)
    await host.getByRole("button", { name: /INVITE/i }).click();
    await expect(host.getByRole("button", { name: /LINK COPIED/i })).toBeVisible();
    const inviteUrl = host.url();

    // 2. Guest 1 joins
    await guest1.goto(inviteUrl);
    await guest1.getByLabel("DISPLAY NAME").fill("Attendee Alice");
    await guest1.getByRole("button", { name: /Enter the control room/i }).click();
    await expect(guest1.locator(".sync-only-companion")).toBeVisible({ timeout: 10_000 });
    await dismissSetupGuide(guest1);

    // 3. Guest 2 joins
    await guest2.goto(inviteUrl);
    await guest2.getByLabel("DISPLAY NAME").fill("Attendee Bob");
    await guest2.getByRole("button", { name: /Enter the control room/i }).click();
    await expect(guest2.locator(".sync-only-companion")).toBeVisible({ timeout: 10_000 });
    await dismissSetupGuide(guest2);

    // 4. Start Countdown
    // Mark attendees ready
    const guest1ReadyBtn = guest1.locator(".external-ready-toggle");
    await guest1ReadyBtn.click();
    const guest2ReadyBtn = guest2.locator(".external-ready-toggle");
    await guest2ReadyBtn.click();

    // Host also marks ready
    const hostReadyBtn = host.locator(".external-ready-toggle");
    if (await hostReadyBtn.isVisible()) {
      await hostReadyBtn.click();
    }

    // Host starts 3-2-1 countdown
    const startCountdownBtn = host.locator(".external-countdown-button");
    await expect(startCountdownBtn).toBeEnabled({ timeout: 5_000 });
    await startCountdownBtn.click();

    // Verify countdown shows on all 3 browsers
    await expect(host.locator(".sync-countdown-banner")).toBeVisible();
    await expect(guest1.locator(".sync-countdown-banner")).toBeVisible();
    await expect(guest2.locator(".sync-countdown-banner")).toBeVisible();

    // Wait for countdown (3s) to finish and clock to run
    await host.waitForTimeout(3800);

    // 5. Host pauses for everyone
    const pauseBtn = host.locator(".host-clock-pause-btn");
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
    await pauseBtn.click();

    // Verify full-width paused state appears on all 3 browsers
    await expect(host.locator(".sync-paused-banner")).toBeVisible({ timeout: 5_000 });
    await expect(guest1.locator(".sync-paused-banner")).toBeVisible({ timeout: 5_000 });
    await expect(guest2.locator(".sync-paused-banner")).toBeVisible({ timeout: 5_000 });

    // Confirm frozen text instruction
    await expect(guest1.locator(".paused-instruction")).toContainText(/Pause your player at this time/i);
    await expect(guest2.locator(".paused-instruction")).toContainText(/Pause your player at this time/i);

    // 6. Resume together
    // Guests and host click "I'm paused at..." to mark ready
    await guest1.locator(".paused-confirm-btn").click();
    await guest2.locator(".paused-confirm-btn").click();
    await host.locator(".paused-confirm-btn").click();

    // All 3/3 are now ready, host clicks "Resume together"
    const resumeBtn = host.locator(".resume-together-btn");
    await expect(resumeBtn).toBeEnabled({ timeout: 5_000 });
    await resumeBtn.click();

    // Countdown triggers again
    await expect(guest1.locator(".sync-countdown-banner")).toBeVisible({ timeout: 4_000 });
    await host.waitForTimeout(3500);

    // 7. Host jumps to 45:00
    const jumpInput = host.locator(".sync-seek-form input");
    await expect(jumpInput).toBeVisible();
    await jumpInput.fill("45:00");

    const jumpSubmitBtn = host.locator(".seek-submit-btn");
    await jumpSubmitBtn.click();

    // Verify all 3 browsers received seek announcement and display 45:00
    await expect(host.locator(".sync-jump-banner")).toContainText(/45:00/);
    await expect(host.locator(".ticker-timecode")).toContainText(/45:00/);
    await expect(guest1.locator(".sync-jump-banner")).toContainText(/45:00/);
    await expect(guest2.locator(".sync-jump-banner")).toContainText(/45:00/);

  } finally {
    await guest2Context.close();
    await guest1Context.close();
    await hostContext.close();
  }
});
