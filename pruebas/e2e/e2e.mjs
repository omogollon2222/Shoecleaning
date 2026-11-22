// Prueba de punta a punta de Shoe Cleaning con los emuladores de Firebase.
// Uso: node e2e.mjs chrome|edge|firefox
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const which = process.argv[2] || "chrome";
const BIN = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  edge: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  firefox: "C:/Program Files/Mozilla Firefox/firefox.exe",
}[which];
const APP = "http://127.0.0.1:8096/";
const WWW = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../emu/www");
let web = null;
const startWeb = async () => { web = spawn("python", ["-m", "http.server", "8096", "--bind", "127.0.0.1", "--directory", WWW], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { const r0 = await fetch(APP, { cache: "no-store" }); await r0.arrayBuffer(); return; } catch {} await new Promise(r => setTimeout(r, 250)); } };
const stopWeb = () => { try { execSync(`taskkill /PID ${web.pid} /T /F`, { stdio: "ignore" }); } catch {} };
const PORT = {chrome: 9341, edge: 9342, firefox: 9343}[which];
const w = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const errors = [];
const ok = (c, n, x = "") => { c ? pass++ : fail++; console.log(c ? "  OK   " : "  FALLA", n, c ? "" : x); };

// ---------- reinicia los emuladores ----------
await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-shoecleaning/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-shoecleaning/accounts", { method: "DELETE" });

const prof = fs.mkdtempSync(path.join(os.tmpdir(), "sc-" + which + "-"));
let ch, ev, nav, close, cdp = null;
await startWeb();
if (which === "firefox") {
  ch = spawn(BIN, ["--headless", "--remote-debugging-port", String(PORT), "--profile", prof, "--no-remote"], { stdio: "ignore" });
  let ws;
  for (let i = 0; i < 80; i++) { try { ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } catch { ws = null; await w(250); } }
  if (!ws) throw new Error("No se pudo conectar con Firefox");
  let n = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === "log.entryAdded" && m.params.level === "error") errors.push(m.params.text); };
  const send = (method, params = {}) => new Promise(r => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("session.new", { capabilities: {} });
  await send("session.subscribe", { events: ["log.entryAdded"] });
  const tree = await send("browsingContext.getTree", {});
  const ctx = tree.result.contexts[0].context;
  nav = async url => { await send("browsingContext.navigate", { context: ctx, url, wait: "complete" }); };
  ev = async expr => {
    const r = await send("script.evaluate", { expression: `(async () => { return JSON.stringify(await (window.__ev ? window.__ev(${JSON.stringify("(" + expr + ")")}) : (${expr}))); })()`, target: { context: ctx }, awaitPromise: true });
    if (r.error) throw new Error(r.message || r.error);
    if (r.result.type === "exception") throw new Error(JSON.stringify(r.result.exceptionDetails.text));
    const v = r.result.result.value; return v === undefined ? undefined : JSON.parse(v);
  };
  close = () => { try { ws.close(); } catch {} };
} else {
  ch = spawn(BIN, ["--headless=new", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + prof, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 80; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.some(t => t.type === "page")) break; } catch {} await w(250); }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let n = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text + " " + (m.params.entry.url || "")); };
  const send = (method, params = {}) => new Promise(r => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); cdp = send;
  nav = async url => { await send("Page.navigate", { url }); await w(1500); };
  ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: `(async () => JSON.stringify(await (window.__ev ? window.__ev(${JSON.stringify("(" + expr + ")")}) : (${expr}))))()`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text);
    const v = r.result.result.value; return v === undefined ? undefined : JSON.parse(v);
  };
  close = () => { try { ws.close(); } catch {} };
}

