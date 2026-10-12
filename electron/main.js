/*
 * electron/main.js
 * Runs Mii Hub as a desktop app (its own window and icon) using Electron.
 * The app itself is the same index.html the browser version uses.
 */
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// Only one Mii Hub window at a time; opening it again just brings it to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    title: "Mii Hub",
    backgroundColor: "#eef3f8",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.once("ready-to-show", () => win.show());

  // Links open in the normal web browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Dropping a file outside the drop area shouldn't replace the app with that file.
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  // F11 = full screen, Ctrl/Cmd + R = reload, Ctrl/Cmd + Shift + I = developer tools
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const mod = input.control || input.meta;
    if (input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (mod && input.key.toLowerCase() === "r") { win.reload(); e.preventDefault(); }
    else if (mod && input.shift && input.key.toLowerCase() === "i") { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  win.on("closed", () => { win = null; });
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
