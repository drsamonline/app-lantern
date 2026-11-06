#!/usr/bin/env node
/* Lantern 1.1.0 — the whole app in one file.
 * Built by tools/build.mjs from server.js, lib/search.js and public/.
 * Run: node lantern.js [port]
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin. */
globalThis.LANTERN_EMBEDDED = {"index.html":"<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Lantern — a library on your Wi-Fi</title>\n<meta name=\"description\" content=\"Lantern — a library served over this Wi-Fi. Browse and search the bundled content with no internet connection at any point.\">\n<link rel=\"icon\" href=\"icon.svg\" type=\"image/svg+xml\">\n<meta name=\"theme-color\" content=\"#0d1014\">\n<style>\n  :root{\n    --bg:#0d1014; --card:#151a21; --ink:#e9ecf1; --mut:#93a0b1;\n    --line:#232b36; --acc:#f0b429; --acc-ink:#1a1200;\n  }\n  *{box-sizing:border-box}\n  body{margin:0;background:var(--bg);color:var(--ink);\n       font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}\n  header,main,footer{max-width:820px;margin:0 auto;padding:18px}\n  header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}\n  h1{margin:0;font-size:22px;letter-spacing:.2px}\n  .lamp{width:10px;height:10px;border-radius:50%;background:var(--acc);\n        box-shadow:0 0 14px 2px rgba(240,180,41,.55);display:inline-block}\n  .mut{color:var(--mut)}\n  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;\n        padding:16px;margin:12px 0}\n  input[type=search],input[type=file]{width:100%;background:#0b0f14;color:var(--ink);\n        border:1px solid var(--line);border-radius:10px;padding:11px 13px;font:inherit}\n  button{background:var(--acc);color:var(--acc-ink);border:0;border-radius:10px;\n         padding:10px 14px;font-weight:700;cursor:pointer}\n  button.ghost{background:transparent;color:var(--mut);border:1px solid var(--line);font-weight:600}\n  ul{list-style:none;margin:0;padding:0}\n  li{padding:9px 0;border-bottom:1px solid var(--line);display:flex;gap:10px;\n     align-items:baseline;justify-content:space-between}\n  li:last-child{border-bottom:0}\n  a{color:var(--acc);text-decoration:none}\n  a:hover{text-decoration:underline}\n  .small{font-size:13px}\n  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}\n  .pill{border:1px solid var(--line);border-radius:999px;padding:2px 9px;font-size:12px;color:var(--mut)}\n  #reader{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}\n  #reader h2{margin:.2em 0}\n  .warn{border-color:#5a3a10;background:#1d1608;color:#ffd591}\n  footer{padding-bottom:40px}\n</style>\n</head>\n<body>\n<header>\n  <h1><img src=\"icon.svg\" alt=\"\" width=\"26\" height=\"26\" style=\"border-radius:7px;vertical-align:-5px\"> Lantern</h1>\n  <span class=\"mut\">a library on your Wi-Fi — no internet at any point</span>\n</header>\n\n<main>\n  <div class=\"card\" id=\"status-card\">\n    <div class=\"row\" style=\"justify-content:space-between\">\n      <div id=\"status\" class=\"mut\">Opening the library…</div>\n      <div class=\"row\">\n        <span class=\"pill\" id=\"here\"></span>\n        <button class=\"ghost\" id=\"refresh\">Refresh</button>\n      </div>\n    </div>\n  </div>\n\n  <div class=\"card\">\n    <input type=\"search\" id=\"q\" placeholder=\"Search the whole library…\" autocomplete=\"off\">\n    <div id=\"hits\" class=\"small mut\" style=\"margin-top:10px\"></div>\n  </div>\n\n  <div class=\"card\">\n    <div class=\"row\" style=\"justify-content:space-between\">\n      <strong>Packs</strong>\n      <span class=\"mut small\" id=\"packtotal\"></span>\n    </div>\n    <ul id=\"packs\"></ul>\n    <div class=\"row\" style=\"margin-top:12px\">\n      <input type=\"file\" id=\"bundle\" accept=\".json,application/json\" style=\"flex:1 1 240px\">\n      <button id=\"import\">Import pack</button>\n    </div>\n    <div id=\"importmsg\" class=\"small mut\" style=\"margin-top:8px\"></div>\n  </div>\n\n  <div class=\"card\" id=\"reader-card\" hidden>\n    <div class=\"row\" style=\"justify-content:space-between\">\n      <strong id=\"reader-title\"></strong>\n      <button class=\"ghost\" id=\"close\">Close</button>\n    </div>\n    <div id=\"reader\"></div>\n  </div>\n</main>\n\n<footer class=\"mut small\">\n  Built with lan-kit · PolyForm Noncommercial 1.0.0 · © 2026 Dr Sohil Momin\n</footer>\n\n<script src=\"lan-kit.js\"></script>\n<script>\n(function () {\n  \"use strict\";\n\n  var $ = function (id) { return document.getElementById(id); };\n\n  function esc(s) {\n    return String(s).replace(/[&<>\"']/g, function (c) {\n      return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\", \"'\": \"&#39;\" }[c];\n    });\n  }\n\n  function human(bytes) {\n    var n = Number(bytes) || 0;\n    if (n < 1024) return n + \" B\";\n    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + \" KB\";\n    return (n / 1048576).toFixed(1) + \" MB\";\n  }\n\n  function api(path, opts) {\n    return fetch(path, opts).then(function (r) {\n      return r.json().then(function (body) {\n        if (!r.ok) throw new Error(body.error || (\"HTTP \" + r.status));\n        return body;\n      });\n    });\n  }\n\n  function showAddress() {\n    var port = location.port || (location.protocol === \"https:\" ? 443 : 80);\n    var el = $(\"here\");\n    if (typeof Lan !== \"undefined\" && Lan.hostUrl) {\n      el.textContent = Lan.hostUrl(port).replace(/^https?:\\/\\//, \"\");\n    } else {\n      el.textContent = location.host;\n    }\n  }\n\n  function loadPacks() {\n    return api(\"/api/packs\").then(function (d) {\n      var list = $(\"packs\");\n      list.innerHTML = \"\";\n      var total = 0;\n      if (!d.packs.length) {\n        list.innerHTML = '<li class=\"mut small\">No packs yet — import one below.</li>';\n      }\n      d.packs.forEach(function (p) {\n        total += p.bytes;\n        var li = document.createElement(\"li\");\n        li.innerHTML =\n          '<span><strong>' + esc(p.title) + \"</strong><br>\" +\n          '<span class=\"mut small\">' + esc(p.id) + \" · \" + p.docs +\n          \" document\" + (p.docs === 1 ? \"\" : \"s\") + \"</span></span>\" +\n          '<span class=\"row\"><span class=\"pill\">' + human(p.bytes) + \"</span>\" +\n          '<button class=\"ghost small\" data-remove=\"' + esc(p.id) + '\">Remove</button></span>';\n        list.appendChild(li);\n      });\n      $(\"packtotal\").textContent =\n        d.packs.length + \" pack\" + (d.packs.length === 1 ? \"\" : \"s\") + \" · \" +\n        d.docs + \" document\" + (d.docs === 1 ? \"\" : \"s\") + \" · \" + human(total);\n\n      if (d.quarantined && d.quarantined.length) {\n        var q = document.createElement(\"li\");\n        q.className = \"warn small\";\n        q.textContent = \"Quarantined (not served): \" + d.quarantined.map(function (x) {\n          return x.id + \" — \" + x.reason;\n        }).join(\"; \");\n        list.appendChild(q);\n      }\n      $(\"status\").textContent = d.packs.length\n        ? \"Serving \" + d.docs + \" document(s) to anyone on this Wi-Fi.\"\n        : \"The library is empty. Import a pack to serve it.\";\n    });\n  }\n\n  function openDoc(pack, path, title) {\n    return fetch(\"/p/\" + encodeURIComponent(pack) + \"/\" + path.split(\"/\").map(encodeURIComponent).join(\"/\"))\n      .then(function (r) {\n        if (!r.ok) throw new Error(\"HTTP \" + r.status);\n        return r.text();\n      })\n      .then(function (text) {\n        $(\"reader-card\").hidden = false;\n        $(\"reader-title\").textContent = title;\n        $(\"reader\").innerHTML = /^\\s*</.test(text)\n          ? text\n          : \"<pre style='white-space:pre-wrap'>\" + esc(text) + \"</pre>\";\n        $(\"reader-card\").scrollIntoView({ behavior: \"smooth\", block: \"start\" });\n      });\n  }\n\n  function renderHits(d) {\n    var box = $(\"hits\");\n    if (!d.query) { box.innerHTML = \"\"; return; }\n    if (!d.hits.length) {\n      box.innerHTML = \"Nothing in the library matches “\" + esc(d.query) + \"”.\";\n      return;\n    }\n    box.innerHTML = d.hits.map(function (h, i) {\n      return '<div style=\"padding:8px 0;border-bottom:1px solid var(--line)\">' +\n        '<a href=\"#\" data-open=\"' + esc(h.pack) + \"|\" + esc(h.path) + \"|\" + esc(h.title) + '\">' +\n        esc(h.title) + \"</a> \" +\n        '<span class=\"pill\">' + esc(h.pack) + \"</span>\" +\n        '<div class=\"mut\">' + esc(h.snippet) + \"</div></div>\";\n    }).join(\"\");\n  }\n\n  var timer = null;\n  $(\"q\").addEventListener(\"input\", function () {\n    var q = $(\"q\").value.trim();\n    clearTimeout(timer);\n    if (!q) { renderHits({ query: \"\", hits: [] }); return; }\n    timer = setTimeout(function () {\n      api(\"/api/search?q=\" + encodeURIComponent(q)).then(renderHits).catch(function (e) {\n        $(\"hits\").textContent = \"Search failed: \" + e.message;\n      });\n    }, 120);\n  });\n\n  document.addEventListener(\"click\", function (ev) {\n    var open = ev.target.closest(\"[data-open]\");\n    if (open) {\n      ev.preventDefault();\n      var parts = open.getAttribute(\"data-open\").split(\"|\");\n      openDoc(parts[0], parts[1], parts[2]);\n      return;\n    }\n    var rm = ev.target.closest(\"[data-remove]\");\n    if (rm) {\n      var id = rm.getAttribute(\"data-remove\");\n      api(\"/api/packs/\" + encodeURIComponent(id), { method: \"DELETE\" })\n        .then(function () {\n          $(\"importmsg\").textContent = \"Removed \" + id + \" — its documents are out of search.\";\n          return loadPacks();\n        })\n        .catch(function (e) { $(\"importmsg\").textContent = \"Could not remove: \" + e.message; });\n    }\n  });\n\n  $(\"refresh\").addEventListener(\"click\", loadPacks);\n  $(\"close\").addEventListener(\"click\", function () { $(\"reader-card\").hidden = true; });\n\n  $(\"import\").addEventListener(\"click\", function () {\n    var file = $(\"bundle\").files && $(\"bundle\").files[0];\n    if (!file) { $(\"importmsg\").textContent = \"Choose a pack bundle (.json) first.\"; return; }\n    var reader = new FileReader();\n    reader.onload = function () {\n      var bundle;\n      try {\n        bundle = JSON.parse(String(reader.result));\n      } catch (e) {\n        $(\"importmsg\").textContent = \"That file is not a pack bundle: \" + e.message;\n        return;\n      }\n      api(\"/api/packs\", {\n        method: \"POST\",\n        headers: { \"content-type\": \"application/json\" },\n        body: JSON.stringify(bundle)\n      }).then(function (res) {\n        $(\"importmsg\").textContent =\n          \"Added \" + res.id + \" — \" + res.docs + \" document(s), \" + human(res.bytes) + \".\";\n        return loadPacks();\n      }).catch(function (e) {\n        $(\"importmsg\").textContent = \"Pack refused: \" + e.message;\n      });\n    };\n    reader.readAsText(file);\n  });\n\n  showAddress();\n  loadPacks().catch(function (e) {\n    $(\"status\").textContent = \"The library could not be read: \" + e.message;\n  });\n})();\n</script>\n</body>\n</html>\n<!-- LANTERN-CLIENT-PAGE-MARKER: this is the client page server.js serves at /\n     (public/ is mounted as the web root). It is NOT a duplicate landing page:\n     docs/index.html is the Pages landing page. A page sweep must not delete it -\n     it was deleted once (d877dac, \"per the page audit\") and the client page\n     tests went red with it. -->\n","lan-kit.js":"/* lan-kit.js — the browser client for a drsamonline LAN room. Zero dependencies.\n *\n * Talks to a lan-host over Server-Sent Events (server -> client) and POST\n * (client -> server). Works on a LAN with no internet and no accounts.\n *\n *   const c = Lan.client({ url: Lan.hostUrl(8080),\n *                          onOpen:   h => console.log(\"joined\", h.room),\n *                          onMessage: m => console.log(\"got\", m) });\n *   c.send({ from: \"me\", text: \"hello room\" });\n *\n * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.\n */\n(function (root) {\n  \"use strict\";\n  var Lan = { version: \"0.1.0\" };\n\n  function base(url) { return String(url || \"\").replace(/\\/+$/, \"\"); }\n  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return s; } }\n\n  Lan.client = function (opts) {\n    opts = opts || {};\n    var url = base(opts.url || \"\");\n    var es = new EventSource(url + \"/events\");\n    es.addEventListener(\"hello\", function (e) { if (opts.onOpen) opts.onOpen(safeParse(e.data)); });\n    es.addEventListener(\"message\", function (e) { if (opts.onMessage) opts.onMessage(safeParse(e.data)); });\n    es.onerror = function (e) { if (opts.onError) opts.onError(e); };\n    return {\n      url: url,\n      send: function (msg) {\n        return fetch(url + \"/send\", {\n          method: \"POST\",\n          headers: { \"Content-Type\": \"application/json\" },\n          body: JSON.stringify(msg)\n        }).then(function (r) { return r.json(); });\n      },\n      close: function () { try { es.close(); } catch (e) {} }\n    };\n  };\n\n  /* A short, unambiguous room code (no 0/O/1/I/L). */\n  Lan.roomCode = function (n) {\n    n = n || 4;\n    var A = \"ABCDEFGHJKMNPQRSTUVWXYZ23456789\", s = \"\";\n    for (var i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];\n    return s;\n  };\n\n  /* The host URL for this device on the current LAN. */\n  Lan.hostUrl = function (port) {\n    return \"http://\" + location.hostname + \":\" + (port || 8080);\n  };\n\n  root.Lan = Lan;\n})(typeof globalThis !== \"undefined\" ? globalThis : this);\n","icon.svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" width=\"512\" height=\"512\" role=\"img\" aria-label=\"Lantern\">\n  <title>Lantern</title>\n  <defs>\n    <radialGradient id=\"glow\" cx=\"50%\" cy=\"46%\" r=\"46%\">\n      <stop offset=\"0%\" stop-color=\"#F0B429\" stop-opacity=\".42\"/>\n      <stop offset=\"55%\" stop-color=\"#F0B429\" stop-opacity=\".12\"/>\n      <stop offset=\"100%\" stop-color=\"#F0B429\" stop-opacity=\"0\"/>\n    </radialGradient>\n    <linearGradient id=\"body\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#1E2632\"/>\n      <stop offset=\"55%\" stop-color=\"#161C25\"/>\n      <stop offset=\"100%\" stop-color=\"#11161D\"/>\n    </linearGradient>\n    <linearGradient id=\"flame\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#FFF3C4\"/>\n      <stop offset=\"55%\" stop-color=\"#FFD166\"/>\n      <stop offset=\"100%\" stop-color=\"#F0902B\"/>\n    </linearGradient>\n    <linearGradient id=\"metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#3A4553\"/>\n      <stop offset=\"100%\" stop-color=\"#232B36\"/>\n    </linearGradient>\n  </defs>\n\n  <rect width=\"512\" height=\"512\" rx=\"112\" fill=\"#0D1014\"/>\n  <circle cx=\"256\" cy=\"252\" r=\"212\" fill=\"url(#glow)\"/>\n\n  <!-- the handle -->\n  <path d=\"M180 150a76 76 0 0 1 152 0\" fill=\"none\" stroke=\"#2B3542\" stroke-width=\"15\" stroke-linecap=\"round\"/>\n  <path d=\"M180 150a76 76 0 0 1 152 0\" fill=\"none\" stroke=\"#F0B429\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\".5\"/>\n\n  <!-- the cap -->\n  <rect x=\"196\" y=\"136\" width=\"120\" height=\"30\" rx=\"10\" fill=\"url(#metal)\"/>\n  <rect x=\"216\" y=\"126\" width=\"80\" height=\"14\" rx=\"7\" fill=\"#2B3542\"/>\n\n  <!-- the body -->\n  <path d=\"M184 170h144l-12 196a32 32 0 0 1-32 30h-56a32 32 0 0 1-32-30z\" fill=\"url(#body)\" stroke=\"#2B3542\" stroke-width=\"8\"/>\n\n  <!-- the light inside -->\n  <path d=\"M256 196c10 22 30 40 34 66a34 34 0 1 1-68 0c4-26 24-44 34-66z\" fill=\"url(#flame)\"/>\n  <path d=\"M256 236c6 14 16 24 18 38a18 18 0 1 1-36 0c2-14 12-24 18-38z\" fill=\"#FFF6D8\"/>\n\n  <!-- the rails -->\n  <path d=\"M198 176v192M314 176v192\" stroke=\"#2B3542\" stroke-width=\"7\" stroke-linecap=\"round\"/>\n  <path d=\"M198 176v192M314 176v192\" stroke=\"#F0B429\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\".35\"/>\n\n  <!-- the base -->\n  <rect x=\"190\" y=\"392\" width=\"132\" height=\"26\" rx=\"9\" fill=\"url(#metal)\"/>\n  <rect x=\"212\" y=\"418\" width=\"88\" height=\"10\" rx=\"5\" fill=\"#2B3542\"/>\n</svg>\n"};
/**
 * Lantern — serve a whole library of offline content over the LAN.
 *
 * One device becomes a local content server: people on the same Wi-Fi browse and
 * search a bundled library in a plain browser, with no internet at any point.
 *
 * Zero dependencies. Node >= 18.
 *
 * Layout
 *   public/            the client (a plain page; no build step)
 *   packs/<id>/        imported content packs (one folder per pack)
 *   packs/<id>/manifest.json   the pack's own record: path, title, sha256, bytes
 *   .quarantine/<id>/  packs that failed their checksum, kept but never served
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
/* lib/search.js, inlined so one file is the whole app */
const Search = (function () {
  const module = { exports: {} };
/* lib/search.js — Lantern's full-text index, in one file both sides can use.
 *
 * The host runs it under Node (`require("./lib/search.js")`); the demo page runs
 * the very same file in a browser (`<script src="../lib/search.js">`). That is
 * the point: a demo that re-implements the search would drift from the app, and
 * a demo that drifts is a lie with a nice font.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LanternSearch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Words that carry no signal in a library search. Kept small on purpose: a
   * long list makes a short query return nothing. */
  var STOP = {};
  ("a an and are as at be by for from has have in is it its of on or that the their " +
   "there these this to was were will with not no but if then than so you your")
    .split(" ").forEach(function (w) { STOP[w] = true; });

  function tokenise(s) {
    var m = String(s == null ? "" : s).toLowerCase().match(/[\p{L}\p{N}]+/gu);
    return m || [];
  }

  function normalisePhrase(s) {
    return tokenise(s).join(" ");
  }

  /** A window of text around the first matching term, for the result list. */
  function snippetFor(text, terms) {
    /* Documents may be HTML. A snippet showing "<h1>Burns</h1><p>Cool the" is
       markup leaking into prose, so the tags come out before the window is cut. */
    var flat = String(text == null ? "" : text)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    var lower = flat.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length; i++) {
      var j = lower.indexOf(terms[i]);
      if (j !== -1 && (at === -1 || j < at)) at = j;
    }
    if (at === -1) at = 0;
    var start = Math.max(0, at - 60);
    var cut = flat.slice(start, start + 180);
    return (start > 0 ? "\u2026" : "") + cut + (start + 180 < flat.length ? "\u2026" : "");
  }

  /**
   * Build an index. `add` takes { pack, path, title, text }; `search` returns
   * ranked hits.
   *
   * Ranking is tf-idf over the query's terms, with one addition that matters for
   * a library: a document containing the WHOLE query as a phrase scores far
   * above one that merely carries the words. Ask for "running water" and the
   * page about running water comes first, not the page that mentions a river
   * running to the sea.
   */
  function createIndex() {
    var docs = [];
    var postings = new Map();

    function clear() {
      docs = [];
      postings = new Map();
    }

    function add(doc) {
      var at = docs.length;
      var title = doc.title || doc.path || "";
      var text = doc.text || "";
      docs.push({ pack: doc.pack, path: doc.path, title: title, text: text });

      var counts = new Map();
      var words = tokenise(title + " " + text);
      for (var i = 0; i < words.length; i++) {
        var t = words[i];
        if (STOP[t]) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
      counts.forEach(function (tf, term) {
        var p = postings.get(term);
        if (!p) { p = new Map(); postings.set(term, p); }
        p.set(at, tf);
      });
      return at;
    }

    function search(q, limit) {
      var terms = tokenise(q).filter(function (t) { return !STOP[t]; });
      if (!terms.length) return [];

      var phrase = normalisePhrase(q);
      var n = Math.max(docs.length, 1);
      var scores = new Map();

      for (var i = 0; i < terms.length; i++) {
        var posting = postings.get(terms[i]);
        if (!posting) continue;
        var idf = Math.log(1 + n / (1 + posting.size));
        posting.forEach(function (tf, at) {
          scores.set(at, (scores.get(at) || 0) + idf * (1 + Math.log(tf)));
        });
      }

      var hits = [];
      scores.forEach(function (score, at) {
        var doc = docs[at];
        var s = score;
        if (phrase && normalisePhrase(doc.text).indexOf(phrase) !== -1) s += 1000;
        hits.push({
          pack: doc.pack,
          path: doc.path,
          title: doc.title,
          score: Math.round(s * 1000) / 1000,
          snippet: snippetFor(doc.text, terms)
        });
      });

      hits.sort(function (a, b) {
        return b.score - a.score || String(a.title).localeCompare(String(b.title));
      });
      var max = Math.max(1, Math.min(limit || 20, 100));
      return hits.slice(0, max);
    }

    return {
      clear: clear,
      add: add,
      search: search,
      size: function () { return docs.length; },
      docs: function () { return docs; }
    };
  }

  return {
    STOP: STOP,
    tokenise: tokenise,
    normalisePhrase: normalisePhrase,
    snippetFor: snippetFor,
    createIndex: createIndex
  };
});

  return module.exports;
})();

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
// Overridable so the tests can point at a throwaway folder.
const PACKS = process.env.LANTERN_PACKS
  ? path.resolve(process.env.LANTERN_PACKS)
  : path.join(ROOT, "packs");
