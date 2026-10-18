import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = join(root, "src", "data", "catalog.json");
const infoPath = join(root, "src", "data", "SEED_INFO.json");
const posterDirectory = join(root, "public", "catalog", "posters");
const apiRoot = "https://api.themoviedb.org/3";
const imageRoot = "https://image.tmdb.org/t/p/w500";
const token = process.env.TMDB_READ_ACCESS_TOKEN;
const region = (process.env.SEED_REGION || "IN").toUpperCase();
const curatedGenres = ["Action", "Adventure", "Animation", "Comedy", "Drama", "Family", "Fantasy", "Science Fiction"];
const fallback = JSON.parse(await readFile(catalogPath, "utf8"));
const nonTmdbMovies = fallback.movies.filter(movie => !movie.id.startsWith("tmdb-"));
const posterDownloads = [];

if (process.env.TMDB_TERMS_REVIEWED !== "1") {
  throw new Error("Review TMDB and JustWatch terms first, then set TMDB_TERMS_REVIEWED=1 before seeding.");
}
if (!token) throw new Error("Set TMDB_READ_ACCESS_TOKEN in the environment before seeding.");
if (!/^[A-Z]{2}$/.test(region)) throw new Error("SEED_REGION must be a two-letter country code.");

async function requestJson(path) {
  const url = new URL(path, `${apiRoot}/`);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    } catch {
      if (attempt === 3) throw new Error("TMDB could not be reached; the existing local catalog was not changed.");
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    if (response.ok) return response.json();
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 3) {
        const retrySeconds = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retrySeconds) ? Math.max(250, Math.min(retrySeconds * 1000, 10_000)) : 500 * (attempt + 1);
        await response.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
    await response.body?.cancel();
    throw new Error(`TMDB request failed with HTTP ${response.status}; the existing local catalog was not changed.`);
  }
  throw new Error("TMDB request failed after retries; the existing local catalog was not changed.");
}

async function requestPoster(path, temporaryPath) {
  const response = await fetch(new URL(`${imageRoot}${path}`));
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("image/")) {
    await response.body?.cancel();
    throw new Error(`A catalog poster download failed with HTTP ${response.status}; the existing catalog was not changed.`);
  }
  await writeFile(temporaryPath, Buffer.from(await response.arrayBuffer()));
}

const genreData = await requestJson("genre/movie/list?language=en-US");
const genreById = new Map(genreData.genres.map(genre => [genre.id, genre.name]));
const genreIds = new Map(genreData.genres.map(genre => [genre.name, genre.id]));
const selected = new Map();
for (const genreName of curatedGenres) {
  const genreId = genreIds.get(genreName);
  if (!genreId) continue;
  let genreCount = 0;
  for (const pageNumber of [1, 2]) {
    const params = new URLSearchParams({
      include_adult: "false",
      language: "en-US",
      page: String(pageNumber),
      sort_by: "popularity.desc",
      watch_region: region,
      with_genres: String(genreId),
    });
    const page = await requestJson(`discover/movie?${params}`);
    for (const movie of page.results || []) {
      if (movie.poster_path && movie.overview && movie.release_date && !selected.has(movie.id)) {
        selected.set(movie.id, movie);
        genreCount += 1;
      }
      if (genreCount >= 4) break;
    }
    if (genreCount >= 4) break;
  }
  if (selected.size >= 32) break;
}
if (selected.size < 30) throw new Error("TMDB returned fewer than 30 curated titles; the existing local catalog was not changed.");

const movies = [];
for (const movie of [...selected.values()].slice(0, 32)) {
  const [providers, videos] = await Promise.all([
    requestJson(`movie/${movie.id}/watch/providers`),
    requestJson(`movie/${movie.id}/videos?language=en-US`),
  ]);
  const providerGroups = providers.results?.[region] || {};
  const availability = [...new Set(
    ["flatrate", "free", "ads", "rent", "buy"]
      .flatMap(group => providerGroups[group] || [])
      .map(provider => provider.provider_name),
  )];
  const trailer = (videos.results || []).find(video => video.site === "YouTube" && video.type === "Trailer" && video.official);
  const posterName = `tmdb-${movie.id}.jpg`;
  const poster = movie.poster_path ? `/catalog/posters/${posterName}` : null;
  if (movie.poster_path) {
    const temporaryPath = join(posterDirectory, `${posterName}.${process.pid}.tmp`);
    posterDownloads.push({ temporaryPath, destination: join(posterDirectory, posterName), path: movie.poster_path });
  }
  movies.push({
    id: `tmdb-${movie.id}`,
    title: movie.title,
    year: Number(movie.release_date.slice(0, 4)) || null,
    category: (movie.genre_ids || []).map(id => genreById.get(id)).find(Boolean) || "Other",
    genres: (movie.genre_ids || []).map(id => genreById.get(id)).filter(Boolean),
    overview: movie.overview,
    rating: Number.isFinite(movie.vote_average) ? movie.vote_average : null,
    trailerKey: trailer?.key || null,
    availability,
    providers: [...new Map(
      ["flatrate", "free", "ads", "rent", "buy"]
        .flatMap(group => providerGroups[group] || [])
        .map(provider => [provider.provider_id, { id: provider.provider_id, name: provider.provider_name }]),
    ).values()],
    filename: null,
    source: null,
    poster,
    tone: "ocean",
    moods: [],
    attribution: "Metadata from TMDB; streaming availability data by JustWatch.",
    license: "Commercial copyright; requires personal streaming subscription.",
  });
  await new Promise(resolve => setTimeout(resolve, 150));
}

await mkdir(posterDirectory, { recursive: true });
const snapshotDate = new Date().toISOString().slice(0, 10);
const [snapshotYear, snapshotMonth, snapshotDay] = snapshotDate.split("-").map(Number);
const snapshotExpiresAt = new Date(Date.UTC(snapshotYear, snapshotMonth + 5, snapshotDay)).toISOString().slice(0, 10);
const snapshot = {
  snapshotDate,
  snapshotExpiresAt,
  region,
  source: "TMDB snapshot; streaming availability data by JustWatch.",
  movies: [...movies, ...nonTmdbMovies],
};
const seedInfo = {
  snapshotDate,
  snapshotExpiresAt,
  region,
  tmdbMovies: movies.length,
  openMovies: nonTmdbMovies.filter(m => m.id.startsWith("open-")).length,
  publicDomainMovies: nonTmdbMovies.filter(m => m.id.startsWith("pd-")).length,
  note: "Offline snapshot. TMDB and streaming availability are not queried at runtime.",
};
const temporaryCatalog = `${catalogPath}.${process.pid}.tmp`;
const temporaryInfo = `${infoPath}.${process.pid}.tmp`;

try {
  for (const poster of posterDownloads) await requestPoster(poster.path, poster.temporaryPath);
  await writeFile(temporaryCatalog, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
  await writeFile(temporaryInfo, `${JSON.stringify(seedInfo, null, 2)}\n`, { flag: "wx" });
  for (const poster of posterDownloads) await rename(poster.temporaryPath, poster.destination);
  await rename(temporaryInfo, infoPath);
  await rename(temporaryCatalog, catalogPath);
  console.log(`Saved ${movies.length} TMDB titles and ${openMovies.length} local open-movie records for ${region} (${snapshotDate}).`);
} catch (error) {
  await Promise.all([
    rm(temporaryCatalog, { force: true }),
    rm(temporaryInfo, { force: true }),
    ...posterDownloads.map(poster => rm(poster.temporaryPath, { force: true })),
  ]);
  throw new Error(`Could not replace the catalog snapshot: ${error.message}`);
}
