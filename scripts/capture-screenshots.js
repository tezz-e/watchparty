import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const localPort = 3001;
const targetUrl = `http://127.0.0.1:${localPort}`;
const assetsDir = path.resolve("assets");

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

let serverProcess = null;
try {
  await fetch(`${targetUrl}/health`);
} catch {
  console.log("Starting local production server on port", localPort);
  serverProcess = spawn("node", ["server.js"], { env: { ...process.env, PORT: String(localPort) }, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1500));
}

console.log("Launching Chromium to capture production showcase screenshots from:", targetUrl);

const browser = await chromium.launch({ headless: true });

try {
  // ----------------------------------------------------
  // 1. Desktop Room View (1440x920) - Big Buck Bunny in Amber Theme
  // ----------------------------------------------------
  console.log("[1/3] Capturing Desktop Room with Cinematic Media & Live Chat...");
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 2,
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(targetUrl, { waitUntil: "networkidle" });

  // Select Amber theme & Enter Identity
  await desktopPage.getByLabel("Color theme").selectOption("amber");
  await desktopPage.getByLabel("DISPLAY NAME").fill("Alex");
  await desktopPage.getByRole("button", { name: /Enter the control room/i }).click();
  await desktopPage.waitForTimeout(600);

  // Click Start a room
  await desktopPage.getByRole("button", { name: /Start a room/i }).click();
  await desktopPage.waitForTimeout(500);

  // Capture Discovery Modal (showing Big Buck Bunny available locally)
  await desktopPage.screenshot({ path: path.join(assetsDir, "discovery-catalog.png") });
  console.log("Saved assets/discovery-catalog.png");

  // Select the local media file
  await desktopPage.getByPlaceholder(/Paste a video/i).fill(`${targetUrl}/media/big-buck-bunny.webm`);
  await desktopPage.waitForTimeout(300);

  // Click Create Room
  const createBtn = desktopPage.locator(".modal-backdrop .primary-action");
  await createBtn.click();
  await desktopPage.waitForTimeout(2500);

  // Seek to 3s and play video
  await desktopPage.evaluate(() => {
    const v = document.querySelector(".screen-chassis video:not(.livekit-video)");
    if (v) {
      v.currentTime = 3;
      v.play().catch(() => {});
    }
  });
  await desktopPage.waitForTimeout(1000);

  // Send a couple chat messages
  const chatInput = desktopPage.locator("input[placeholder*='Say something']");
  if (await chatInput.isVisible()) {
    await chatInput.fill("Synced up! Audio and video are in lockstep 🔥");
    await desktopPage.keyboard.press("Enter");
    await desktopPage.waitForTimeout(300);
  }

  // Click a couple emoji reactions
  const emojis = desktopPage.locator(".reaction-dock button");
  const eCount = await emojis.count();
  for (let i = 0; i < Math.min(eCount, 4); i++) {
    await emojis.nth(i).click().catch(() => {});
    await desktopPage.waitForTimeout(120);
  }

  await desktopPage.waitForTimeout(1000);
  await desktopPage.screenshot({ path: path.join(assetsDir, "desktop-room.png") });
  console.log("Saved assets/desktop-room.png");
  await desktopContext.close();

  // ----------------------------------------------------
  // 2. Mobile View: Instagram Reels Watch Party (390x844 - iPhone 14)
  // ----------------------------------------------------
  console.log("[2/3] Capturing Mobile Instagram Reels Watch Party (iPhone 14)...");
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(targetUrl, { waitUntil: "networkidle" });

  await mobilePage.getByLabel("Color theme").selectOption("green");
  await mobilePage.getByLabel("DISPLAY NAME").fill("Elena");
  await mobilePage.getByRole("button", { name: /Enter the control room/i }).click();
  await mobilePage.waitForTimeout(500);

  // Start room with Instagram Reel
  await mobilePage.getByRole("button", { name: /Start a room/i }).click();
  await mobilePage.waitForTimeout(400);

  // Fill verified working Instagram Reel
  await mobilePage.getByPlaceholder(/Paste a video/i).fill("https://www.instagram.com/reel/BsOGulcndj-/");
  await mobilePage.waitForTimeout(300);

  const mobileCreateBtn = mobilePage.locator(".modal-backdrop .primary-action");
  await mobileCreateBtn.click();
  await mobilePage.waitForTimeout(3500);

  // Trigger floating reactions and mark ready
  const markReadyBtn = mobilePage.getByRole("button", { name: /Mark me ready/i });
  if (await markReadyBtn.isVisible()) {
    await markReadyBtn.click();
    await mobilePage.waitForTimeout(400);
  }

  const startCountdownBtn = mobilePage.getByRole("button", { name: /Start 3-2-1/i });
  if (await startCountdownBtn.isVisible()) {
    await startCountdownBtn.click();
    await mobilePage.waitForTimeout(400);
  }

  const mobileReactionBtns = mobilePage.locator(".floating-reaction-bar button, .reel-controls-hud button, .reaction-dock button");
  const mCount = await mobileReactionBtns.count();
  for (let i = 0; i < Math.min(mCount, 3); i++) {
    await mobileReactionBtns.nth(i).click().catch(() => {});
    await mobilePage.waitForTimeout(100);
  }

  // Scroll smoothly back to top so the reel player is front and center
  await mobilePage.evaluate(() => window.scrollTo(0, 0));
  await mobilePage.waitForTimeout(4000);
  await mobilePage.screenshot({ path: path.join(assetsDir, "mobile-reel.png") });
  console.log("Saved assets/mobile-reel.png");
  await mobileContext.close();

  // ----------------------------------------------------
  // 3. Lobby / Dashboard View (1440x900)
  // ----------------------------------------------------
  console.log("[3/3] Capturing Sleek Control Room Dashboard...");
  const dashContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const dashPage = await dashContext.newPage();
  await dashPage.goto(targetUrl, { waitUntil: "networkidle" });
  await dashPage.getByLabel("Color theme").selectOption("blue");
  await dashPage.getByLabel("DISPLAY NAME").fill("Sam");
  await dashPage.getByRole("button", { name: /Enter the control room/i }).click();
  await dashPage.waitForTimeout(600);

  await dashPage.screenshot({ path: path.join(assetsDir, "dashboard-lobby.png") });
  console.log("Saved assets/dashboard-lobby.png");
  await dashContext.close();

  console.log("SUCCESS: All showcase screenshots captured and saved to ./assets!");
} catch (err) {
  console.error("Screenshot capture error:", err);
} finally {
  await browser.close();
  if (serverProcess) {
    serverProcess.kill();
  }
}