const QUARANTINE = process.env.LANTERN_QUARANTINE
  ? path.resolve(process.env.LANTERN_QUARANTINE)
  : path.join(ROOT, ".quarantine");
const MAX_BODY = 32 * 1024 * 1024;

/* The single-file build (tools/build.mjs) puts the client assets in this global,
   so one script is the whole app and can be copied to a Pi on its own. When it
   is absent — the normal checkout — assets are read from public/. */
const EMBEDDED =
  (typeof globalThis.LANTERN_EMBEDDED === "object" && globalThis.LANTERN_EMBEDDED) || null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

/* ------------------------------------------------------------------ paths */

/** A pack-relative path, or null when it is not one. Refuses traversal. */
function safeRel(p) {
  if (typeof p !== "string" || p.length === 0) return null;
  if (p.indexOf("\0") !== -1) return null;
  const slashed = p.replace(/\\/g, "/");
  if (slashed.startsWith("/")) return null;
  const norm = path.posix.normalize(slashed);
  if (norm === "." || norm === "..") return null;
  if (norm.startsWith("../") || norm.indexOf("/../") !== -1) return null;
  if (norm.split("/").some((s) => s === "" || s === "..")) return null;
  return norm;
}

/** A pack id, or null. Keeps ids to one safe path segment. */
function safeId(id) {
  if (typeof id !== "string") return null;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) return null;
  return id;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ index */

