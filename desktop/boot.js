"use strict";
/**
 * The seam between the app and whatever is hosting it.
 *
 * The Electron window, `node server.js` and the tests all start the library the
 * same way, so there is one place where "how does this app begin" is decided.
 * Plain Node can require this file — which is why the desktop build is testable
 * without launching a window.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
const lantern = require("../server.js");

/**
 * Start the library and say where to find it.
 * @param {{port?: number, host?: string}} options port 0 picks a free one.
 * @returns {Promise<{port: number, url: string, addresses: string[], close: () => Promise<void>}>}
 */
async function start(options) {
  const opts = options || {};
  const host = await lantern.listen(
    opts.port === undefined ? 0 : opts.port,
    opts.host || "0.0.0.0"
  );
  return {
    port: host.port,
    url: "http://127.0.0.1:" + host.port + "/",
    addresses: host.addresses,
    close: host.close
  };
}

module.exports = { start };
