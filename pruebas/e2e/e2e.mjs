// Prueba de punta a punta de Shoe Cleaning con los emuladores de Firebase.
// Uso: node e2e.mjs chrome|edge|firefox
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const which = process.argv[2] || "chrome";
const BIN = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  edge: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  firefox: "C:/Program Files/Mozilla Firefox/firefox.exe",
}[which];
const APP = "http://127.0.0.1:8097/";
const PORT = {chrome: 9341, edge: 9342, firefox: 9343}[which];
const w = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const errors = [];
const ok = (c, n, x = "") => { c ? pass++ : fail++; console.log(c ? "  OK   " : "  FALLA", n, c ? "" : x); };

// ---------- reinicia los emuladores ----------
await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-shoecleaning/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-shoecleaning/accounts", { method: "DELETE" });

const prof = fs.mkdtempSync(path.join(os.tmpdir(), "sc-" + which + "-"));
let ch, ev, nav, close;
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
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
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
  ok(/Engineered with pride by Consultecapps/i.test(credit) && /Great Vibes/.test(credit), "firma «Engineered with pride by Consultecapps» con letra caligráfica", credit);

  // 1. Primer administrador con correo
  await ev(`(async () => { await __until(() => document.querySelector("#g_u")); __set("#g_n", "Dueña"); __set("#g_u", "duena@prueba.test"); __set("#g_p", "Prueba12345"); __set("#g_p2", "Prueba12345"); document.querySelector("#gateForm").requestSubmit(); return !!(await __until(() => typeof me !== "undefined" && me && me.role === "admin", 20000)); })()`);
  await help();
  ok(await ev(`me && me.role === "admin" && TABS.admin.some(t => t[0] === "gastos")`), "administrador registrado con correo; tiene la pestaña Gastos");

  // 2. Usuarios de recepción y operaciones
  ok(await ev(`(async () => (await cloudCreateUser("maria", "María", "recepcion", "Recep12345")) && (await cloudCreateUser("pedro", "Pedro", "operaciones", "Opera12345")))()`), "crea usuarios de recepción y operaciones");

  // 3. Insumo nuevo (UI)
  await ev(`(async () => { go("gastos"); await __w(300); document.querySelector("[data-supnew]").click(); await __w(200); __set("#su_n", "Jabón neutro"); __set("#su_u", "litros"); __set("#su_m", "2"); __set("#su_s", "5"); document.querySelector("#su_save").click(); return !!(await __until(() => supplies.some(s => s.name === "Jabón neutro" && s.stock === 5))); })()`);
  ok(await ev(`supplies.length === 1 && supplies[0].stock === 5`), "crea el insumo «Jabón neutro» con 5 litros");

  // 4. Pedido con una foto por par (UI)
  const nOrder = await ev(`(async () => {
    go("nuevo"); await __w(300);
    __set("#f_phone", "0991234567"); __set("#f_name", "Ana Prueba");
    const inc = [...document.querySelectorAll("[data-inc]")];
    inc[0].click(); inc[0].click(); inc[1].click(); await __w(300);
    const slots = document.querySelectorAll("#pp_recepcion [data-slot]").length;
    const colors = ["#c0392b", "#2980b9", "#27ae60"];
    for (let i = 0; i < 3; i++) { const inp = document.querySelector("#pp_recepcion [data-slot]"); if (!inp) break; await __attach(inp, colors[i]); await __until(() => document.querySelectorAll("#pp_recepcion .th").length === i + 1, 15000); }
    const labels = [...document.querySelectorAll("#pp_recepcion .slot small")].map(x => x.textContent);
    const aviso = document.querySelector("#f_aviso"); if (!aviso.checked) aviso.click();
    const before = orders.length; document.querySelector("#save").click();
    await __until(() => orders.length > before, 20000);
    await __until(() => document.querySelector("#scrim"), 8000); closeSheet();
    const o = orders.find(x => x.name === "Ana Prueba");
    return { slots, labels, photos: o ? o.photos : null, id: o ? o.id : null, total: o ? o.total : 0 };
  })()`);
  ok(nOrder.slots === 3, "aparece un espacio de foto por cada par o artículo (2 + 1 = 3)", JSON.stringify(nOrder));
  ok(nOrder.photos && nOrder.photos.recepcion === 3, "el pedido se registra con 3 fotos de recepción", JSON.stringify(nOrder));
  const orderId = nOrder.id;
  const ph = await ev(`(async () => { const t = await loadThumbs(${JSON.stringify(orderId)}); const f = await Promise.all(t.map(x => loadFull(x.id)));
    return { n: t.length, labels: t.map(x => x.label), tfmt: t.map(x => x.data.slice(5, 15)), tsz: t.map(x => x.data.length), fsz: f.map(x => x.length), ffmt: f.map(x => x.slice(5, 15)) }; })()`);
  ok(ph.n === 3 && ph.labels.every(Boolean), "se guardan 3 miniaturas con el nombre de cada par", JSON.stringify(ph.labels));
  ok(ph.tsz.every(x => x < 19000) && ph.fsz.every(x => x < 110000), `tamaños livianos: miniaturas ${Math.max(...ph.tsz)} B máx, fotos ${Math.max(...ph.fsz)} B máx (desde fotos de 3000×2000)`, JSON.stringify(ph));
  ok(ph.ffmt.every(x => x === "image/webp") || ph.ffmt.every(x => x === "image/jpeg"), `formato de compresión: ${ph.ffmt[0]}`, JSON.stringify(ph.ffmt));

  // 5. Gastos: compra de insumos (suma stock) y almuerzo en efectivo
  const gx = await ev(`(async () => {
    go("gastos"); await __w(300);
    document.querySelector("[data-expnew]").click(); await __w(250);
    __set("#ex_d", "Jabón para la semana"); __set("#ex_p", "Distribuidora Quito"); __set("#ex_a", "12,50"); __set("[data-lq='0']", "3");
    document.querySelector("#ex_save").click(); await __until(() => expenses.length === 1 && supplies[0].stock === 8, 15000);
    const t0 = { afterFirst: { n: expenses.length, stock: supplies[0] && supplies[0].stock, sheet: !!document.querySelector("#scrim"), btn: !!document.querySelector("[data-expnew]"), view } };
    await __until(() => !document.querySelector("#scrim") && document.querySelector("[data-expnew]"), 10000);
    document.querySelector("[data-expnew]").click(); await __until(() => document.querySelector("#ex_cat"), 8000);
    if (!document.querySelector("#ex_cat")) return { fail: true, ...t0, toast: (document.querySelector(".toast") || {}).textContent };
    document.querySelector("#ex_cat [data-c='almuerzos']").click(); await __w(200);
    __set("#ex_d", "Almuerzo del personal"); __set("#ex_a", "9"); document.querySelector("#ex_save").click();
    await __until(() => expenses.length === 2, 15000); await __w(400);
    return { n: expenses.length, stock: supplies[0].stock, total: sumExp(expenses), kpi: document.querySelector(".kpi.hero b").textContent };
  })()`);
  ok(gx.n === 2 && gx.stock === 8, "registra compra de insumos (+3 litros → 8) y almuerzo", JSON.stringify(gx));
  ok(gx.kpi === "$21.50", "el panel Gastos muestra el total del mes ($21.50)", gx.kpi);

  // 6. Cierre de caja y resumen ejecutivo (administrador)
  const cj = await ev(`(async () => { const d = cierreData(todayStr()); cierreSheet(); await __w(300); const txt = document.querySelector("#scrim").innerText; const pdf = cierrePDF(d, {contado:null, obs:""}); const ex = execPDF(execData("hoy", false)); closeSheet();
    const head = s => String.fromCharCode(...s.slice(0, 5));
    return { cobr: d.cobr, efe: d.efe, gEfe: d.gEfe, efeCaja: d.efeCaja, txt: txt.includes(money(d.efeCaja)), pdf: head(pdf), pdfLen: pdf.length, ex: head(ex), exLen: ex.length, res: execData("mes", false).result }; })()`);
  ok(cj.gEfe === 21.5 && cj.efeCaja === Math.round((cj.efe - 21.5) * 100) / 100, `cierre de caja resta los gastos en efectivo: ${cj.efe} − 21,50 = ${cj.efeCaja}`, JSON.stringify(cj));
  ok(cj.txt, "la hoja de cierre muestra el efectivo que debe haber en caja");
  ok(cj.pdf === "%PDF-" && cj.pdfLen > 2000 && cj.ex === "%PDF-" && cj.exLen > 2000, `PDF de cierre (${cj.pdfLen} B) y resumen ejecutivo (${cj.exLen} B) se generan`);
  ok(Math.abs(cj.res - (nOrder.total - 21.5)) < 0.01, "resumen ejecutivo del administrador incluye gastos y resultado");

  // 7. Operaciones: miniaturas, foto grande, avanzar etapas y registrar uso de insumo
  await logout(); await login("pedro", "Opera12345");
  const ops = await ev(`(async () => {
    const out = { role: me.role, gastos: allowed("gastos"), insumos: allowed("insumos") };
    await __until(() => orders.some(o => o.id === ${JSON.stringify(orderId)}) && supplies.length, 15000);
    orderSheet(${JSON.stringify(orderId)}); await __until(() => document.querySelectorAll("#phbox .thb").length === 3, 15000);
    out.thumbs = document.querySelectorAll("#phbox .thb").length;
    out.labels = [...document.querySelectorAll("#phbox .thb span")].map(x => x.textContent);
    const tlen = document.querySelector("#phbox .thb img").src.length;
    document.querySelector("#phbox .thb").click();
    await __until(() => { const i = document.querySelector(".lightbox img"); return i && i.src.length > tlen; }, 15000);
    out.full = document.querySelector(".lightbox img").src.length; out.thumb = tlen;
    document.querySelector(".lightbox").click(); out.closed = !document.querySelector(".lightbox"); closeSheet();
    for (let i = 0; i < 4; i++) { await advance(${JSON.stringify(orderId)}); await __w(500); }
    out.status = orders.find(o => o.id === ${JSON.stringify(orderId)}).status;
    go("insumos"); await __w(300); document.querySelector("[data-use]").click(); await __w(200); __set("#us_q", "1"); __set("#us_n", "Lavado de prueba"); document.querySelector("#us_ok").click();
    await __until(() => supplies[0] && supplies[0].stock === 7, 15000); out.stock = supplies[0].stock;
    return out; })()`);
  ok(ops.role === "operaciones" && !ops.gastos && ops.insumos, "operaciones no ve Gastos pero sí Insumos");
  ok(ops.thumbs === 3, "operaciones ve las 3 miniaturas de recepción con su nombre", JSON.stringify(ops.labels));
  ok(ops.full > ops.thumb * 2 && ops.closed, `al tocar una miniatura se abre la foto grande (${ops.full} vs ${ops.thumb} caracteres) y se cierra`);
  ok(ops.status === "listo", "operaciones avanza el pedido hasta «listo»", ops.status);
  ok(ops.stock === 7, "operaciones registra uso de insumo (8 → 7 litros)", String(ops.stock));
  ok(await ev(`(async () => { try { await fb.collection("expenses").get(); return false; } catch (e) { return true; } })()`), "operaciones no puede leer gastos (reglas de la nube)");

  // 8. Recepción: gastos del día, resumen ejecutivo limitado y entrega con foto por par
  await logout(); await login("maria", "Recep12345");
  const rc = await ev(`(async () => {
    const out = { role: me.role };
    await __until(() => orders.some(o => o.id === ${JSON.stringify(orderId)}), 15000);
    go("gastos"); await __until(() => expenses.length === 2, 10000); out.gastosHoy = expenses.length;
    go("entregas"); await __w(300);
    out.btnExec = !!document.querySelector("[data-report='exec']"); document.querySelector("[data-report='exec']").click(); await __w(300);
    out.execTxt = document.querySelector("#scrim").innerText; const d = execData("hoy", true); out.limited = d.limited && !d.staff.length && d.gastos === 0; out.pdf = execPDF(d).length; closeSheet();
    const c = cierreData(todayStr()); out.efeCaja = c.efeCaja; out.gVisible = c.gVisible;
    await advance(${JSON.stringify(orderId)}); await __until(() => document.querySelector("#doDeliver"), 8000);
    await __until(() => document.querySelectorAll("#pp_entrega img.ref").length === 3, 15000); out.refs = document.querySelectorAll("#pp_entrega img.ref").length;
    for (let i = 0; i < 3; i++) { const inp = document.querySelector("#pp_entrega [data-slot]"); if (!inp) break; await __attach(inp, "#8e44ad"); await __until(() => document.querySelectorAll("#pp_entrega .th").length === i + 1, 15000); }
    document.querySelector("#doDeliver").click();
    await __until(() => { const o = orders.find(x => x.id === ${JSON.stringify(orderId)}); return o && o.status === "entregado"; }, 15000);
    const o = orders.find(x => x.id === ${JSON.stringify(orderId)}); out.status = o.status; out.photos = o.photos;
    out.ent = (await loadThumbs(o.id)).filter(p => p.stage === "entrega").length;
    closeSheet(); return out; })()`);
  ok(rc.gastosHoy === 2, "recepción ve los gastos de hoy");
  ok(rc.btnExec && rc.limited && !/Resultado/.test(rc.execTxt) && rc.pdf > 1500, "recepción abre el resumen ejecutivo sin datos del personal ni gastos");
  ok(rc.gVisible && Math.abs(rc.efeCaja - cj.efeCaja) < 0.01, "el cierre de caja de recepción también resta los gastos del día");
  ok(rc.refs === 3, "en la entrega se ve la miniatura de cómo llegó cada par");
  ok(rc.status === "entregado" && rc.photos.entrega === 3 && rc.ent === 3, "entrega registrada con 3 fotos (una por par)", JSON.stringify(rc.photos));
  ok(await ev(`(async () => { try { await fb.collection("expenses").doc("x").set({ id: "x", day: "2020-01-01", at: Date.now() - 9e9, cat: "otros", desc: "x", amount: 1, method: "Efectivo", by: me.u }); return false; } catch (e) { return true; } })()`), "recepción no puede registrar gastos con fecha antigua (reglas)");

  // 9. Safari (iPhone/iPad) no comprime en WebP: la app debe pasar a JPEG
  const saf = await ev(`(async () => { const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(t, q){ return orig.call(this, t === "image/webp" ? "image/png" : t, q); };
    webpOk = null; const r = await compressImage(await __img("#16a085")); HTMLCanvasElement.prototype.toDataURL = orig; webpOk = null;
    return { f: r.data.slice(5, 15), t: r.thumb.slice(5, 15), fl: r.data.length, tl: r.thumb.length }; })()`);
  ok(saf.f === "image/jpeg" && saf.t === "image/jpeg" && saf.fl < 110000 && saf.tl < 19000, `sin WebP (como Safari) usa JPEG liviano: foto ${saf.fl} B, miniatura ${saf.tl} B`, JSON.stringify(saf));
  const errs = errors.filter(e => !/favicon|fonts\.g|ERR_INTERNET|net::ERR_ABORTED/i.test(e));
  ok(errs.length === 0, "sin errores de JavaScript en la consola", errs.slice(0, 5).join(" | "));
} catch (e) { fail++; console.log("  FALLA excepción:", e.message); }
finally { close(); try { (await import("node:child_process")).execSync(`taskkill /PID ${ch.pid} /T /F`, { stdio: "ignore" }); } catch {} await w(1200); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
if (fail && errors.length) console.log("Errores de consola:", errors.slice(0, 8));
console.log(`Resultado ${which}: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