const index = Search.createIndex();

function buildIndex(records) {
  index.clear();
  for (const rec of records) {
    for (const doc of rec.docs) {
      index.add({ pack: rec.id, path: doc.path, title: doc.title, text: doc.text });
    }
  }
  return index.size();
}

/* The ranking lives in lib/search.js, because the demo page runs the same file
   in a browser and a demo that re-implements the search would drift from it. */
function search(q, limit) {
  return index.search(q, limit);
}

/* ------------------------------------------------------------------ packs */

function packDir(id) {
  return path.join(PACKS, id);
}

/** Every pack on disk, verified. Bad packs are quarantined, never served. */
function loadPacks() {
  fs.mkdirSync(PACKS, { recursive: true });
  const records = [];
  const quarantined = [];

  let entries = [];
  try {
    entries = fs.readdirSync(PACKS, { withFileTypes: true });
  } catch (e) {
    return { records, quarantined };
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const id = safeId(ent.name);
    if (!id) continue;
    const dir = packDir(id);
    const manifestPath = path.join(dir, "manifest.json");

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (e) {
      quarantine(id, "manifest unreadable: " + e.message, quarantined);
      continue;
    }

    const docs = [];
    let problem = null;
    let bytes = 0;

    for (const doc of manifest.docs || []) {
      const rel = safeRel(doc.path);
      if (!rel) {
        problem = "unsafe path in manifest: " + String(doc.path);
        break;
      }
      let buf;
      try {
        buf = fs.readFileSync(path.join(dir, rel));
      } catch (e) {
        problem = "missing file: " + rel;
        break;
      }
      if (buf.length !== doc.bytes || sha256(buf) !== doc.sha256) {
        problem = "checksum mismatch: " + rel;
        break;
      }
      bytes += buf.length;
      docs.push({ path: rel, title: doc.title || rel, text: buf.toString("utf8"), bytes: buf.length });
    }

    if (problem) {
      quarantine(id, problem, quarantined);
      continue;
    }

    records.push({
      id,
      title: manifest.title || id,
      bytes,
      docs
    });
  }

  return { records, quarantined };
}

