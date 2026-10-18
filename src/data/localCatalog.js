import fallbackCatalog from "./catalog.json" with { type: "json" };
import { fuzzyMatch } from "../utils/watchParty.js";
import { mediaProvider } from "../../shared/media.js";
import { streamingPlatforms } from "../../shared/streamingPlatforms.js";

export const catalogSnapshot = fallbackCatalog;
export const catalog = fallbackCatalog.movies;
export const syncServices = ["Netflix", "Prime Video", "Disney+", "Max", "Hulu", "Paramount+", "Peacock", "Apple TV+"];

export function searchCatalog(items = catalog, {
  query = "",
  category = "All",
  genre = "All",
  sort = "title",
} = {}) {
  return items
    .filter(item => category === "All" || item.category === category)
    .filter(item => genre === "All" || item.genres?.includes(genre))
    .filter(item => fuzzyMatch(`${item.title} ${item.category} ${(item.genres || []).join(" ")}`, query))
    .sort((left, right) => {
      if (sort === "year") return (right.year || 0) - (left.year || 0) || left.title.localeCompare(right.title);
      if (sort === "rating") return (right.rating || 0) - (left.rating || 0) || left.title.localeCompare(right.title);
      return left.title.localeCompare(right.title);
    });
}

export function catalogDetails(id, items = catalog) {
  return items.find(item => item.id === id) || null;
}

export function catalogAvailability(item, filenames = new Set()) {
  if (filenames.has(item.filename)) return ["Available in this room's local library"];
  return item.availability || ["Availability not seeded"];
}

export function catalogCategories(items = catalog) {
  return [...new Set(items.map(item => item.category))].sort((left, right) => left.localeCompare(right));
}

export function catalogGenres(items = catalog) {
  return [...new Set(items.flatMap(item => item.genres || []))].sort((left, right) => left.localeCompare(right));
}

const providerAliases = {
  netflix: "netflix",
  "amazon prime video": "prime-video",
  "prime video": "prime-video",
  "amazon video": "prime-video",
  "disney plus": "disney-plus",
  "disney+": "disney-plus",
  "hbo max": "max",
  max: "max",
  hulu: "hulu",
  "paramount plus": "paramount-plus",
  "paramount+": "paramount-plus",
  peacock: "peacock",
  "apple tv plus": "apple-tv",
  "apple tv+": "apple-tv",
  "apple tv": "apple-tv",
  "apple tv store": "apple-tv",
};

export function externalPlatformUrl(providerName) {
  const providerNameKey = String(providerName || "").toLowerCase().replace(/[+]/g, " plus ").replace(/\s+/g, " ").trim();
  const providerId = providerAliases[providerNameKey];
  const platform = streamingPlatforms.find(item => item.id === providerId);
  if (!platform) return null;
  const url = `https://${platform.domains[0]}/`;
  return mediaProvider(url) === "external" ? url : null;
}

export function getCatalogBadge(item, localFilenames = new Set()) {
  if (!item) return { type: "sync-only", label: "SYNC-ONLY", className: "badge-sync-only", hasPlayableSource: false, hasTrailer: false, isSyncOnly: true };
  const hasLocal = Boolean(item.filename && localFilenames.has(item.filename));
  const hasRemote = Boolean(item.source);
  const hasPlayableSource = Boolean(item.hasPlayableSource || item.available || hasLocal || hasRemote);
  const hasTrailer = Boolean(item.trailerKey);

  if (hasPlayableSource) {
    return {
      type: "full",
      label: "FULL MOVIE",
      className: "badge-full-movie",
      hasPlayableSource: true,
      hasTrailer: false,
      isSyncOnly: false,
    };
  }

  if (hasTrailer) {
    return {
      type: "trailer",
      label: "TRAILER ONLY",
      className: "badge-trailer-only",
      hasPlayableSource: false,
      hasTrailer: true,
      isSyncOnly: false,
    };
  }

  return {
    type: "sync-only",
    label: "SYNC-ONLY",
    className: "badge-sync-only",
    hasPlayableSource: false,
    hasTrailer: false,
    isSyncOnly: true,
  };
}

export function getSyncOptions(item) {
  if (!item) return [];
  return (item.availability || [])
    .map(name => ({ name, url: externalPlatformUrl(name) }))
    .filter(opt => Boolean(opt.url));
}

