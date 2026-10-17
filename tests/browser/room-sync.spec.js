import { expect, test } from "@playwright/test";

test("two browsers load the same local clip and synchronize playback", async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1440, height: 1000 },
  });
  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  try {
    const host = await hostContext.newPage();
    await host.goto(baseURL);
    await expect(host.getByLabel("Color theme")).toHaveValue("green");
    await host.getByLabel("Color theme").selectOption("amber");
    await expect(host.locator(".soft-field")).toHaveAttribute("data-theme", "amber");
    await expect.poll(() => host.evaluate(() => getComputedStyle(document.querySelector(".primary-action")).backgroundColor))
      .toBe("rgb(255, 193, 110)");
    await host.reload();
    await expect(host.getByLabel("Color theme")).toHaveValue("amber");

    await host.getByLabel("DISPLAY NAME").fill("Browser host");
    await host.getByRole("button", { name: /Enter the control room/ }).click();
    await host.getByRole("button", { name: /Start a room/ }).click();
    const clipUrl = `${baseURL}/tests/fixtures/afterglow-timecode.webm`;
    await host.getByLabel("VIDEO URL").fill(clipUrl);
    await host.getByRole("button", { name: /Create the room/ }).click();

    const hostVideo = host.locator(".screen-chassis video:not(.livekit-video)");
    await expect.poll(() => hostVideo.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
    await host.getByRole("button", { name: /INVITE/ }).click();
    const inviteUrl = await host.evaluate(() => navigator.clipboard.readText());
    const invite = new URL(inviteUrl);
    expect(invite.searchParams.get("room")).toBeTruthy();

    const guest = await guestContext.newPage();
    await guest.goto(invite.href);
    await guest.getByLabel("Color theme").selectOption("blue");
    await expect(guest.locator(".soft-field")).toHaveAttribute("data-theme", "blue");
    await expect.poll(() => guest.evaluate(() => getComputedStyle(document.querySelector(".primary-action")).backgroundColor))
      .toBe("rgb(142, 203, 255)");
    await guest.getByLabel("DISPLAY NAME").fill("Browser guest");
    await guest.getByRole("button", { name: /Enter the control room/ }).click();

    const guestVideo = guest.locator(".screen-chassis video:not(.livekit-video)");
    await expect.poll(() => guestVideo.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
    await expect(guest.locator(".now-line")).toContainText("Friday, but make it quiet");
    await host.getByText("LIVE SYNC").waitFor();
    await guest.getByText("LIVE SYNC").waitFor();

    await host.locator(".transport-play").click();
    await expect.poll(() => guestVideo.evaluate(video => !video.paused), { timeout: 10_000 }).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    const driftSamples = [];
    for (let sample = 0; sample < 10; sample += 1) {
      const [hostPosition, guestPosition] = await Promise.all([
        hostVideo.evaluate(video => video.currentTime),
        guestVideo.evaluate(video => video.currentTime),
      ]);
      driftSamples.push(Math.abs(hostPosition - guestPosition));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const maximumDriftSeconds = Math.max(...driftSamples);
    expect(maximumDriftSeconds).toBeLessThanOrEqual(0.5);
    console.log(JSON.stringify({
      chromiumVersion: browser.version(),
      hostViewport: await host.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })),
      guestViewport: await guest.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })),
      driftSampleCount: driftSamples.length,
      maximumObservedDriftSeconds: maximumDriftSeconds,
    }));
    await guest.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