function quarantine(id, reason, into) {
  const from = packDir(id);
  const to = path.join(QUARANTINE, id);
  try {
    fs.mkdirSync(QUARANTINE, { recursive: true });
    rmrf(to);
    fs.renameSync(from, to);
  } catch (e) {
    // If it cannot be moved, leave it in place — it is already excluded from the
    // index, so it is still not served. Say so rather than pretending.
    into.push({ id, reason, moved: false, error: e.message });
    return;
  }
  into.push({ id, reason, moved: true });
}

/**
 * Import a pack bundle:
 *   { id, title, docs: [ { path, title, content } ] }
 *
 * Written file by file. If a write fails (no space, read-only), the pack is NOT
 * registered and every file that did not land is named.
 */
function importPack(bundle) {
  if (!bundle || typeof bundle !== "object") return { ok: false, error: "bundle is not an object" };
  const id = safeId(bundle.id);
  if (!id) return { ok: false, error: "bad pack id: " + String(bundle.id) };
  if (!Array.isArray(bundle.docs) || bundle.docs.length === 0)
    return { ok: false, error: "pack has no documents" };

  const prepared = [];
  const refused = [];
  for (const d of bundle.docs) {
    const rel = safeRel(d && d.path);
    if (!rel) {
      refused.push({ path: String((d && d.path) || ""), why: "unsafe path" });
      continue;
    }
    if (typeof d.content !== "string") {
      refused.push({ path: rel, why: "content is not text" });
      continue;
    }
    const buf = Buffer.from(d.content, "utf8");
    prepared.push({ path: rel, title: d.title || rel, buf, sha256: sha256(buf), bytes: buf.length });
  }

  if (refused.length) {
    return { ok: false, error: "pack refused: " + refused.length + " unsafe document(s)", refused };
  }

  const dir = packDir(id);
  rmrf(dir);
  fs.mkdirSync(dir, { recursive: true });

  const written = [];
  const failed = [];
  for (const p of prepared) {
    const dest = path.join(dir, p.path);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, p.buf);
      written.push(p.path);
    } catch (e) {
      failed.push({ path: p.path, why: e.code || e.message });
    }
  }

  if (failed.length) {
    // Do not register a half-written pack: a reader cannot tell a missing page
    // from a missing chapter.
    rmrf(dir);
    return {
      ok: false,
      error: "storage refused " + failed.length + " file(s); the pack was not added",
      failed,
      written
    };
  }

  const manifest = {
    id,
    title: bundle.title || id,
    version: 1,
    imported: new Date().toISOString(),
    docs: prepared.map((p) => ({ path: p.path, title: p.title, sha256: p.sha256, bytes: p.bytes }))
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  return { ok: true, id, bytes: prepared.reduce((n, p) => n + p.bytes, 0), docs: prepared.length };
}

