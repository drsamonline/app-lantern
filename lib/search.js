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
