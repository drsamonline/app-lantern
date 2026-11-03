#!/usr/bin/env node
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
const Search = require("./lib/search.js");

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
