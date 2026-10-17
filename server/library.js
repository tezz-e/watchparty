import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const mediaTypes = new Set([".mp4", ".webm"]);

export async function listLibraryItems(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const items = await Promise.all(entries
    .filter(entry => entry.isFile() && mediaTypes.has(extname(entry.name).toLowerCase()))
    .map(async entry => {
      const mediaPath = join(directory, entry.name);
      const metadata = await stat(mediaPath);
      const title = basename(entry.name, extname(entry.name)).replace(/[_-]+/g, " ").trim();
      return {
        id: `local-${entry.name}`,
        title: title || entry.name,
        category: "Local library",
        duration: "--:--",
        source: `/media/${encodeURIComponent(entry.name)}`,
        note: `${(metadata.size / (1024 * 1024)).toFixed(1)} MB · local file`,
        tone: "sky",
        moods: [],
      };
    }));

  return items.sort((left, right) => left.title.localeCompare(right.title));
}