function removePack(id) {
  const clean = safeId(id);
  if (!clean) return { ok: false, error: "bad pack id" };
  const dir = packDir(clean);
  if (!fs.existsSync(dir)) return { ok: false, error: "no such pack: " + clean };
  rmrf(dir);
  return { ok: true, id: clean };
}

/* ----------------------------------------------------------------- server */

function state() {
  const { records, quarantined } = loadPacks();
  buildIndex(records);
  return { records, quarantined };
}

let CURRENT = { records: [], quarantined: [] };
function reload() {
  CURRENT = state();
  return CURRENT;
}

function send(res, code, body, type, extra) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  res.writeHead(code, Object.assign({
    "content-type": type || "application/json; charset=utf-8",
    "content-length": buf.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }, extra || {}));
  res.end(buf);
}

function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), "application/json; charset=utf-8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function servePublic(req, res, relPath) {
  const rel = relPath === "/" || relPath === "" ? "index.html" : relPath.replace(/^\/+/, "");
  const clean = safeRel(rel);
  if (!clean) return json(res, 403, { error: "refused" });
  const file = path.join(PUBLIC, clean);
  if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, "index.html")) {
    return json(res, 403, { error: "refused" });
  }
  if (EMBEDDED && Object.prototype.hasOwnProperty.call(EMBEDDED, clean)) {
    return send(res, 200, EMBEDDED[clean],
      MIME[path.extname(clean).toLowerCase()] || "application/octet-stream");
  }
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, 404, { error: "not found" });
    send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
  });
}

