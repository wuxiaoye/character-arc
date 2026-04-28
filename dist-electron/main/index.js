"use strict";
const electron = require("electron");
const node_path = require("node:path");
const APP_MIN_WIDTH = 1360;
const APP_MIN_HEIGHT = 860;
function createMainWindow() {
  const window = new electron.BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: APP_MIN_WIDTH,
    minHeight: APP_MIN_HEIGHT,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    // Keep native caption buttons while giving the renderer a compact title-bar area to style around.
    titleBarOverlay: process.platform === "win32" ? {
      color: "#f5f5f7",
      symbolColor: "#1d1d1f",
      height: 28
    } : false,
    backgroundColor: "#f5f5f7",
    show: false,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.once("ready-to-show", () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(node_path.join(__dirname, "../../dist/index.html"));
  }
}
electron.app.whenReady().then(() => {
  createMainWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
