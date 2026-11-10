# Changelog

Every version here is a tag on this repository, and every tag carries the built bundle as a
release asset. The version in `package.json` is the version in the tag — `v1.2.0` is
`"version": "1.2.0"`, and a release that disagrees with that file is a mistake, not a variant.

## 1.2.0 — 2026-11-10

### Added

- **A support block in the README.** UPI, Ko-fi, PayPal, email and the project index, in the
  same words the landing page uses. Until now the page asked and the README — the first thing
  anyone reads — did not.
- **A way out of the demo.** The demo's footer now links to the support section and to the
  email address, so a reader who hits a bug has somewhere to go instead of a dead end.
- **This changelog.** The repository had release notes on GitHub and no history in the tree.

### Changed

- `package.json` — `1.1.0` → `1.2.0`. The previous tag was 27 commits behind the code.

### Carried in from 1.1.0 and the 27 commits after it

Recorded here because there was no changelog when they landed:

- Desktop builds for Windows and Linux (`electron-builder`), an Android reader, and the shell:
  two doors, a folder picker, a shelf and a reader.
- `pdf.js` and `epub.js` vendored, so a PDF and an EPUB open in the app with nothing fetched.
- `server.js` and `tools/build.mjs`: two server modes — who may read, and whether they may
  take the file.
- A 404 page in the site's own theme, a landing page designed in the app's own voice, and the
  support portrait and UPI QR that the page asked for and the repository did not carry.
- `SECURITY.md`, `PRIVACY.md`, `MANIFEST.json` with `tools/manifest.py`, and `PAGES.json`
  recording where this repository's pages live.

## 1.1.0 — 2026-10-31

- A searchable demo over the real `lib/search.js`, a lantern mark, a landing page, the single
  file `dist/lantern.js` and the portable bundle, and `tools/audit.mjs` checking the claims.