/* ---------------------------------------------------------------- settings */

/* Two settings, both per library, both persisted beside the server:
     access   open | approved     who may read at all
     download read-only | allow   whether a reader may take the file
   Nothing here is written until something actually changes, so a plain run
   leaves no file behind. */
const SETTINGS_FILE = process.env.LANTERN_SETTINGS
  ? path.resolve(process.env.LANTERN_SETTINGS)
  : path.join(ROOT, "lantern.json");
const DEFAULTS = { access: "open", download: "read-only", code: null };
const SETTINGS = (function load() {
  try {
    const j = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return Object.assign({}, DEFAULTS, j);
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
})();
function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(SETTINGS, null, 2) + "\n");
  } catch (e) { /* a read-only disk must not stop the library serving */ }
}
function joinCode() {
  if (!SETTINGS.code) {
    SETTINGS.code = String(crypto.randomInt(100000, 999999));
    saveSettings();
  }
  return SETTINGS.code;
}

/* A device is a browser that asked to be let in. Approved ones get a token and
   keep it; pending ones wait for the host to answer. */
const DEVICES = { approved: {}, pending: {} };
function isLocal(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1" || a === "::ffff:7f00:1";
}
function tokenOf(req) {
  const h = req.headers["x-lantern-device"];
  if (h) return String(h);
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)lantern=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function gate(res, req) {
  if (SETTINGS.access !== "approved" || isLocal(req)) return true;
  const t = tokenOf(req);
  if (t && DEVICES.approved[t]) return true;
  json(res, 401, {
    error: "this library is not open to every device",
    join: true,
    hint: "enter the six-digit code shown on the host"
  });
  return false;
}

