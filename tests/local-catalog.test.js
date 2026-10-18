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
  assert.equal(new URL(externalPlatformUrl("Amazon Video")).hostname, "primevideo.com");
  assert.equal(new URL(externalPlatformUrl("Disney Plus")).hostname, "disneyplus.com");
  assert.equal(new URL(externalPlatformUrl("Apple TV Store")).hostname, "tv.apple.com");
});

test("open Blender movies provide playable remote source URLs and licensing attribution", () => {
  const openIds = [
    "open-elephants-dream",
    "open-big-buck-bunny",
    "open-sintel",
    "open-tears-of-steel",
    "open-caminandes",
    "open-spring",
    "open-cosmos-laundromat",
    "open-agent-327",
  ];
  for (const id of openIds) {
    const item = catalogDetails(id);
    assert.ok(item, `Expected item ${id} in catalog`);
    assert.ok(item.source, `Expected item ${id} to have remote source URL`);
    assert.match(item.source, /^https?:\/\/.+\.(mp4|webm)$/i);
    assert.ok(item.license, `Expected item ${id} to have license`);
    assert.ok(item.attribution, `Expected item ${id} to have attribution`);
  }
});

test("public domain feature films are present with playable URLs, posters, and licenses", () => {
  const pdTitles = [
    "Night of the Living Dead",
    "Charade",
    "Carnival of Souls",
    "His Girl Friday",
    "A Trip to the Moon",
  ];
  for (const title of pdTitles) {
    const matches = searchCatalog(catalog, { query: title });
    assert.ok(matches.length > 0, `Expected search match for ${title}`);
    const movie = matches.find(m => m.title.toLowerCase().includes(title.toLowerCase()));
    assert.ok(movie, `Expected movie ${title} in catalog`);
    assert.ok(movie.source, `Expected ${title} to have playable source`);
    assert.match(movie.source, /^https?:\/\/.+\.(mp4|webm)$/i);
    assert.ok(movie.poster, `Expected ${title} to have poster`);
    assert.match(movie.poster, /^\/catalog\/posters\//);
    assert.ok(movie.license, `Expected ${title} to have license`);
    assert.ok(movie.attribution, `Expected ${title} to have attribution`);
  }
});
