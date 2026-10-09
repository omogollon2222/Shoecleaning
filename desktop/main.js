// App de escritorio para Windows: abre Shoe Cleaning en su propia ventana.
// Carga la versión publicada en GitHub Pages, así cada mejora que se publique
// llega sola al computador, con los mismos datos de Firebase que los celulares.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

const APP_URL = "https://omogollon2222.github.io/Shoecleaning/";
const ICON = path.join(__dirname, "build", "icon.png");

if (!app.requestSingleInstanceLock()) app.quit();

let win;
const isApp = url => url.startsWith(APP_URL);

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 380, minHeight: 600,
    title: "Shoe Cleaning", icon: ICON, backgroundColor: "#f3f8fc",
    autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true }
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => { win.maximize(); win.show(); });

  // WhatsApp y demás enlaces externos se abren en el navegador o en WhatsApp Desktop
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|whatsapp):/i.test(url) && !isApp(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isApp(url) && !url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); }
  });

  // Primera vez sin internet: pantalla con botón para reintentar
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    if (isMain && isApp(url)) win.loadFile(path.join(__dirname, "offline.html"));
  });

  // Clic derecho: copiar, pegar, cortar
  win.webContents.on("context-menu", (e, p) => {
    const items = [];
    if (p.isEditable) items.push({ role: "cut", label: "Cortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Pegar" }, { type: "separator" }, { role: "selectAll", label: "Seleccionar todo" });
    else if (p.selectionText) items.push({ role: "copy", label: "Copiar" });
    items.push({ type: "separator" }, { label: "Recargar", click: () => win.loadURL(APP_URL) });
    Menu.buildFromTemplate(items).popup();
  });

  // F5 recarga, Ctrl + / Ctrl - cambian el tamaño del texto
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    const z = win.webContents;
    if (i.key === "F5") { e.preventDefault(); win.loadURL(APP_URL); }
    else if (i.control && (i.key === "+" || i.key === "=")) { e.preventDefault(); z.setZoomLevel(z.getZoomLevel() + 0.5); }
    else if (i.control && i.key === "-") { e.preventDefault(); z.setZoomLevel(z.getZoomLevel() - 0.5); }
    else if (i.control && i.key === "0") { e.preventDefault(); z.setZoomLevel(0); }
  });

  win.loadURL(APP_URL);
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("web-contents-created", (e, wc) => wc.on("will-attach-webview", ev => ev.preventDefault()));