// ---------- utilidades dentro de la página ----------
const HELP = `window.__w = ms => new Promise(r => setTimeout(r, ms));
window.__until = async (f, t = 15000) => { const s = Date.now(); while (Date.now() - s < t) { try { const v = f(); if (v) return v; } catch (e) {} await __w(150); } return null; };
window.__set = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; };
window.__img = (color) => new Promise(res => { const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 3000, 2000); gr.addColorStop(0, color); gr.addColorStop(1, "#ffffff"); g.fillStyle = gr; g.fillRect(0, 0, 3000, 2000);
  for (let i = 0; i < 400; i++) { g.fillStyle = "hsl(" + (i * 37 % 360) + ",60%,50%)"; g.fillRect((i * 97) % 3000, (i * 53) % 2000, 60, 40); }
  c.toBlob(b => res(new File([b], "zapato.jpg", { type: "image/jpeg" })), "image/jpeg", 0.92); });
window.__attach = async (input, color) => { const f = await __img(color); const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); };
window.confirm = () => true; window.alert = () => {};
true`;
const ev0 = ev; ev = (expr) => Promise.race([ev0(expr), new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo agotado en: " + expr.slice(0, 160))), 90000))]);
const help = () => ev(`(() => { ${HELP} })()`);
async function waitApp() { for (let i = 0; i < 60; i++) { try { const r = await ev(`!!window.__ev && !!document.querySelector("#view") && (document.querySelector("#gateForm") || window.__ev("me")) ? true : false`); if (r) return true; } catch {} await w(500); } return false; }
async function login(u, p) {
  await nav(APP); await waitApp(); await help();
  await ev(`(async () => { await __until(() => document.querySelector("#l_u")); __set("#l_u", ${JSON.stringify(u)}); __set("#l_p", ${JSON.stringify(p)}); document.querySelector("#gateForm").requestSubmit(); return !!(await __until(() => typeof me !== "undefined" && me && me.u, 20000)); })()`);
  await help();
}
async function logout() { await ev(`(async () => { logout(); return true; })()`).catch(() => {}); await w(3000); }

try {
  console.log(`\n=== ${which.toUpperCase()} ===`);
  await nav(APP); ok(await waitApp(), "la app carga");
  await help();
  const credit = await ev(`(() => { const c = document.querySelector(".credit"); return c ? c.innerText.replace(/\\s+/g, " ").trim() + " | " + getComputedStyle(c.querySelector("b")).fontFamily : ""; })()`);
  ok(/Engineered with pride by\s*CONSULTECAPPS/i.test(credit) && /Orbitron/.test(credit), "firma futurista «Engineered with pride by CONSULTECAPPS»", credit);

  // 1. Primer administrador con correo
  await ev(`(async () => { await __until(() => document.querySelector("#g_u")); __set("#g_n", "Dueña"); __set("#g_u", "duena@prueba.test"); __set("#g_p", "Prueba12345"); __set("#g_p2", "Prueba12345"); document.querySelector("#gateForm").requestSubmit(); return !!(await __until(() => me && me.role === "admin", 20000)); })()`);
  await help();
  ok(await ev(`me && me.role === "admin" && TABS.admin.some(t => t[0] === "gastos") && !TABS.operaciones`), "administrador registrado; ya no existe el módulo Operaciones");

  // 2. Usuarios: solo Administración y Recepción
  const roles = await ev(`(async () => { go("ajustes"); await __w(400); document.querySelector("#uAdd").click(); await __w(200); const r = [...document.querySelectorAll("#u_r [data-r]")].map(b => b.dataset.r); closeSheet(); return r; })()`);
  ok(JSON.stringify(roles) === '["admin","recepcion"]', "al crear usuario solo se elige Administrador o Recepción", JSON.stringify(roles));
  ok(await ev(`cloudCreateUser("maria", "María", "recepcion", "Recep12345")`), "crea el usuario de recepción");

  // 3. Promociones de ejemplo y una nueva desde Ajustes
  const pr = await ev(`(async () => { go("ajustes"); await __w(300); const names = settings.promos.map(p => p.name);
    document.querySelector("#pAdd").click(); await __w(200); __set("#pr_n", "Viernes de gorras"); __set("#pr_p", "20");
    document.querySelector("#pr_d [data-d='5']").click(); document.querySelector("#pr_s [data-s='gorras']").click(); document.querySelector("#pr_save").click();
    await __until(() => settings.promos.length === 4, 8000); return { names, n: settings.promos.length, last: settings.promos[3] }; })()`);
  ok(pr.names.join("|") === "Lunes de Blanco|Miércoles de negro|Promoción cumpleañera", "vienen las 3 promociones de ejemplo", pr.names.join("|"));
  ok(pr.n === 4 && pr.last.pct === 20 && pr.last.days.join() === "5" && pr.last.services.join() === "gorras", "crea una promoción nueva desde Ajustes", JSON.stringify(pr.last));

  // 4. Insumo
  await ev(`(async () => { go("gastos"); await __w(300); document.querySelector("[data-supnew]").click(); await __w(200); __set("#su_n", "Jabón neutro"); __set("#su_u", "litros"); __set("#su_m", "2"); __set("#su_s", "5"); document.querySelector("#su_save").click(); return !!(await __until(() => supplies.some(s => s.name === "Jabón neutro" && s.stock === 5))); })()`);
  ok(await ev(`supplies.length === 1 && supplies[0].stock === 5`), "crea el insumo «Jabón neutro» con 5 litros");

  // 5. Pedido con foto por par + promoción cumpleañera (2x1) + descuento manual
  const nOrder = await ev(`(async () => {
    go("nuevo"); await __w(300);
    __set("#f_phone", "0991234567"); __set("#f_name", "Ana Prueba");
    const inc = [...document.querySelectorAll("[data-inc]")]; inc[0].click(); inc[0].click(); inc[1].click(); await __w(300);
    const slots = document.querySelectorAll("#pp_recepcion [data-slot]").length;
    const colors = ["#c0392b", "#2980b9", "#27ae60"];
    for (let i = 0; i < 3; i++) { const inp = document.querySelector("#pp_recepcion [data-slot]"); if (!inp) break; await __attach(inp, colors[i]); await __until(() => document.querySelectorAll("#pp_recepcion .th").length === i + 1, 15000); }
    const aviso = document.querySelector("#f_aviso"); if (!aviso.checked) aviso.click();
    const sel = document.querySelector("#d_promo"); sel.value = "cumple"; sel.dispatchEvent(new Event("change", {bubbles:true})); await __until(() => document.querySelector("#d_req"));
    const before = orders.length;
    document.querySelector("#save").click(); await __w(500); const blockedReq = orders.length === before;
    document.querySelector("#d_req").click();
    document.querySelector("#d_mon").click(); await __until(() => document.querySelector("#d_mpct")); __set("#d_mpct", "20"); await __w(200);
    document.querySelector("#save").click(); await __w(500); const blocked20 = orders.length === before;
    __set("#d_mpct", "10"); await __w(200);
    document.querySelector("#save").click();
    await __until(() => orders.length > before, 20000);
    await __until(() => document.querySelector("#scrim"), 8000); closeSheet();
    const o = orders.find(x => x.name === "Ana Prueba");
    return { slots, blockedReq, blocked20, id: o && o.id, num: o && o.num, total: o && o.total, promoName: o && o.promoName, promoDisc: o && o.promoDisc, manualPct: o && o.manualPct, manualDisc: o && o.manualDisc, photos: o && o.photos };
  })()`);
  ok(nOrder.slots === 3, "un espacio de foto por cada par (2 + 1 = 3)");
  ok(nOrder.blockedReq, "con la promoción cumpleañera pide verificar el requisito antes de guardar");
  ok(nOrder.blocked20, "no deja guardar un descuento manual de 20 % (máximo 15 %)");
  ok(nOrder.promoDisc === 4 && nOrder.manualPct === 10 && nOrder.manualDisc === 0.85 && nOrder.total === 7.65 && nOrder.promoName === "Promoción cumpleañera",
    `2x1 regala el par más económico ($4) y el manual 10 % va sobre el resto: total $${nOrder.total}`, JSON.stringify(nOrder));
  ok(nOrder.photos && nOrder.photos.recepcion === 3, "el pedido se guarda con 3 fotos de recepción");
  const orderId = nOrder.id;

  // 6. Fotos livianas y respaldo ZIP con el N° de ticket
  const ph = await ev(`(async () => { const t = await loadThumbs(${JSON.stringify(orderId)}); const f = await Promise.all(t.map(x => loadFull(x.id)));
    const sn = await fb.collection("photos").where("orderId","==",${JSON.stringify(orderId)}).get(); const files = photoFiles(sn.docs.map(d => d.data()));
    const zip = new Uint8Array(await zipFiles(files).arrayBuffer()); let entries = 0; for (let i = 0; i < zip.length - 3; i++) if (zip[i] === 0x50 && zip[i+1] === 0x4b && zip[i+2] === 1 && zip[i+3] === 2) entries++;
    return { n: t.length, tsz: t.map(x => x.data.length), fsz: f.map(x => x.length), ffmt: f.map(x => x.slice(5, 15)), names: files.map(x => x.name), sig: String.fromCharCode(zip[0], zip[1]), entries }; })()`);
  ok(ph.n === 3 && ph.tsz.every(x => x < 19000) && ph.fsz.every(x => x < 110000), `fotos livianas: miniaturas ${Math.max(...ph.tsz)} B, fotos ${Math.max(...ph.fsz)} B (${ph.ffmt[0]})`);
  ok(ph.sig === "PK" && ph.entries === 3 && ph.names.every(n => n.startsWith(nOrder.num + "_recepcion_")), `respaldo ZIP con el N° de ticket en el nombre: ${ph.names[0]}`, JSON.stringify(ph.names));

  // 7. Gastos y cierre de caja
  const gx = await ev(`(async () => {
    go("gastos"); await __w(300);
    document.querySelector("[data-expnew]").click(); await __until(() => document.querySelector("#ex_d"));
    __set("#ex_d", "Jabón para la semana"); __set("#ex_a", "12,50"); __set("[data-lq='0']", "3");
    document.querySelector("#ex_save").click(); await __until(() => expenses.length === 1 && supplies[0].stock === 8, 15000);
    await __until(() => !document.querySelector("#scrim") && document.querySelector("[data-expnew]"), 10000);
    document.querySelector("[data-expnew]").click(); await __until(() => document.querySelector("#ex_cat"));
    document.querySelector("#ex_cat [data-c='almuerzos']").click(); await __w(200);
    __set("#ex_d", "Almuerzo del personal"); __set("#ex_a", "9"); document.querySelector("#ex_save").click();
    await __until(() => expenses.length === 2, 15000); return { n: expenses.length, stock: supplies[0].stock, total: sumExp(expenses) }; })()`);
  ok(gx.n === 2 && gx.stock === 8 && gx.total === 21.5, "gastos: compra de insumos (+3 → 8 litros) y almuerzo; total $21.50", JSON.stringify(gx));
  const cj = await ev(`(() => { const d = cierreData(todayStr()); return { efe: d.efe, gEfe: d.gEfe, efeCaja: d.efeCaja, pdf: cierrePDF(d, {contado:null, obs:""}).length, ex: execPDF(execData("hoy", false)).length }; })()`);
  ok(cj.gEfe === 21.5 && Math.abs(cj.efeCaja - (cj.efe - 21.5)) < 0.01 && cj.pdf > 2000 && cj.ex > 2000, `cierre de caja (efectivo ${cj.efe} − gastos 21,50 = ${cj.efeCaja}) y PDF`);

  // 8. Recepción: Taller (producción y listo), miniaturas, insumos, entrega
  await logout(); await login("maria", "Recep12345");
  const rc = await ev(`(async () => {
    const out = { role: me.role, taller: allowed("cola"), gastos: allowed("gastos") };
    await __until(() => orders.some(o => o.id === ${JSON.stringify(orderId)}) && supplies.length, 15000);
    go("cola"); await __w(400); out.enTaller = document.querySelectorAll("#view .ticket").length;
    orderSheet(${JSON.stringify(orderId)}); await __until(() => document.querySelectorAll("#phbox .thb").length === 3, 15000);
    out.thumbs = document.querySelectorAll("#phbox .thb").length; out.zipBtn = !!document.querySelector("#phZip");
    const tlen = document.querySelector("#phbox .thb img").src.length; document.querySelector("#phbox .thb").click();
    await __until(() => { const i = document.querySelector(".lightbox img"); return i && i.src.length > tlen; }, 15000);
    out.full = document.querySelector(".lightbox img").src.length > tlen * 2; document.querySelector(".lightbox").click(); closeSheet();
    await advance(${JSON.stringify(orderId)}); await __w(600); out.st1 = orders.find(o => o.id === ${JSON.stringify(orderId)}).status;
    await advance(${JSON.stringify(orderId)}); await __w(600); out.st2 = orders.find(o => o.id === ${JSON.stringify(orderId)}).status; closeSheet();
    go("gastos"); await __w(300); document.querySelector("[data-use]").click(); await __w(200); __set("#us_q", "1"); document.querySelector("#us_ok").click();
    await __until(() => supplies[0].stock === 7, 15000); out.stock = supplies[0].stock;
    go("entregas"); await __w(300);
    await advance(${JSON.stringify(orderId)}); await __until(() => document.querySelector("#doDeliver"), 8000);
    await __until(() => document.querySelectorAll("#pp_entrega img.ref").length === 3, 15000); out.refs = document.querySelectorAll("#pp_entrega img.ref").length;
    for (let i = 0; i < 3; i++) { const inp = document.querySelector("#pp_entrega [data-slot]"); if (!inp) break; await __attach(inp, "#8e44ad"); await __until(() => document.querySelectorAll("#pp_entrega .th").length === i + 1, 15000); }
    document.querySelector("#doDeliver").click();
    await __until(() => orders.find(x => x.id === ${JSON.stringify(orderId)}).status === "entregado", 15000);
    const o = orders.find(x => x.id === ${JSON.stringify(orderId)}); out.status = o.status; out.photos = o.photos; closeSheet();
    return out; })()`);
  ok(rc.role === "recepcion" && rc.taller && rc.gastos && rc.enTaller >= 1, "recepción tiene la pestaña Taller con los pedidos por producir", JSON.stringify(rc));
  ok(rc.thumbs === 3 && rc.full && rc.zipBtn, "recepción ve miniaturas, abre la foto grande y puede descargar las fotos del ticket");
  ok(rc.st1 === "produccion" && rc.st2 === "listo", "recepción pasa el pedido a producción y luego a listo", rc.st1 + " → " + rc.st2);
  ok(rc.stock === 7, "recepción registra uso de insumo (8 → 7)");
  ok(rc.refs === 3 && rc.status === "entregado" && rc.photos && rc.photos.entrega === 3, "entrega con foto por par comparando con la llegada");

  // 9. Sin internet (Chrome y Edge permiten cortar la red de la página)
  if (cdp) {
    const pre = await ev(`(async () => { await navigator.serviceWorker.ready; await __until(() => getBlock(), 15000); const ks = await caches.keys(); const c = await caches.open(ks.find(k => k.startsWith("shoe-cleaning"))); const urls = (await c.keys()).map(r => r.url);
      return { fbLibs: urls.filter(u => u.includes("firebasejs")).length, app: urls.some(u => u.endsWith("/app.js")), block: getBlock() }; })()`);
    ok(pre.fbLibs === 3 && pre.app && pre.block, `la app y Firebase quedan guardados en el equipo; números reservados desde ${pre.block && pre.block.next}`, JSON.stringify(pre));
    stopWeb(); await cdp("Network.enable"); await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp("Page.reload", {}); await w(3000); const back = await waitApp(); await help();
    const off = await ev(`(async () => { await __until(() => me && orders.length, 20000);
      const out = { online: navigator.onLine, me: me && me.u, orders: orders.length };
      go("nuevo"); await __w(300); __set("#f_phone", "0987654321"); __set("#f_name", "Cliente Sin Internet");
      document.querySelectorAll("[data-inc]")[0].click(); await __w(200);
      await __attach(document.querySelector("#pp_recepcion [data-slot]"), "#34495e"); await __until(() => document.querySelectorAll("#pp_recepcion .th").length === 1, 15000);
      const a = document.querySelector("#f_aviso"); if (!a.checked) a.click();
      const t0 = Date.now(), before = orders.length; document.querySelector("#save").click();
      await __until(() => orders.length > before && document.querySelector("#scrim"), 15000); out.ms = Date.now() - t0; closeSheet();
      const o = orders.find(x => x.name === "Cliente Sin Internet"); out.num = o && o.num; out.id = o && o.id;
      go("gastos"); await __w(300); document.querySelector("[data-expnew]").click(); await __until(() => document.querySelector("#ex_cat"));
      document.querySelector("#ex_cat [data-c='otros']").click(); await __w(200); __set("#ex_d", "Gasto sin internet"); __set("#ex_a", "2"); document.querySelector("#ex_save").click();
      await __until(() => expenses.some(e => e.desc === "Gasto sin internet"), 10000); out.exp = expenses.some(e => e.desc === "Gasto sin internet");
      out.sync = document.querySelector("#sync").textContent;
      await logout(); out.stillIn = !!me;
      return out; })()`);
    ok(back && off.me === "maria" && off.orders > 0 && off.online === false, "sin internet la app vuelve a abrir con la sesión y los pedidos guardados en el equipo", JSON.stringify(off));
    ok(off.id && off.ms < 8000 && /^B\d{6}$/.test(off.num || ""), `sin internet registra el pedido con foto en ${off.ms} ms con número reservado (${off.num})`, JSON.stringify(off));
    ok(off.exp && /Sin internet/.test(off.sync || ""), `sin internet registra gastos; arriba dice «${off.sync}»`);
    ok(off.stillIn, "no deja cerrar sesión mientras haya datos sin subir");
    await startWeb(); await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const on = await ev(`(async () => { window.dispatchEvent(new Event("online")); const r = await __until(() => syncState === "ok" && /Sincronizado/.test(document.querySelector("#sync").textContent), 45000); return { ok: !!r, sync: document.querySelector("#sync").textContent }; })()`);
    const H = { Authorization: "Bearer owner" }, B = "http://127.0.0.1:8080/v1/projects/demo-shoecleaning/databases/(default)/documents/";
    const od = await (await fetch(B + "orders/" + off.id, { headers: H })).json();
    const th = await (await fetch(B + "thumbs?pageSize=300", { headers: H })).json();
    const ex = await (await fetch(B + "expenses?pageSize=300", { headers: H })).json();
    const thN = (th.documents || []).filter(d => d.fields.orderId.stringValue === off.id).length, exOk = (ex.documents || []).some(d => d.fields.desc.stringValue === "Gasto sin internet");
    ok(on.ok && od.fields && od.fields.num.stringValue === off.num && thN === 1 && exOk, `al volver internet todo se sube solo: pedido, foto y gasto («${on.sync}»)`, JSON.stringify({ on, thN, exOk }));
  }

  // 10. Safari (iPhone/iPad) no comprime en WebP: usa JPEG
  const saf = await ev(`(async () => { const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(t, q){ return orig.call(this, t === "image/webp" ? "image/png" : t, q); };
    webpOk = null; const r = await compressImage(await __img("#16a085")); HTMLCanvasElement.prototype.toDataURL = orig; webpOk = null;
    return { f: r.data.slice(5, 15), fl: r.data.length, tl: r.thumb.length }; })()`);
  ok(saf.f === "image/jpeg" && saf.fl < 110000 && saf.tl < 19000, `sin WebP (como Safari) usa JPEG liviano: ${saf.fl} B`);
  const errs = errors.filter(e => !/favicon|fonts\.g|ERR_INTERNET|ERR_ABORTED|ERR_CONNECTION_REFUSED|Failed to load resource|Could not reach Cloud Firestore|offline|net::/i.test(e));
  ok(errs.length === 0, "sin errores de JavaScript en la consola", errs.slice(0, 5).join(" | "));
} catch (e) { fail++; console.log("  FALLA excepción:", e.message); }
finally { close(); stopWeb(); try { (await import("node:child_process")).execSync(`taskkill /PID ${ch.pid} /T /F`, { stdio: "ignore" }); } catch {} await w(1200); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
if (fail && errors.length) console.log("Errores de consola:", errors.slice(0, 8));
console.log(`Resultado ${which}: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
