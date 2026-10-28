
const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "eBricks",
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Log loading errors
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Page loading failed:", {
      errorCode,
      errorDescription,
      validatedURL
    });
  });

  // Log JavaScript errors
  win.webContents.on("console-message", (_event, level, message) => {
    const text = typeof message === "string" ? message : (level?.message || level);
    console.log("Renderer console:", text);
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }

  win.loadFile(path.join(__dirname, "../dist/index.html"))
    .catch(error => console.error("Failed to load eBricks:", error));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
