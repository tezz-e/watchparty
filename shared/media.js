import { streamingPlatforms } from "./streamingPlatforms.js";

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function webUrl(value) {
  if (typeof value !== "string" || !value) return null;
  const clean = value.trim();
  try {
    const raw = clean.includes("://") ? clean : (clean.includes(".") ? `https://${clean}` : null);
    if (!raw) return null;
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function youtubeVideoId(value) {
  const url = webUrl(value);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  let videoId = null;
  if (url.hostname.toLowerCase() === "youtu.be") {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    videoId = segments[0];
  } else if (url.pathname === "/watch") {
    if (url.searchParams.getAll("v").length !== 1) return null;
    videoId = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/);
    videoId = match?.[1] || null;
  }
  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function streamingPlatform(value) {
  const url = webUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  return streamingPlatforms.find(platform => {
    const matchesDomain = platform.domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    const matchesPath = platform.paths?.some(({ domain, prefixes }) =>
      (host === domain || host.endsWith(`.${domain}`)) && prefixes.some(prefix => url.pathname.startsWith(prefix)));
    return matchesDomain || matchesPath;
  }) || null;
}

export function mediaProvider(value) {
  if (youtubeVideoId(value)) return "youtube";
  const url = webUrl(value);
  if (!url) return null;
  if (/\.(mp4|webm)$/i.test(url.pathname)) return "url";
  if (/\.m3u8$/i.test(url.pathname)) return "hls";
  if (streamingPlatform(value)) return "external";
  return null;
}

export const validMediaUrl = value => mediaProvider(value) !== null;

export function isMixedContent(value, pageProtocol) {
  const url = webUrl(value);
  return pageProtocol === "https:" && url?.protocol === "http:";
}
