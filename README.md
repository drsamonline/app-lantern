# Lantern

[![test](https://github.com/drsamonline/app-lantern/actions/workflows/test.yml/badge.svg)](https://github.com/drsamonline/app-lantern/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933)](package.json)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-none-22c55e)](package.json)

**A whole library, served over your own Wi-Fi, with no internet at any point.**

One device — a laptop, a Raspberry Pi, a phone that can run Node — becomes a local
content server. Everyone else on the same network opens the address it prints, in a
**plain browser**, and browses, searches and reads a bundled library. Nothing leaves
the host unless you export it.

This is an "Internet-in-a-Box" as an app: a school, clinic or village gets a
searchable library for the cost of one device and none of the connectivity.

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

## When things go wrong

| Situation | What Lantern does |
|---|---|
| A document path tries to leave the pack (`../`, an absolute path) | The import is refused and the path is named. A request for such a path is refused with 403. |
| A file cannot be written (no space, read-only disk) | The pack is **not** added, the files that did not land are named, and nothing half-written is left behind — a reader cannot tell a missing page from a missing chapter. |
| A pack's files no longer match its manifest | The pack is moved to `.quarantine/`, reported in the Packs card, and is neither served nor searchable. |
| A bundle that is not JSON, or has no documents | Refused with the reason shown. |
| No peers, no internet | Nothing changes: the library still opens on the host, and says how many documents it holds. |

## Tests

```bash
node test-node.js     # 49 passed, 0 failed
```

Every claim above is checked **over real HTTP against a real host**, because the
point of a LAN app is that a browser on the network can read it. The suite covers:
the host taking a port and answering, the client page being served, import and the
true byte size read back off disk, a document read over HTTP, phrase-first ranking
(ahead of documents that only carry the words), search after a pack is removed,
traversal refusal, an unsafe bundle path, a bundle that is not JSON, a write that
fails with `ENOSPC`, and a checksum mismatch being quarantined.

The assertions were checked to **bite**: with the phrase bonus removed and both
traversal guards removed, 10 of them fail.

## Built on

- [lan-kit](https://github.com/drsamonline/lan-kit) — vendored as `public/lan-kit.js`
  for the LAN address helpers (`Lan.hostUrl`), so the page and the host agree on
  what address a phone should open.

## Licence

PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE). © 2026 Dr Sohil Momin.
