# Changelog

Every version here is a tag on this repository, and every tag carries the built bundle as a
release asset. The version in `package.json` is the version in the tag — `v1.2.0` is
`"version": "1.2.0"`, and a release that disagrees with that file is a mistake, not a variant.

## 1.2.1 — 2026-11-10

### Fixed

- **The Desktop build was never green.** It had only ever run on a tag, and on `v1.2.0` it failed
  on both runners: Linux refused the `.deb` for want of an author email in `package.json` (there
  was no author field at all), and Windows failed three assertions in the single-file test.
- **A CRLF shebang is a syntax error.** The Windows failure was line endings: the checkout
  converted `dist/lantern.js` to CRLF, and Node 20 will not parse `#!/usr/bin/env node` when the
  line ends in `\r`. `.gitattributes` now pins every text file to LF in every working tree, with
  the two Windows launchers the exception, and two assertions hold the line — the bundle must
  start with `#!` and carry no CRLF.
- **The suite removed a temp folder a live child still held**, which threw `EBUSY` on Windows and
  took the run down with it. It now waits for the child to exit and treats the cleanup as
  best-effort.

### Added

- A `windows-latest` job in the test workflow, and a `main` trigger on the desktop workflow. The
  reason this reached a tag at all is that neither existed: the suite only ran on Ubuntu and the
  desktop build only ran on tags.

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
