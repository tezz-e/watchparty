import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const [source, filename] = process.argv.slice(2);
const mediaDirectory = fileURLToPath(new URL("../media/", import.meta.url));
const allowedExtensions = new Set([".mp4", ".webm"]);

if (!source || !filename) {
  console.error("Usage: npm run fetch:media -- <verified-https-url> <filename.mp4|filename.webm>");
  process.exit(2);
}

const url = new URL(source);
if (url.protocol !== "https:" || url.username || url.password) {
  throw new Error("Media downloads require a public HTTPS URL without embedded credentials.");
}
if (basename(filename) !== filename || !allowedExtensions.has(extname(filename).toLowerCase())) {
  throw new Error("Choose a simple filename ending in .mp4 or .webm.");
}

const rangeResponse = await fetch(url, { headers: { Range: "bytes=0-0" } });
const contentRange = rangeResponse.headers.get("content-range") || "";
const rangeValid = rangeResponse.status === 206 && /^bytes 0-0\/\d+$/i.test(contentRange);
await rangeResponse.body?.cancel();
if (!rangeValid) throw new Error(`The source must support byte ranges (received HTTP ${rangeResponse.status}, ${contentRange || "no Content-Range"}).`);

const response = await fetch(url);
if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}.`);
if (!response.url.startsWith("https://")) throw new Error("The download redirected to a non-HTTPS URL.");
const contentType = response.headers.get("content-type") || "";
if (!contentType.startsWith("video/") && !/octet-stream/i.test(contentType)) {
  await response.body.cancel();
  throw new Error(`Expected a video response; received ${contentType || "no Content-Type"}.`);
}

await mkdir(mediaDirectory, { recursive: true });
const destination = join(mediaDirectory, filename);
const temporary = `${destination}.${process.pid}.download`;
try {
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  const downloaded = await stat(temporary);
  const expectedBytes = Number(response.headers.get("content-length"));
  if (!downloaded.size || (Number.isFinite(expectedBytes) && expectedBytes > 0 && downloaded.size !== expectedBytes)) {
    throw new Error("The downloaded file is empty or incomplete.");
  }
  await rename(temporary, destination);
  console.log(`Saved ${destination} (${(downloaded.size / 1024 / 1024).toFixed(1)} MB).`);
} catch (error) {
  await rm(temporary, { force: true });
  throw error;
}
