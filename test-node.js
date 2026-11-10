#!/usr/bin/env node
/**
 * Lantern — the proof.
 *
 * Every claim in the spec's "Done means" is checked here over real HTTP against a
 * real host, not by calling functions directly: the point of a LAN app is that a
 * plain browser on the network can read it, so the test uses the same routes a
 * browser would.
 *
 *   node test-node.js
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
/* A tiny fetch, on Node's own http module — the sandbox's egress proxy gets in
   the way of undici here, and a LAN test must not depend on the internet's
   plumbing anyway. */
function request(method, urlPath, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(
      typeof body === "string" ? body : JSON.stringify(body), "utf8");
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: urlPath, method,
        headers: Object.assign({},
          payload ? { "content-type": "application/json", "content-length": payload.length } : {},
          extraHeaders || {}) },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            headers: { get: (k) => res.headers[String(k).toLowerCase()] },
            text: async () => text,
            json: async () => JSON.parse(text)
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const get = (p) => request("GET", p);
const post = (p, b) => request("POST", p, b);
let PORT = 0;


const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lantern-test-"));
process.env.LANTERN_PACKS = path.join(TMP, "packs");
process.env.LANTERN_QUARANTINE = path.join(TMP, "quarantine");

/* Settings live beside the server by default. A test run must not leave one in
   the repository, and must start from the defaults every time. */
process.env.LANTERN_SETTINGS = path.join(os.tmpdir(), "lantern-test-settings.json");
try { fs.unlinkSync(process.env.LANTERN_SETTINGS); } catch (e) { /* fine */ }

const lantern = require("./server.js");

let passed = 0;
const failures = [];

let FIRST_DOC = "";
async function CURRENT_FIRST_DOC() {
  if (FIRST_DOC) return FIRST_DOC;
  let packs = await (await get("/api/packs")).json();
  if (!packs.packs.length) {
    const starter = JSON.parse(fs.readFileSync(path.join(__dirname, "examples/starter-pack.json"), "utf8"));
    await post("/api/packs", starter);
    packs = await (await get("/api/packs")).json();
  }
  for (const p of packs.packs) {
    for (const rel of p.paths || []) {
      if ((await get("/p/" + p.id + "/" + rel)).status === 200) {
        FIRST_DOC = p.id + "/" + rel;
        return FIRST_DOC;
      }
    }
  }
  throw new Error("no readable document to test with");
}

function ok(cond, name) {
  if (cond) {
    passed++;
  } else {
    failures.push(name);
    console.error("FAIL  " + name);
  }
}

function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failures.push(name);
    console.error("FAIL  " + name + "\n        expected " + e + "\n        got      " + a);
  }
}

const sha = (s) => crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

const PACK_A = {
  id: "clinic",
  title: "Clinic Notes",
  docs: [
    {
      path: "burns.html",
      title: "Burns",
      content: "<h1>Burns</h1><p>Cool the burn under running water for twenty minutes.</p>"
    },
    {
      path: "fever.md",
      title: "Fever",
      content: "<h1>Fever</h1><p>Rest, fluids, and watch for a stiff neck.</p>"
    }
  ]
};

const PACK_B = {
  id: "school",
  title: "School Papers",
  docs: [
    {
      path: "papers/2023-maths.txt",
      title: "2023 Mathematics",
      content: "Section A. Solve for x. The hypotenuse of the triangle is required."
    },
    {
      path: "papers/2023-science.txt",
      title: "2023 Science",
      content: "Section A. Name the parts of a flower."
    },
    {
      path: "papers/2023-geography.txt",
      title: "2023 Geography",
      content: "The water cycle. A river running to the sea carries silt."
    }
  ]
};

