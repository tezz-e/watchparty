# Media and catalog credits

## Files included in this repository

| Asset | Source and license |
| --- | --- |
| `media/afterglow-test.webm` | Generated locally with FFmpeg from its built-in synthetic `testsrc2` filter and a burned-in timecode rendered with the locally installed Windows Consolas font. No external footage, soundtrack, or downloaded media. Project test asset; CC0. |
| `public/catalog/posters/*.svg` | Original, simple vector illustrations created for the offline open-movie records. Project-authored. |
| `public/catalog/posters/tmdb-*.jpg` | Poster images downloaded from TMDB for the local Norway catalog snapshot dated 2026-10-17. TMDB content; attributed in the discovery view. Snapshot refresh deadline: 2027-04-17. |
| `public/catalog/tmdb-blue-long-2.svg` | Official TMDB blue long logo asset from the approved logos linked on the TMDB logos & attribution page. |

## Catalog titles

The offline fallback lists open-movie projects by title and credits their studio/publisher as Blender Institute. It does not bundle those films, posters, or external video links. A local media file must be obtained from an authorized source before a card becomes playable. Before adding any film file, record its exact download URL, license name/version, and retrieval date in this table; verify the URL returns `206 Partial Content` with a valid `Content-Range` using `npm.cmd run check:media-links -- <url>`.

| Title | File | Download source | License | Retrieved |
| --- | --- | --- | --- | --- |
| No third-party movie files are bundled. | — | — | — | — |

## Catalog data

The catalog combines 32 TMDB titles for Norway (`NO`) and 8 hand-authored open-movie records. TMDB metadata and posters are stored as a dated local snapshot and are not queried at runtime. Refresh or remove the TMDB snapshot by 2027-04-17.

The app displays the TMDB logo and required notice:

> This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.

Streaming availability metadata is powered by TMDB's partnership with JustWatch and is credited in the app. Terms were reviewed before seeding on 2026-10-17. See [TMDB API terms](https://www.themoviedb.org/api-terms-of-use), [TMDB attribution](https://developer.themoviedb.org/docs/faq), and [TMDB watch providers](https://developer.themoviedb.org/reference/movie-watch-providers).
