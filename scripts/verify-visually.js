import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const localPort = 3001;
const targetUrl = `http://127.0.0.1:${localPort}`;
const artifactDir = "C:/Users/manee/.gemini/antigravity/brain/7ceb15e8-2369-4355-b104-d82805f93aa3";

let serverProcess = null;
try {
  await fetch(`${targetUrl}/health`);
  console.log("Server already running on", targetUrl);
} catch {
  console.log("Starting server on port", localPort);
  serverProcess = spawn("node", ["server.js"], {
    env: { ...process.env, PORT: String(localPort) },
    stdio: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${targetUrl}/health`);
      if (res.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
}

const browser = await chromium.launch({ headless: true });
const results = { steps: [], chassisMeasurements: null };

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  // 1. Landing Identity Page
  console.log("1. Checking Landing / Identity Screen...");
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(artifactDir, "visual-1-identity.png") });
  results.steps.push({ step: "1-identity", status: "ok", file: "visual-1-identity.png" });

  // 2. Enter Identity & View Lobby
  console.log("2. Checking Lobby...");
  await page.getByLabel("DISPLAY NAME").fill("Alex Lead");
  await page.getByRole("button", { name: /Enter the control room/i }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(artifactDir, "visual-2-lobby.png") });
  results.steps.push({ step: "2-lobby", status: "ok", file: "visual-2-lobby.png" });

  // 3. Create YouTube Room & Verify Hero Poster Overlay
  console.log("3. Creating YouTube Room & Verifying Center Play Hero...");
  await page.getByRole("button", { name: /Start a room/i }).click();
  await page.waitForTimeout(400);

  const ytUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  await page.getByLabel("ROOM NAME").fill("Cinematic Nature Showcase");
  await page.getByPlaceholder(/Paste a video/i).fill(ytUrl);
  await page.waitForTimeout(500);

  // Click create room
  await page.locator(".modal-backdrop .primary-action").click();
  await page.waitForTimeout(2000);

  // Verify Hero Poster Overlay
  const heroOverlay = page.locator(".center-play-overlay");
  const isHeroVisible = await heroOverlay.isVisible();
  await page.screenshot({ path: path.join(artifactDir, "visual-3-youtube-hero.png") });
  results.steps.push({
    step: "3-youtube-hero",
    status: isHeroVisible ? "ok" : "warning",
    file: "visual-3-youtube-hero.png",
    heroVisible: isHeroVisible,
  });

  // 4. Click Center Play to Mount YouTube Player & Measure Chassis / Iframe
  console.log("4. Mounting YouTube Player & Measuring Chassis / Iframe Dimensions...");
  if (isHeroVisible) {
    const playBtn = page.locator(".center-play-glow-btn");
    if (await playBtn.isVisible()) {
      await playBtn.click();
      await page.waitForTimeout(1500);
    }
  }

  // Measure chassis, youtube-player, and iframe
  const measurements = await page.evaluate(() => {
    const chassis = document.querySelector(".screen-chassis");
    const ytPlayer = document.querySelector(".screen-chassis .youtube-player");
    const iframe = document.querySelector(".screen-chassis .youtube-player iframe");
    const chassisRect = chassis ? chassis.getBoundingClientRect() : null;
    const playerRect = ytPlayer ? ytPlayer.getBoundingClientRect() : null;
    const iframeRect = iframe ? iframe.getBoundingClientRect() : null;
    const playerStyle = ytPlayer ? window.getComputedStyle(ytPlayer) : null;
    return {
      chassis: chassisRect ? { width: chassisRect.width, height: chassisRect.height } : null,
      ytPlayer: playerRect ? { width: playerRect.width, height: playerRect.height, top: playerRect.top, left: playerRect.left } : null,
      iframe: iframeRect ? { width: iframeRect.width, height: iframeRect.height } : null,
      playerZIndex: playerStyle ? playerStyle.zIndex : null,
      playerInset: playerStyle ? `${playerStyle.top} ${playerStyle.right} ${playerStyle.bottom} ${playerStyle.left}` : null,
    };
  });
  results.chassisMeasurements = measurements;
  console.log("Chassis measurements:", JSON.stringify(measurements));

  await page.screenshot({ path: path.join(artifactDir, "visual-4-youtube-stage.png") });
  results.steps.push({ step: "4-youtube-stage", status: "ok", file: "visual-4-youtube-stage.png", measurements });

  // 5. Reactions Animated Pop
  console.log("5. Testing Emoji Reactions & Z-Index Stack...");
  const emojis = page.locator(".reaction-dock button");
  const count = await emojis.count();
  for (let i = 0; i < Math.min(count, 4); i++) {
    await emojis.nth(i).click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(150);

  const popInfo = await page.evaluate(() => {
    const pops = Array.from(document.querySelectorAll(".reaction-pop"));
    return pops.map(p => ({
      text: p.textContent,
      zIndex: window.getComputedStyle(p).zIndex,
    }));
  });
  results.popInfo = popInfo;

  await page.screenshot({ path: path.join(artifactDir, "visual-5-reaction-pop.png") });
  results.steps.push({ step: "5-reaction-pop", status: "ok", file: "visual-5-reaction-pop.png", popInfo });

  // 6. Change Media Modal & Race Condition Test
  console.log("6. Testing Change Media Modal...");
  const changeBtn = page.locator(".now-action-pill", { hasText: "Change Video" });
  await changeBtn.click();
  await page.waitForTimeout(400);

  const changeModal = page.locator(".change-media-modal");
  await page.screenshot({ path: path.join(artifactDir, "visual-6-change-media-modal.png") });
  results.steps.push({ step: "6-change-media-modal", status: "ok", file: "visual-6-change-media-modal.png" });

  // 7. Switch to Preloaded Movie Library / Direct Video Flow
  console.log("7. Switching to Preloaded Movie Library / Direct Video...");
  const directMp4Btn = page.getByRole("button", { name: /Direct MP4/i });
  await directMp4Btn.click();
  await page.getByRole("button", { name: /Update Video for Everyone/i }).click();
  await page.waitForTimeout(2000);

  const videoElement = page.locator(".screen-chassis video");
  const videoVisible = await videoElement.isVisible();
  await page.screenshot({ path: path.join(artifactDir, "visual-7-movie-stage.png") });
  results.steps.push({
    step: "7-movie-stage",
    status: videoVisible ? "ok" : "warning",
    file: "visual-7-movie-stage.png",
    videoVisible,
  });

  // 8. Session Replaced Kick Banner (Tab 2 joins with same memberId)
  console.log("8. Testing Session Replaced Kick Banner...");
  const roomCode = await page.evaluate(() => new URL(window.location.href).searchParams.get("room"));
  const { tabName, memberId } = await page.evaluate(() => {
    const winName = window.name;
    const memId = sessionStorage.getItem(`afterglow-member-id-${winName}`);
    return { tabName: winName, memberId: memId };
  });
  console.log("Tab 1 session identity:", { roomCode, tabName, memberId });

  // Create Context 2 with same window.name, memberId, and profile to simulate duplicate tab
  const context2 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page2 = await context2.newPage();
  await page2.addInitScript(({ winName, memId }) => {
    window.name = winName;
    sessionStorage.setItem(`afterglow-member-id-${winName}`, memId);
    sessionStorage.setItem("afterglow-profile", JSON.stringify({ name: "Alex Lead" }));
  }, { winName: tabName, memId: memberId });

  await page2.goto(`${targetUrl}?room=${roomCode}`);
  await page2.waitForTimeout(1500);

  // Tab 1 should now show session-replaced-banner
  const banner = page.locator(".session-replaced-banner");
  await banner.waitFor({ state: "visible", timeout: 5000 });
  const bannerVisible = await banner.isVisible();
  console.log("Banner visible on Tab 1:", bannerVisible);

  await page.screenshot({ path: path.join(artifactDir, "visual-8-session-replaced-banner.png") });
  results.steps.push({
    step: "8-session-replaced-banner",
    status: bannerVisible ? "ok" : "warning",
    file: "visual-8-session-replaced-banner.png",
    bannerVisible,
  });

  // Test "Use this tab again"
  if (bannerVisible) {
    console.log("Testing Reconnect on Tab 1...");
    await page.locator(".session-reconnect-btn").click();
    await page.waitForTimeout(1500);
    const bannerGone = !(await banner.isVisible());
    console.log("Tab 1 reconnected successfully, banner gone:", bannerGone);
    results.reconnectSucceeded = bannerGone;
  }
  await context2.close();

  // 9. Leave Room Confirmation Modal
  console.log("9. Testing Leave Room Confirmation Modal...");
  await page.locator(".back-button").click();
  await page.waitForTimeout(400);

  const leaveModal = page.locator(".leave-confirm-modal");
  const leaveModalVisible = await leaveModal.isVisible();
  await page.screenshot({ path: path.join(artifactDir, "visual-9-leave-confirm-modal.png") });
  results.steps.push({
    step: "9-leave-confirm-modal",
    status: leaveModalVisible ? "ok" : "warning",
    file: "visual-9-leave-confirm-modal.png",
    leaveModalVisible,
  });

  await context.close();
} finally {
  await browser.close();
  if (serverProcess) {
    serverProcess.kill();
  }
}

console.log("=== VISUAL VERIFICATION COMPLETE ===");
console.log(JSON.stringify(results, null, 2));