function makeServer() {
  return http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://lantern.local");
    } catch (e) {
      return json(res, 400, { error: "bad request" });
    }
    const route = decodeURIComponent(url.pathname);

    try {
      if (route === "/api/settings") {
        if (req.method === "GET") {
          return json(res, 200, {
            access: SETTINGS.access,
            download: SETTINGS.download,
            code: SETTINGS.access === "approved" ? joinCode() : null,
            local: isLocal(req),
            pending: isLocal(req) ? Object.keys(DEVICES.pending).length : undefined
          });
        }
        if (req.method === "POST") {
          if (!isLocal(req)) return json(res, 403, { error: "only the host can change this" });
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch (e) {
            return json(res, 400, { error: "settings is not JSON: " + e.message });
          }
          if (body.access !== undefined) {
            if (body.access !== "open" && body.access !== "approved") {
              return json(res, 400, { error: "access is open or approved" });
            }
            SETTINGS.access = body.access;
            if (body.access === "approved") joinCode();
          }
          if (body.download !== undefined) {
            if (body.download !== "read-only" && body.download !== "allow") {
              return json(res, 400, { error: "download is read-only or allow" });
            }
            SETTINGS.download = body.download;
          }
          saveSettings();
          return json(res, 200, { access: SETTINGS.access, download: SETTINGS.download,
            code: SETTINGS.access === "approved" ? joinCode() : null });
        }
        return json(res, 405, { error: "method not allowed" });
      }

      if (route === "/api/join") {
        if (SETTINGS.access !== "approved" || isLocal(req)) {
          return json(res, 200, { ok: true, open: true });
        }
        if (req.method === "POST") {
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch (e) {
            return json(res, 400, { error: "join is not JSON: " + e.message });
          }
          if (String(body.code || "").replace(/\D/g, "") !== joinCode()) {
            return json(res, 403, { error: "that code is not this library's" });
          }
          const id = crypto.randomBytes(16).toString("hex");
          DEVICES.pending[id] = {
            id,
            name: String(body.name || "a device").slice(0, 60),
            asked: new Date().toISOString()
          };
          return json(res, 202, { ok: true, pending: id });
        }
        if (req.method === "GET") {
          const id = url.searchParams.get("id") || "";
          if (DEVICES.approved[id]) return json(res, 200, { state: "approved", token: id });
          if (DEVICES.pending[id]) return json(res, 200, { state: "pending" });
          return json(res, 200, { state: "unknown" });
        }
        return json(res, 405, { error: "method not allowed" });
      }

      if (route === "/api/pending") {
        if (!isLocal(req)) return json(res, 403, { error: "only the host sees the list" });
        if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
        return json(res, 200, {
          pending: Object.values(DEVICES.pending),
          approved: Object.values(DEVICES.approved)
        });
      }

      if (route.startsWith("/api/pending/") && req.method === "POST") {
        if (!isLocal(req)) return json(res, 403, { error: "only the host can let someone in" });
        const id = route.slice("/api/pending/".length);
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (e) {
          return json(res, 400, { error: "not JSON: " + e.message });
        }
        const wait = DEVICES.pending[id];
        if (!wait) return json(res, 404, { error: "no such request" });
        delete DEVICES.pending[id];
        if (body.let === true) {
          DEVICES.approved[id] = { id, name: wait.name, since: new Date().toISOString() };
          return json(res, 200, { ok: true, state: "approved" });
        }
        return json(res, 200, { ok: true, state: "refused" });
      }

      if (route === "/api/health") {
        reload(); // reflect what is actually on disk, not a stale snapshot
        return json(res, 200, {
          ok: true,
          app: "lantern",
          packs: CURRENT.records.length,
          docs: index.size(),
          quarantined: CURRENT.quarantined.length
        });
      }

      if ((route === "/api/packs" || route.startsWith("/api/packs/") ||
           route === "/api/search" || route.startsWith("/p/"))) {
        if (!gate(res, req)) return;
      }

      if (route === "/api/packs" && req.method === "GET") {
        reload(); // the pack manager reports the disk, not a stale snapshot
        return json(res, 200, {
          packs: CURRENT.records.map((r) => ({
            id: r.id,
            title: r.title,
            bytes: r.bytes,
            docs: r.docs.length,
            paths: r.docs.map((d) => d.path)
          })),
          quarantined: CURRENT.quarantined,
          docs: index.size()
        });
      }

      if (route === "/api/packs" && req.method === "POST") {
        let bundle;
        try {
          bundle = JSON.parse(await readBody(req));
        } catch (e) {
          return json(res, 400, { error: "bundle is not JSON: " + e.message });
        }
        const result = importPack(bundle);
        if (result.ok) reload();
        return json(res, result.ok ? 201 : 400, result);
      }

      if (route.startsWith("/api/packs/") && req.method === "DELETE") {
        const id = route.slice("/api/packs/".length);
        const result = removePack(id);
        if (result.ok) reload();
        return json(res, result.ok ? 200 : 404, result);
      }

      if (route === "/api/search") {
        const q = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit") || "20", 10);
        return json(res, 200, { query: q, hits: search(q, limit) });
      }

      if (route.startsWith("/p/")) {
        const rest = route.slice(3);
        const cut = rest.indexOf("/");
        if (cut === -1) return json(res, 404, { error: "no document" });
        const packId = safeId(rest.slice(0, cut));
        const rel = safeRel(rest.slice(cut + 1));
        if (!packId || !rel) return json(res, 403, { error: "refused: path outside the pack" });
        const rec = CURRENT.records.find((r) => r.id === packId);
        if (!rec) return json(res, 404, { error: "no such pack: " + packId });
        const doc = rec.docs.find((d) => d.path === rel);
        if (!doc) return json(res, 404, { error: "no such document: " + rel });
        const type = MIME[path.extname(rel).toLowerCase()] || "text/html; charset=utf-8";
        if (url.searchParams.get("download") !== null) {
          if (SETTINGS.download !== "allow") {
            return json(res, 403, {
              error: "this library is read-only",
              hint: "the host can allow downloads in its settings"
            });
          }
          return send(res, 200, doc.text, type, {
            "content-disposition": 'attachment; filename="' +
              path.basename(rel).replace(/[^\w.\- ]/g, "_") + '"'
          });
        }
        return send(res, 200, doc.text, type);
      }

      if (req.method === "GET" || req.method === "HEAD") return servePublic(req, res, route);
      return json(res, 405, { error: "method not allowed" });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  });
}

/** Addresses a phone on the same Wi-Fi can open. */
function lanAddresses(port) {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push("http://" + net.address + ":" + port + "/");
    }
  }
  return out;
}

function listen(port, host) {
  reload();
  const server = makeServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port === undefined ? 8080 : port, host || "0.0.0.0", () => {
      const actual = server.address().port;
      resolve({
        server,
        port: actual,
        addresses: lanAddresses(actual),
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

module.exports = {
  listen,
  search,
  importPack,
  removePack,
  reload,
  safeRel,
  safeId,
  index,
  lanAddresses,
  PACKS,
  QUARANTINE
};

if (require.main === module) {
  const port = parseInt(process.env.PORT || process.argv[2] || "8080", 10);
  listen(port).then((h) => {
    const urls = h.addresses.length ? h.addresses : ["http://localhost:" + h.port + "/"];
    console.log("Lantern is serving " + index.size() + " document(s) on port " + h.port);
    console.log("Open on any device on this Wi-Fi:");
    for (const u of urls) console.log("  " + u);
    console.log("No internet is used at any point.");
  }).catch((e) => {
    console.error("Lantern could not start: " + e.message);
    process.exit(1);
  });
}
