# Lantern

[![live demo](https://img.shields.io/badge/live%20demo-open%20the%20library-f0b429?style=flat-square&labelColor=0b0e12)](https://drsamonline.github.io/app-lantern/demo/)
[![test](https://github.com/drsamonline/app-lantern/actions/workflows/test.yml/badge.svg)](https://github.com/drsamonline/app-lantern/actions/workflows/test.yml)
[![audit](https://img.shields.io/badge/audit-in%20the%20suite-f0b429?style=flat-square&labelColor=0b0e12)](tools/audit.mjs)
[![licence](https://img.shields.io/badge/licence-PolyForm%20Noncommercial%201.0.0-f0b429?style=flat-square&labelColor=0b0e12)](LICENSE)
[![dependencies](https://img.shields.io/badge/runtime%20deps-0-5fbf8a?style=flat-square&labelColor=0b0e12)](package.json)
[![network](https://img.shields.io/badge/network-none-5fbf8a?style=flat-square&labelColor=0b0e12)](#what-it-does-when-things-go-wrong)

**A whole library, served over your own Wi-Fi, with no internet at any point.**

One device — a laptop, a Raspberry Pi, a phone that runs Node — becomes a local
content server. Everyone else on the same network opens the address it prints, in a
**plain browser**, and browses, searches and reads a bundled library. Nothing leaves
the host unless you export it.

*Internet-in-a-Box, as an app.* A school, clinic or village gets a searchable library
for the cost of one device and none of the connectivity.

**[Open the live demo →](https://drsamonline.github.io/app-lantern/demo/)** — the real
client and the real search code, running in your browser over a pre-built copy of the
starter pack.

![Lantern](docs/icon-512.png)

## Run it

```bash
node server.js          # or: node server.js 8080
```

It prints the addresses to open:

```
Lantern is serving 3 document(s) on port 8080
Open on any device on this Wi-Fi:
  http://192.168.1.24:8080/
No internet is used at any point.
```

Then, on the host, open the Packs card and import `examples/starter-pack.json`.
Anyone on the Wi-Fi can now read and search it.

There is nothing to install and nothing to build: the host is one Node file with
**no dependencies**, and the client is one page with no build step.

### Or copy one file

`dist/lantern.js` is the **whole app in one file** — server, search index and client,
with the page and icon carried inside it. Copy it to a machine with Node and run it;
there is no folder to keep beside it.

```bash
node lantern.js 8080
```

## The three parts

| | |
|---|---|
| **the host** | one Node file, zero dependencies: serves the page, the library and the search index |
| **the packs** | content, hashed on import and re-verified on every load |
| **the reader** | a plain browser on the same Wi-Fi — no app, no account, no internet |

## What it does

- **Host mode.** Import content packs into the host; it serves them on the LAN.
- **Client.** Anyone on the network opens the address in a browser — no app, no
  account, no internet.
- **Search.** A full-text index over every document in every pack, built on the
  host. A document containing the whole query as a **phrase** outranks one that
  merely contains its words.
- **Pack manager.** Each pack's **true byte size**, its document count, and one
  button to remove it — which removes its documents from search at once.
- **Usage stays local.** No analytics, no call home, no third-party request in
  either the host or the page.

## A pack

A pack is one JSON file:

```json
{
  "id": "my-pack",
  "title": "My Pack",
  "docs": [
    { "path": "notes.html", "title": "Notes", "content": "<h1>Notes</h1>" }
  ]
}
```

On import Lantern writes each document and records its **SHA-256 and byte length**
in the pack's own `manifest.json`. It re-checks both every time it loads a pack.

## What it does when things go wrong

| Situation | What Lantern does |
|---|---|
| A document path tries to leave the pack (`../`, an absolute path) | The import is refused and the path is named. A request for such a path is refused with 403. |
| A file cannot be written (no space, read-only disk) | The pack is **not** added, the files that did not land are named, and nothing half-written is left behind — a reader cannot tell a missing page from a missing chapter. |
| A pack's files no longer match its manifest | The pack is moved to `.quarantine/`, reported in the Packs card, and is neither served nor searchable. |
| A bundle that is not JSON, or has no documents | Refused with the reason shown. |
| No peers, no internet | Nothing changes: the library still opens on the host, and says how many documents it holds. |

## The proof

```bash
node test-node.js      # 60 assertions
node tools/audit.mjs   # every claim in this README, checked against the repo
node tools/build.mjs   # the demo library, the single file and the bundle
```

The suite runs **over real HTTP against a real host**, because the point of a LAN app
is that a browser on the network can read it. It uses Node's `http` rather than
`fetch`, so the test never depends on the internet's plumbing.

What it covers: the host taking a port and answering; the client page being served;
import, and the true byte size read back off disk; a document read over HTTP;
phrase-first ranking **ahead of documents that only carry the words**; search after a
pack is removed; traversal refusal at request and at import; a bundle that is not
JSON; a write that fails with `ENOSPC`; a checksum mismatch being quarantined; **the
builds** (a second build changes nothing, the bundle carries every file, and the
single file copied alone into an empty folder still serves the page and the icon);
and the audit itself.

**Checked to bite**, not just to pass: with the phrase bonus removed and both
traversal guards removed, 10 assertions fail.

## Layout

```
server.js              the host — zero dependencies
lib/search.js          the index and the ranking, shared by the host and the demo page
public/                the client: index.html, lan-kit.js, icon.svg
docs/                  the landing page, the demo, the icon
docs/demo/             the live demo (search + reader, over a built copy of the pack)
examples/              a starter pack to import
tools/build.mjs        demo library → dist/lantern.js → dist/lantern-<ver>.zip
tools/audit.mjs        the claims, checked
dist/                  the built single file and the portable bundle
```

The demo page loads **the same `lib/search.js`** the host runs. A demo that
re-implements the search would drift from the app, and a demo that drifts is a lie
with a nice font — so `tools/audit.mjs` fails if the demo ever stops using it.

## Built on

- [lan-kit](https://github.com/drsamonline/lan-kit) — vendored as `public/lan-kit.js`
  for the LAN address helpers (`Lan.hostUrl`), so the page and the host agree on
  what address a phone should open.

## Licence

PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE). © 2026 Dr Sohil Momin.
