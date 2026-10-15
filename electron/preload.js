/*
 * electron/preload.js
 * Lets the Mii Hub page talk to the desktop app safely: it can show the
 * version number, ask for an update check, and host online Paintball games.
 * (Not used in the browser version.)
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miiHubDesktop", {
  getStatus: () => ipcRenderer.invoke("update-get-status"),
  checkForUpdates: () => ipcRenderer.invoke("update-check"),
  openReleases: () => ipcRenderer.invoke("update-open-releases"),
  onUpdateStatus: (callback) => ipcRenderer.on("update-status", (_e, status) => callback(status)),
  paintballHost: {
    start: () => ipcRenderer.invoke("pb-host-start"),
    details: () => ipcRenderer.invoke("pb-host-details"),
    stop: () => ipcRenderer.invoke("pb-host-stop"),
  },
});
