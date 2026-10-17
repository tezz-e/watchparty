import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalog,
  catalogAvailability,
  catalogDetails,
  catalogGenres,
  searchCatalog,
  externalPlatformUrl,
} from "../src/data/localCatalog.js";
import { fuzzyMatch } from "../src/utils/watchParty.js";

test("offline catalog exposes detailed open-movie records without a runtime lookup", () => {
  assert.ok(catalog.length >= 8);
  const bunny = catalogDetails("open-big-buck-bunny");
  assert.equal(bunny.title, "Big Buck Bunny");
  assert.ok(bunny.genres.includes("Animation"));
  assert.ok(bunny.overview.length > 30);
  assert.equal(bunny.rating, null);
  assert.match(bunny.poster, /^\/catalog\/posters\//);
  assert.deepEqual(catalogAvailability(bunny), ["Open movie · local copy required"]);
  assert.deepEqual(catalogAvailability(bunny, new Set([bunny.filename])), ["Available in this room's local library"]);
});

test("local catalog filters by category and genre and sorts deterministically", () => {
  const fantasy = searchCatalog(catalog, { category: "Fantasy", genre: "Short", sort: "title" });
  assert.ok(fantasy.length >= 2);
  assert.ok(fantasy.every(movie => movie.category === "Fantasy" && movie.genres.includes("Short")));
  const newest = searchCatalog(catalog, { sort: "year" });
  assert.ok(newest[0].year >= newest.at(-1).year);
  assert.ok(catalogGenres().includes("Animation"));
});

test("fuzzy search tolerates misspellings without matching unrelated titles", () => {
  assert.equal(fuzzyMatch("Sintel Animation Fantasy", "sintle"), true);
  assert.equal(fuzzyMatch("Big Buck Bunny", "buny"), true);
  assert.equal(fuzzyMatch("Big Buck Bunny", "romantic comedy"), false);
});

test("catalog availability can start a sync-only room using an allowlisted service search", () => {
  const netflix = externalPlatformUrl("Netflix");
  assert.equal(new URL(netflix).hostname, "netflix.com");
  assert.equal(new URL(netflix).pathname, "/");
  assert.equal(externalPlatformUrl("Unknown service"), null);
});
