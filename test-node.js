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
function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(
      typeof body === "string" ? body : JSON.stringify(body), "utf8");
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: urlPath, method,
        headers: payload ? { "content-type": "application/json", "content-length": payload.length } : {} },
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

const lantern = require("./server.js");

let passed = 0;
const failures = [];

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
  ok(loneHealth && loneHealth.status === 200, "the single file starts on its own (" + (said.split("\n")[0] || "no output") + ")");
  const lonePage = loneHealth ? await ask("/") : null;
  ok(lonePage && lonePage.status === 200 && /Lantern/.test(lonePage.body),
     "the single file serves the client with no public/ folder beside it");
  const loneIcon = loneHealth ? await ask("/icon.svg") : null;
  ok(loneIcon && loneIcon.status === 200 && /<svg/.test(loneIcon.body),
     "the single file serves the icon it carries");
  child.kill();
  fs.rmSync(lone, { recursive: true, force: true });

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
