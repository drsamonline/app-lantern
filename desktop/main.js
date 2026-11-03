"use strict";
/**
 * Lantern, in a window.
 *
 * The desktop build is the same app: it starts the same server on a free port
 * and points a window at it. What it adds is what a browser cannot do — no
 * address bar, no devtools, no File menu, no "Save page". That is the read-only
 * promise made as real as it can be made on a machine the reader controls.
 *
 * Windows and Linux only. This estate does not ship Apple builds.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { start } = require("./boot.js");

let win = null;
let host = null;

async function boot() {
  try {
    host = await start({ port: 0 });
  } catch (err) {
    dialog.showErrorBox("Lantern could not start", String(err && err.message ? err.message : err));
    app.quit();
    return;
  }

  /* The addresses a phone in the room should type. Printed so the host can read
     them out even if the window is not in front. */
  console.log("Lantern is serving this library at:");
  console.log("  " + host.url + "  (this computer)");
  for (const a of host.addresses) console.log("  " + a + "  (phones and laptops on the same Wi-Fi)");

  win = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#0b0e12",
    title: "Lantern",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devtools: false,          /* the read-only promise, as far as it goes */
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadURL(host.url);

  /* A link to GitHub belongs in the browser, never inside the library window. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (host && url.startsWith(host.url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  win.on("closed", () => { win = null; });
}

app.whenReady().then(boot);

app.on("activate", () => { if (!win && host) boot(); });

app.on("window-all-closed", async () => {
  if (host) {
    try { await host.close(); } catch (e) { /* the process is going anyway */ }
    host = null;
  }
  app.quit();
});
