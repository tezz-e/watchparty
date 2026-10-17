import { youtubeVideoId } from "../../shared/media.js";
import { catalog } from "../data/localCatalog.js";

export function getMediaPoster(source, title = "") {
  if (!source || typeof source !== "string") return null;

  const ytId = youtubeVideoId(source);
  if (ytId) {
    return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }

  const cleanSource = source.trim();
  const cleanTitle = (title || "").trim().toLowerCase();

  const match = catalog.find(item => {
    if (item.source && item.source === cleanSource) return true;
    if (item.filename && cleanSource.includes(item.filename)) return true;
    if (cleanTitle && item.title && item.title.toLowerCase() === cleanTitle) return true;
    return false;
  });

  if (match?.poster) {
    return match.poster;
  }

  return null;
}
