const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return null;

    let videoId = null;
    if (url.hostname.toLowerCase().endsWith("youtu.be")) {
      videoId = url.pathname.split("/").filter(Boolean)[0];
    } else if (url.pathname === "/watch") {
      if (url.searchParams.getAll("v").length !== 1) return null;
      videoId = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/);
      videoId = match?.[1] || null;
    }
    return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function mediaProvider(value) {
  if (youtubeVideoId(value)) return "youtube";
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && /\.(mp4|webm)$/i.test(url.pathname) ? "url" : null;
  } catch {
    return null;
  }
}

export const validMediaUrl = value => mediaProvider(value) !== null;
