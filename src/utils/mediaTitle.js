import { youtubeVideoId } from "../../shared/media.js";
import { serverUrl } from "./serverUrl.js";

/**
 * Fetches the human-readable title for a media URL.
 * Supports YouTube via official oEmbed, falling back to server-side resolver.
 */
export async function fetchMediaTitle(source) {
  if (!source || typeof source !== "string") return null;

  const ytId = youtubeVideoId(source.trim());
  if (ytId) {
    const canonicalYtUrl = `https://www.youtube.com/watch?v=${ytId}`;

    // 1. Try direct YouTube oEmbed (supports CORS and returns instantaneous metadata)
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalYtUrl)}&format=json`;
      const response = await fetch(oembedUrl);
      if (response.ok) {
        const data = await response.json();
        if (data?.title && typeof data.title === "string") {
          return data.title.trim();
        }
      }
    } catch {
      // Direct fetch may fail if blocked by ad-blocker or strict offline network
    }

    // 2. Fallback to server endpoint
    try {
      const serverEndpoint = `${serverUrl}/api/media-title?url=${encodeURIComponent(canonicalYtUrl)}`;
      const response = await fetch(serverEndpoint);
      if (response.ok) {
        const data = await response.json();
        if (data?.title && typeof data.title === "string") {
          return data.title.trim();
        }
      }
    } catch {
      // Server fallback failed
    }
  }

  return null;
}
