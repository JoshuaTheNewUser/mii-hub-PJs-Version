/*
 * electron/updater.js
 * Checks GitHub for a newer version of Mii Hub and offers to install it.
 *
 *  - Windows and Linux: the update downloads in the background, then Mii Hub
 *    offers to restart into the new version (your Miis are kept).
 *  - Mac: Apple only lets apps update themselves if they're signed with a paid
 *    developer certificate, so on Mac we tell you about the update and open the
 *    download page instead.
 *
 * It checks a few seconds after starting, then every 4 hours, and whenever you
 * click "Check for updates" in the app.
 */
const { app, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const OWNER = "sneekyedd";
const REPO = "mii-hub";
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
// For testing: MIIHUB_UPDATE_TEST=1 answers "yes" to every question and logs instead.
const TEST = process.env.MIIHUB_UPDATE_TEST === "1";

let win = null;
let manual = false;     // was this check started by the "Check for updates" button?
let busy = false;       // already downloading?
let status = { state: "idle", version: app.getVersion() };

function send(state, extra) {
  status = Object.assign({ state, version: app.getVersion() }, extra || {});
  if (TEST) console.log("[update]", JSON.stringify(status));
  if (win && !win.isDestroyed()) win.webContents.send("update-status", status);
}

async function ask(options) {
  if (TEST) {
    console.log("[update] would ask:", options.message);
    return 0;
  }
  if (!win || win.isDestroyed()) return 1;
  const r = await dialog.showMessageBox(win, Object.assign({ type: "info", noLink: true, cancelId: 1, defaultId: 0 }, options));
  return r.response;
}

// "1.0.12" vs "1.0.9" -> true if a is newer than b
function isNewer(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// ---- Mac: look at the latest release on GitHub and point to the download ----
async function checkMac() {
  send("checking");
  try {
    const res = await fetch(LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error("GitHub said " + res.status);
    const rel = await res.json();
    const latest = String(rel.tag_name || "").replace(/^v/, "");
    if (latest && isNewer(latest, app.getVersion())) {
      send("available", { latest });
      const r = await ask({
        title: "Update available",
        message: `Mii Hub ${latest} is available!`,
        detail: `You have version ${app.getVersion()}. Your Miis and friendships will be kept.\n\n` +
          "To update on a Mac: download the new .dmg, open it, and drag Mii Hub into Applications (replace the old one).",
        buttons: ["Download update", "Later"],
      });
      if (r === 0) shell.openExternal(rel.html_url || RELEASES_PAGE);
    } else {
      send("latest");
      if (manual) await ask({ title: "No updates", message: "You have the latest version of Mii Hub!", detail: `Version ${app.getVersion()}`, buttons: ["OK"] });
    }
  } catch (e) {
    send("error", { message: e.message });
    if (manual) await ask({ type: "warning", title: "Couldn't check for updates", message: "Couldn't check for updates.", detail: e.message + "\n\nAre you connected to the internet?", buttons: ["OK"] });
  }
}

// ---- Windows / Linux: electron-updater downloads and installs for us ----
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;        // ask first
  autoUpdater.autoInstallOnAppQuit = true; // if you pick "Later", it installs when you close Mii Hub

  autoUpdater.on("checking-for-update", () => send("checking"));

  autoUpdater.on("update-available", async (info) => {
    send("available", { latest: info.version });
    if (busy) return;
    const r = await ask({
      title: "Update available",
      message: `Mii Hub ${info.version} is available!`,
      detail: `You have version ${app.getVersion()}. Would you like to update now?\n\nYour Miis and friendships will be kept.`,
      buttons: ["Update now", "Later"],
    });
    if (r === 0) {
      busy = true;
      send("downloading", { latest: info.version, percent: 0 });
      autoUpdater.downloadUpdate().catch((e) => {
        busy = false;
        send("error", { message: e.message });
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    send("latest");
    if (manual) ask({ title: "No updates", message: "You have the latest version of Mii Hub!", detail: `Version ${app.getVersion()}`, buttons: ["OK"] });
  });

  autoUpdater.on("download-progress", (p) => {
    if (win && !win.isDestroyed()) win.setProgressBar(p.percent / 100);
    send("downloading", { latest: status.latest, percent: Math.round(p.percent) });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    busy = false;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    send("ready", { latest: info.version });
    const r = await ask({
      title: "Update ready",
      message: `Mii Hub ${info.version} is ready to install!`,
      detail: "Restart Mii Hub now to finish updating? (If you choose Later, it'll update the next time you close it.)",
      buttons: ["Restart now", "Later"],
    });
    if (r === 0 && !TEST) setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  autoUpdater.on("error", (e) => {
    busy = false;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    send("error", { message: (e && e.message) || String(e) });
    if (manual) ask({ type: "warning", title: "Update problem", message: "Couldn't check for updates.", detail: ((e && e.message) || String(e)).slice(0, 300) + "\n\nYou can always download the newest version from GitHub.", buttons: ["OK"] });
  });
}

function check(isManual) {
  manual = !!isManual;
  if (process.platform === "darwin") return checkMac();
  if (busy) return;
  autoUpdater.checkForUpdates().catch((e) => send("error", { message: e.message }));
}

function setup(window) {
  win = window;
  // Only the installed app updates itself (not when running from the source code with `npm start`).
  if (!app.isPackaged && !TEST) {
    send("dev");
    return;
  }
  if (process.platform !== "darwin") setupAutoUpdater();
  setTimeout(() => check(false), 5000);
  setInterval(() => check(false), 4 * 60 * 60 * 1000);
}

module.exports = { setup, check, getStatus: () => status, isNewer, RELEASES_PAGE };