async function main() {
  const host = await lantern.listen(0, "127.0.0.1");
  PORT = host.port;

  /* 1. It is a server, and it says so. */
  const health = await (await get("/api/health")).json();
  eq(health.ok, true, "health reports ok");
  eq(health.app, "lantern", "health names the app");
  ok(host.port > 0, "the host took a real port");
  ok(Array.isArray(host.addresses), "the host can list LAN addresses");

  /* 2. A plain browser gets the client page — no build step, no bundler. */
  const pageRes = await get("/");
  const page = await pageRes.text();
  eq(pageRes.status, 200, "the client page is served at /");
  ok(/Lantern/.test(page), "the client page is Lantern's");
  ok(/lan-kit\.js/.test(page), "the page loads the lan-kit it ships");

  /* 3. Import a pack. */
  const imp = await post("/api/packs", PACK_A);
  const impBody = await imp.json();
  eq(imp.status, 201, "a pack bundle is accepted");
  eq(impBody.docs, 2, "both documents were written");
  eq(impBody.bytes, PACK_A.docs.reduce((n, d) => n + Buffer.byteLength(d.content, "utf8"), 0),
     "the import reports the true byte count");

  const impB = await (await post("/api/packs", PACK_B)).json();
  eq(impB.ok, true, "a second pack is accepted");

  /* 4. A document is readable over HTTP, exactly as a browser on the Wi-Fi reads it. */
  const docRes = await get("/p/clinic/burns.html");
  const docText = await docRes.text();
  eq(docRes.status, 200, "a document is served");
  ok(/twenty minutes/.test(docText), "the document body arrives intact");
  ok(/text\/html/.test(docRes.headers.get("content-type") || ""), "the document keeps its type");

  /* 5. The pack manager reports each pack's TRUE byte size, from disk. */
  const packs = await (await get("/api/packs")).json();
  const onDisk = (id) => {
    const dir = path.join(process.env.LANTERN_PACKS, id);
    return fs.readdirSync(dir, { recursive: true })
      .map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).isFile() && path.basename(f) !== "manifest.json")
      .reduce((n, f) => n + fs.statSync(f).size, 0);
  };
  const clinic = packs.packs.find((p) => p.id === "clinic");
  eq(clinic.bytes, onDisk("clinic"), "the pack manager's size matches the files on disk");
  eq(packs.docs, 5, "the index holds every document from both packs");

  /* 6. A phrase in exactly one document comes back FIRST — ahead of documents that
        merely carry its words. This is the assertion that would pass on tf-idf
        alone if the phrase were not tracked, so the pack is built to discriminate:
        "water" and "running" both appear in the geography paper, the phrase only
        in the burns page. */
  const phrase = "running water";
  const s1 = await (await get("/api/search?q=" + encodeURIComponent(phrase))).json();
  ok(s1.hits.length >= 2, "the phrase's words alone match more than one document");
  eq(s1.hits[0] && s1.hits[0].path, "burns.html", "the document holding the phrase ranks first");
  eq(s1.hits[0] && s1.hits[0].pack, "clinic", "and it is the right pack");

  const s2 = await (await get("/api/search?q=hypotenuse")).json();
  eq(s2.hits.length, 1, "a word in one document returns exactly one hit");
  eq(s2.hits[0].pack, "school", "and it is the right pack");

  /* 7. Removing a pack removes its documents from search. */
  const del = await request("DELETE", "/api/packs/school");
  eq(del.status, 200, "a pack can be removed");
  const s3 = await (await get("/api/search?q=hypotenuse")).json();
  eq(s3.hits.length, 0, "a removed pack's documents are gone from search");
  const gone = await get("/p/school/papers/2023-maths.txt");
  eq(gone.status, 404, "a removed pack's document is no longer served");
  const stillThere = await (await get("/api/search?q=" + encodeURIComponent("stiff neck"))).json();
  eq(stillThere.hits[0] && stillThere.hits[0].pack, "clinic", "the other pack is untouched");

  /* 8. A request for a path outside the pack is refused. */
  const trav = await get("/p/clinic/..%2F..%2F..%2Fetc%2Fpasswd");
  eq(trav.status, 403, "path traversal out of a pack is refused");
  const trav2 = await get("/p/clinic/%2Fetc%2Fpasswd");
  eq(trav2.status, 403, "an absolute path is refused");
  eq(lantern.safeRel("../etc/passwd"), null, "safeRel refuses ..");
  eq(lantern.safeRel("a/../../b"), null, "safeRel refuses an embedded ..");
  eq(lantern.safeRel("papers/2023.txt"), "papers/2023.txt", "safeRel allows a plain nested path");

  /* 9. A pack with an unsafe path is refused and named, not served partially. */
  const bad = await post("/api/packs", { id: "evil", title: "Evil", docs: [{ path: "../escape.txt", content: "x" }] });
  const badBody = await bad.json();
  eq(bad.status, 400, "an unsafe document path is refused");
  ok(/unsafe/.test(badBody.error || ""), "and the refusal says why");
  eq(fs.existsSync(path.join(process.env.LANTERN_PACKS, "evil")), false, "nothing was written for it");

  /* 10. Bad input is refused with the value shown. */
  const noDocs = await (await post("/api/packs", { id: "empty", title: "Empty", docs: [] })).json();
  ok(/no documents/.test(noDocs.error || ""), "a pack with no documents is refused");
  const notJson = await post("/api/packs", "{oops");
  eq(notJson.status, 400, "a bundle that is not JSON is refused");

  /* 11. Storage refusing a write: the pack is NOT added and the files are named. */
  const realWrite = fs.writeFileSync;
  let calls = 0;
  fs.writeFileSync = function (file, data) {
    if (String(file).includes(path.join("packs", "nostore"))) {
      calls++;
      const err = new Error("no space left on device");
      err.code = "ENOSPC";
      throw err;
    }
    return realWrite.apply(fs, arguments);
  };
  let noStore;
  try {
    noStore = await (await post("/api/packs", { id: "nostore", title: "No Store", docs: [{ path: "a.txt", content: "aaa" }] })).json();
  } finally {
    fs.writeFileSync = realWrite;
  }
  eq(calls > 0, true, "the write really was attempted");
  eq(noStore.ok, false, "a pack that cannot be written is not added");
  ok(/not added/.test(noStore.error || ""), "the app says the pack was not added");
  eq((noStore.failed || []).map((f) => f.path), ["a.txt"], "and names the file that did not land");
  eq(fs.existsSync(path.join(process.env.LANTERN_PACKS, "nostore")), false,
     "no half-written pack is left behind");
  const afterNoStore = await (await get("/api/search?q=aaa")).json();
  eq(afterNoStore.hits.length, 0, "the failed pack contributes nothing to search");

  /* 12. A corrupt saved state is quarantined and reported, never served partially. */
  const corruptDir = path.join(process.env.LANTERN_PACKS, "corrupt");
  fs.mkdirSync(corruptDir, { recursive: true });
  fs.writeFileSync(path.join(corruptDir, "page.txt"), "tampered");
  fs.writeFileSync(path.join(corruptDir, "manifest.json"), JSON.stringify({
    id: "corrupt", title: "Corrupt", docs: [
      { path: "page.txt", title: "Page", sha256: sha("original"), bytes: 8 }
    ]
  }));
  const withCorrupt = await (await get("/api/packs")).json();
  ok(withCorrupt.quarantined.some((q) => q.id === "corrupt"), "a checksum mismatch is quarantined");
  ok(/checksum mismatch/.test((withCorrupt.quarantined.find((q) => q.id === "corrupt") || {}).reason || ""),
     "and the reason is a checksum mismatch");
  eq(fs.existsSync(path.join(process.env.LANTERN_QUARANTINE, "corrupt")), true,
     "the bad pack is moved out of the served folder");
  const corruptServe = await get("/p/corrupt/page.txt");
  eq(corruptServe.status, 404, "a quarantined pack is not served");
  const corruptSearch = await (await get("/api/search?q=tampered")).json();
  eq(corruptSearch.hits.length, 0, "and it is not searchable");
  eq(withCorrupt.docs, 2, "the good pack still indexes exactly its own documents");

  /* 13. With no peers and no internet, the library still opens. */
  const alone = await (await get("/api/health")).json();
  eq(alone.ok, true, "the library opens with nothing else on the network");
  eq(alone.packs, 1, "and reports the one pack it holds");

  /* 14. The builds. A "build" that has never been run is a folder of hopes. */
  const { execFileSync, spawn } = require("child_process");
  const repoRoot = __dirname;

  const first = execFileSync(process.execPath, ["tools/build.mjs"], { cwd: repoRoot, encoding: "utf8" });
  ok(/dist\/lantern\.js/.test(first), "the build reports the single file");
  const second = execFileSync(process.execPath, ["tools/build.mjs"], { cwd: repoRoot, encoding: "utf8" });
  ok(/everything already current/.test(second),
     "a second build changes nothing, so the committed artefacts are current");

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const zipPath = path.join(repoRoot, "dist", "lantern-" + pkg.version + ".zip");
  ok(fs.existsSync(zipPath), "the bundle exists at the version in package.json");
  const zipBuf = fs.readFileSync(zipPath);
  eq(zipBuf.subarray(0, 2).toString("binary"), "PK", "the bundle starts with a zip signature");
  const entries = (zipBuf.toString("binary").match(/PK\u0001\u0002/g) || []).length;
  ok(entries >= 10, "the bundle carries every file (" + entries + " entries)");
  ok(zipBuf.toString("utf8").includes("START-HERE.txt"), "the bundle says how to start");

  /* The single file must be the WHOLE app: copied alone into an empty folder,
     with no public/ beside it, it still serves the page and the icon. */
  /* 13b. The bundle is LF, and starts with the shebang and not a BOM.
     A CRLF shebang is a syntax error to Node 20 — which is exactly how the
     Desktop build failed on Windows: the checkout converted the file, and the
     copy that was supposed to run on its own would not parse. */
  const bundle = fs.readFileSync(path.join(repoRoot, "dist", "lantern.js"));
  ok(bundle[0] === 0x23 && bundle[1] === 0x21, "the bundle starts with #!, not a BOM");
  ok(bundle.indexOf(Buffer.from("\r\n")) === -1,
     "the bundle is LF-only — a CRLF shebang will not parse");

  const lone = fs.mkdtempSync(path.join(os.tmpdir(), "lantern-lone-"));
  fs.copyFileSync(path.join(repoRoot, "dist", "lantern.js"), path.join(lone, "lantern.js"));
  const env = Object.assign({}, process.env);
  delete env.PORT;
  const lonePort = 18000 + (process.pid % 2000);
  const child = spawn(process.execPath, ["lantern.js", String(lonePort)], {
    cwd: lone, env, stdio: ["ignore", "pipe", "pipe"]
  });
  let said = "";
  child.stdout.on("data", (d) => { said += d; });
  child.stderr.on("data", (d) => { said += d; });

  const ask = (p) => new Promise((resolve) => {
    const r = http.request({ host: "127.0.0.1", port: lonePort, path: p }, (res) => {
      let b = "";
      res.on("data", (c) => { b += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    r.on("error", () => resolve(null));
    r.end();
  });

  let loneHealth = null;
  for (let i = 0; i < 40 && !loneHealth; i++) {
    loneHealth = await ask("/api/health");
    if (!loneHealth) await new Promise((r) => setTimeout(r, 100));
  }
  ok(loneHealth && loneHealth.status === 200,
     "the single file starts on its own (" + (said.trim().slice(0, 900) || "no output") + ")");
  const lonePage = loneHealth ? await ask("/") : null;
  ok(lonePage && lonePage.status === 200 && /Lantern/.test(lonePage.body),
     "the single file serves the client with no public/ folder beside it");
  const loneIcon = loneHealth ? await ask("/icon.svg") : null;
  ok(loneIcon && loneIcon.status === 200 && /<svg/.test(loneIcon.body),
     "the single file serves the icon it carries");
  child.kill();
  /* Windows holds the file for a moment after the kill, and rmSync then throws
     EBUSY on the temp folder. Wait for the child to actually exit, and treat the
     cleanup as best-effort: a temp directory is not worth a red build. */
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(resolve, 2000);
  });
  for (let i = 0; i < 5; i++) {
    try { fs.rmSync(lone, { recursive: true, force: true }); break; }
    catch (e) { if (i === 4) break; await new Promise((r) => setTimeout(r, 200)); }
  }

  /* 14b. The two modes. Both default safe, and both are enforced by the server. */
  const settings0 = await (await get("/api/settings")).json();
  eq(settings0.access, "open", "access defaults to open");
  eq(settings0.download, "read-only", "download defaults to read-only");

  const firstDoc = await CURRENT_FIRST_DOC(); /* pack id + path of a real document */
  const dl0 = await get("/p/" + firstDoc + "?download=1");
  eq(dl0.status, 403, "read-only refuses a download");
  eq((await dl0.json()).error, "this library is read-only", "and says why");
  ok(!dl0.headers.get("content-disposition"), "and sets no attachment header");

  const dl0plain = await get("/p/" + firstDoc);
  eq(dl0plain.status, 200, "the same document still reads in the app");
  ok(!dl0plain.headers.get("content-disposition"), "reading is not a download");

  const set1 = await post("/api/settings", { download: "allow" });
  eq(set1.status, 200, "the host can allow downloads");
  const dl1 = await get("/p/" + firstDoc + "?download=1");
  eq(dl1.status, 200, "allow lets the file through");
  ok(/attachment/.test(String(dl1.headers.get("content-disposition"))), "with an attachment header");

  /* Access mode. The host is always let in, by design — the owner runs the
     library on the machine it is served from. So what a loopback test can prove
     is the default, the code, and that an open library answers a join; the
     refusal of an unapproved device is asserted by the audit against the source,
     and needs a second device on a real LAN to see over HTTP. */
  eq((await (await get("/api/join")).json()).open, true,
     "an open library answers a join without a code");

  const set2 = await post("/api/settings", { access: "approved", download: "read-only" });
  eq(set2.status, 200, "the host can require approval");
  const code = (await (await get("/api/settings")).json()).code;
  ok(/^\d{6}$/.test(String(code || "")), "approved mode has a six-digit code");

  const localJoin = await get("/api/join");
  eq((await localJoin.json()).open, true, "the host itself is always let in");

  eq((await post("/api/settings", { access: "sideways" })).status, 400,
     "an unknown access mode is refused");
  eq((await post("/api/settings", { download: "everything" })).status, 400,
     "an unknown download mode is refused");

  await post("/api/settings", { access: "open", download: "read-only" });

  /* 14c. The desktop build starts the same server from the same seam, so a
     window and a terminal run the identical library. */
  const boot = require("./desktop/boot.js");
  const desk = await boot.start({ port: 0 });
  ok(desk.port > 0, "the desktop seam takes a real port");
  ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(desk.url), "and returns a url a window can load");
  const deskHealth = await new Promise((resolve, reject) => {
    http.get(desk.url + "api/health", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    }).on("error", reject);
  });
  eq(deskHealth.status, 200, "the window's server answers health");
  ok(/"app":"lantern"/.test(deskHealth.body.replace(/\s+/g, "")), "and says it is lantern");
  await desk.close();

  /* 15. The audit: every claim in the README checked against the repository. */
  let auditOut = "";
  let auditCode = 0;
  try {
    auditOut = execFileSync(process.execPath, ["tools/audit.mjs"], { cwd: repoRoot, encoding: "utf8" });
  } catch (e) {
    auditCode = e.status || 1;
    auditOut = String(e.stdout || "");
  }
  eq(auditCode, 0, "the repository passes its own audit");
  ok(/passed, 0 failed/.test(auditOut), "the audit reports no failures");

  await host.close();
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log("");
  console.log(passed + " passed, " + failures.length + " failed");
  if (failures.length) {
    console.error("Failed: " + failures.join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("test crashed: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
