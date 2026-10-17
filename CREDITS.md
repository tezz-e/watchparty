# Media and catalog credits

## Files included in this repository

| Asset | Source and license |
| --- | --- |
| `media/afterglow-test.webm` | Generated locally with FFmpeg from its built-in synthetic `testsrc2` filter and a burned-in timecode rendered with the locally installed Windows Consolas font. No external footage, soundtrack, or downloaded media. Project test asset; CC0. |
| `public/catalog/posters/*.svg` | Original, simple vector illustrations created for the offline fallback catalog. Project-authored. |

## Catalog titles

The offline fallback lists open-movie projects by title and credits their studio/publisher as Blender Institute. It does not bundle those films, posters, or external video links. A local media file must be obtained from an authorized source before a card becomes playable. Before adding any film file, record its exact download URL, license name/version, and retrieval date in this table; verify the URL returns `206 Partial Content` with a valid `Content-Range` using `npm.cmd run check:media-links -- <url>`.

| Title | File | Download source | License | Retrieved |
| --- | --- | --- | --- | --- |
| No third-party movie files are bundled. | — | — | — | — |

## Catalog data

The committed catalog is a hand-authored offline fallback. If it is replaced with a TMDB snapshot, preserve the standard attribution in the app and README:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Streaming availability metadata must also credit JustWatch. Review the current TMDB and JustWatch terms before running the optional seed script; current TMDB terms could not be retrieved in this environment, so this implementation does not claim that the required terms review was completed.
