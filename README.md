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

## Get it

**[Download Lantern →](https://github.com/drsamonline/app-lantern/raw/main/dist/lantern.zip)** — one
`.zip`, about 55 KB. Inside: `start-lantern` for Windows and for Linux, the server, and a starter
library. There is no installer and nothing to fetch afterwards. Every tagged release also carries
the same bundle as an attached asset, built by `.github/workflows/release.yml`.

## Run it

Three steps, no terminal, no account.

1. **Install Node.js** — open [nodejs.org](https://nodejs.org), click the big green **LTS**
   button, keep clicking **Next** until it finishes. It is the only thing you install.
2. **Start Lantern** — double-click **`start-lantern.bat`** on Windows, or **`start-lantern.sh`**
   on Linux. A window opens and stays open; that window *is* Lantern running. Leave it open.
3. **Tell people the address** — the window prints one, like `http://192.168.1.24:8080/`. Anyone on
   the same Wi-Fi types it into their browser. Nothing to install on their side.

Nothing is sent anywhere, and no internet is used at any point.

## Add your own books

A book, a set of notes, or a whole shelf is one JSON file — a **pack**. There is no editor and no
build step; the file is the format.

1. **Copy the sample.** Open [`examples/starter-pack.json`](examples/starter-pack.json) in any text
   editor and save a copy under a new name. It already has the shape: an `id`, a `title`, and a list
   of `docs`.
2. **Put your text in it.** Each document is a `path`, a `title`, and the text as simple HTML inside
   `content`. One entry per chapter.

   ```json
   {
     "id": "my-library",
     "title": "My Library",
     "docs": [
       { "path": "chapter-1.html", "title": "Chapter 1",
         "content": "<h1>Chapter 1</h1><p>The text of the chapter goes here.</p>" }
     ]
   }
   ```

3. **Import it.** Open the address the host printed, find the **Packs** card, choose your file and
   press **Import pack**. It is saved on the host, hashed, and searchable immediately.

A second pack later is searchable alongside the first — the search box covers the whole library, not
one pack.

## Settings

There are two, and neither usually needs changing.

| | |
|---|---|
| **the port** | `node server.js 9000`, or edit `8080` in `start-lantern.bat`. Change it when something else already owns 8080. |
| **where the library lives** | the `packs/` folder next to `server.js`, one folder per pack with a manifest. Remove a pack from the Packs card or delete its folder; the index drops it on the next start. |

### If you use a terminal

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

There is nothing to build and no dependencies: the host is one Node file with **no runtime
dependencies**, and the client is one page with no build step. Node.js itself is the one thing a
person has to install, which is why the two launchers exist — they are for people who do not want
to see a terminal.

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

## Support

Lantern is one person's work: no company, no ads, no tracking, no paid tier, and it stays
free. If it saved you an afternoon, a contribution keeps the next one coming — any amount,
or none.

| | |
|---|---|
| **UPI** | `drsohilboi@ybl` |
| **Ko-fi** | [ko-fi.com/matneo](https://ko-fi.com/matneo) |
| **PayPal** | [paypal.me/drsohilmomin](https://paypal.me/drsohilmomin?locale.x=en_GB&country.x=IN) |
| **Email** | [sohilmomin2000@gmail.com](mailto:sohilmomin2000@gmail.com) — bugs, corrections, requests |
| **Elsewhere** | [all projects](https://drsamonline.github.io/) · [books](https://www.amazon.com/stores/author/B08ZT331LY/allbooks) |

The same block, with the portrait and the UPI QR, sits in the footer of the
[landing page](https://drsamonline.github.io/app-lantern/#support).

## Licence

PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE). © 2026 Dr Sohil Momin.
