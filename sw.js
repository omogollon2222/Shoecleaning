// Permite abrir y usar la app sin internet (tablet en el local).
// - Archivos de la app: primero la red (para tener la última versión) y, sin internet, la copia guardada.
// - Librerías de Firebase (versión fija) y tipografías: se guardan y se usan desde el equipo.
// - Los datos (pedidos, fotos, gastos) los guarda Firebase en el equipo y los sube al volver la conexión.
const CACHE = "shoe-cleaning-v14";
const FILES = ["./", "index.html", "manifest.json", "icon.svg", "firebase-config.js", "app.js", "privacidad.html", "privacidad.js"];
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const CDN = [FB + "firebase-app-compat.js", FB + "firebase-auth-compat.js", FB + "firebase-firestore-compat.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES).then(() => Promise.all(CDN.map(u =>
    fetch(new Request(u, {mode: "cors"})).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {}))))));
  self.skipWaiting();
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, {ignoreSearch: true}).then(hit => hit || (req.mode === "navigate" ? caches.match("./") : undefined))));
    return;
  }
  if (u.href.startsWith(FB) || u.hostname === "fonts.gstatic.com") { // no cambian: primero la copia guardada
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })));
    return;
  }
  if (u.hostname === "fonts.googleapis.com") { // hoja de estilos de las tipografías
    e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => hit); return hit || net; }));
  }
  // Firestore y Authentication: los maneja Firebase (guarda en el equipo y sincroniza solo)
});
