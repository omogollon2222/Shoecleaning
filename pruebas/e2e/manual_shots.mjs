// Capturas para el manual de usuario (datos de ejemplo en los emuladores, sin el aviso rojo del emulador)
import { spawn, execSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const w = ms => new Promise(r => setTimeout(r, ms));
await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-shoecleaning/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-shoecleaning/accounts", { method: "DELETE" });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "sc-man-"));
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=9352", "--user-data-dir=" + prof, "--no-first-run", "about:blank"], { stdio: "ignore" });
let t; for (let i = 0; i < 80; i++) { try { t = await (await fetch("http://127.0.0.1:9352/json")).json(); if (t.some(x => x.type === "page")) break; } catch {} await w(250); }
const ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let n = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: `(async () => JSON.stringify(await (window.__ev ? window.__ev(${JSON.stringify("(" + e + ")")}) : (${e}))))()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); const v = r.result.result.value; return v === undefined ? undefined : JSON.parse(v); };
const until = async (e, ms = 20000) => { const s = Date.now(); while (Date.now() - s < ms) { try { if (await ev(e)) return true; } catch {} await w(300); } console.log("  (no se cumplió: " + e.slice(0, 80) + ")"); return false; };
const HELP = `(() => { const st = document.createElement("style"); st.textContent = ".firebase-emulator-warning{display:none!important}"; document.head.appendChild(st);
  window.__w = ms => new Promise(r => setTimeout(r, ms));
  window.__set = (q, v) => { const x = document.querySelector(q); x.value = v; x.dispatchEvent(new Event("input", {bubbles:true})); x.dispatchEvent(new Event("change", {bubbles:true})); return true; };
  window.__shoe = (col) => new Promise(res => { const c = document.createElement("canvas"); c.width = 1600; c.height = 1200; const g = c.getContext("2d");
    g.fillStyle = "#e9e4dc"; g.fillRect(0, 0, 1600, 1200); g.fillStyle = "#d8d1c5"; g.fillRect(0, 860, 1600, 340);
    g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.ellipse(820, 900, 620, 70, 0, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.moveTo(260, 860); g.bezierCurveTo(260, 640, 420, 560, 600, 540); g.lineTo(760, 360); g.bezierCurveTo(900, 330, 980, 380, 1000, 470);
    g.bezierCurveTo(1080, 600, 1300, 640, 1400, 720); g.bezierCurveTo(1440, 760, 1440, 860, 1400, 860); g.closePath(); g.fill();
    g.fillStyle = "#fafafa"; g.fillRect(250, 840, 1170, 46); g.strokeStyle = "#fff"; g.lineWidth = 10; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(700 + i * 55, 470 + i * 40); g.lineTo(860 + i * 55, 430 + i * 40); g.stroke(); }
    c.toBlob(b => res(new File([b], "zapato.jpg", { type: "image/jpeg" })), "image/jpeg", 0.9); });
  window.__attach = async (inp, col) => { const f = await __shoe(col); const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event("change", {bubbles:true})); };
  window.confirm = () => true; return true; })()`;
const shot = async (name, full = false) => { await ev(`(document.activeElement && document.activeElement.blur(), true)`); await w(350);
  const m = await send("Page.getLayoutMetrics"); const h = full ? Math.min(3000, Math.ceil(m.result.cssContentSize.height)) : 844;
  if (full) { await send("Emulation.setDeviceMetricsOverride", { width: 390, height: h, deviceScaleFactor: 2, mobile: true }); await w(400); }
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 72 }); fs.writeFileSync(path.join(OUT, name + ".jpg"), Buffer.from(r.result.data, "base64"));
  if (full) await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); console.log("  " + name); };
const open = async () => { await send("Page.navigate", { url: "http://127.0.0.1:8096/" }); await w(3500); await until(`!!window.__ev && !!document.querySelector("#gateForm")`); await ev(HELP); };
const login = async (u, p) => { await open(); await ev(`(__set("#l_u", ${JSON.stringify(u)}), __set("#l_p", ${JSON.stringify(p)}), document.querySelector("#gateForm").requestSubmit(), true)`); await until(`me && me.u`); await ev(HELP); await w(1500); };
const logout = async () => { await ev(`(logout(), true)`).catch(() => {}); await w(3500); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ---- preparación (administrador) ----
await open();
await ev(`(__set("#g_n", "Dueña"), __set("#g_u", "duena@ejemplo.com"), __set("#g_p", "Ejemplo12345"), __set("#g_p2", "Ejemplo12345"), document.querySelector("#gateForm").requestSubmit(), true)`);
await until(`me && me.role === "admin"`); await ev(HELP);
await ev(`(async () => { await cloudCreateUser("maria", "María", "recepcion", "Ejemplo12345"); 
  await saveSupply({id: uid(), name: "Jabón neutro", unit: "litros", min: 2, stock: 5}, true);
  await saveSupply({id: uid(), name: "Cepillos de cerda suave", unit: "unidades", min: 2, stock: 1}, true);
  await saveSupply({id: uid(), name: "Bolsas de entrega", unit: "unidades", min: 20, stock: 60}, true); return true; })()`);
await until(`supplies.length === 3`);
// Pedido 1 (UI) con fotos
const nuevo = async (phone, name, incs, colors, shotName) => {
  await ev(`(go("nuevo"), true)`); await w(500);
  await ev(`(async () => { __set("#f_phone", ${JSON.stringify(phone)}); __set("#f_name", ${JSON.stringify(name)}); const inc = [...document.querySelectorAll("[data-inc]")]; for (const i of ${JSON.stringify(incs)}) inc[i].click(); await __w(300);
    const cols = ${JSON.stringify(colors)}; for (let k = 0; k < cols.length; k++) { const inp = document.querySelector("#pp_recepcion [data-slot]"); if (!inp) break; await __attach(inp, cols[k]); const t0 = Date.now(); while (document.querySelectorAll("#pp_recepcion .th").length < k + 1 && Date.now() - t0 < 15000) await __w(150); }
    const a = document.querySelector("#f_aviso"); if (!a.checked) a.click(); return true; })()`);
  if (shotName) { await ev(`(document.querySelector("#pp_recepcion").scrollIntoView({block: "center"}), true)`); await shot(shotName);
    await ev(`(async () => { const sel = document.querySelector("#d_promo"); sel.value = "cumple"; sel.dispatchEvent(new Event("change", {bubbles:true})); await __w(300); document.querySelector("#d_req").click(); document.querySelector("#d_mon").click(); await __w(300); __set("#d_mpct", "10"); await __w(300); document.querySelector("#disc").scrollIntoView({block: "start"}); return true; })()`);
    await shot(shotName + "-descuentos"); }
  await ev(`(document.querySelector("#save").click(), true)`); await until(`document.querySelector("#scrim")`); await w(400);
  if (shotName) await shot(shotName + "-registrado");
  await ev(`(closeSheet(), true)`);
};
await nuevo("0991234567", "Ana Torres", [0, 0, 1], ["#c0392b", "#2c3e50", "#ecf0f1"], null);
await nuevo("0987654321", "Luis Paredes", [2], ["#7f5539"], null);
await ev(`(async () => {
  const L = [["insumos", "Jabón neutro para la semana", 12.5, "Efectivo", "Distribuidora Quito", 3], ["almuerzos", "Almuerzo del personal", 9, "Efectivo", "", 0], ["obligaciones", "Luz eléctrica de noviembre", 25.4, "Transferencia", "Empresa Eléctrica", 0]];
  for (const [cat, desc, amount, method, provider, q] of L) { const s = supplies.find(x => x.name === "Jabón neutro");
    const e = {id: uid(), day: todayStr(), at: Date.now(), cat, desc, amount, method, by: me.u, lines: q ? [{sid: s.id, name: s.name, qty: q, unit: s.unit}] : []}; if (provider) e.provider = provider; await addExpense(e); await __w(300); }
  return true; })()`);
await until(`expenses.length === 3`);
await ev(`(go("tablero"), true)`); await w(1200); await shot("admin-tablero", true);
await ev(`(go("gastos"), true)`); await w(900); await shot("admin-gastos", true);
await ev(`(expenseSheet(), true)`); await w(500); await ev(`(__set("#ex_d", "Cepillos y bolsas"), __set("[data-lq='0']", "2"), true)`); await shot("gasto-registrar"); await ev(`(closeSheet(), expDraft = null, true)`);
await ev(`(go("tablero"), true)`); await w(500); await ev(`(execSheet(), true)`); await w(600); await shot("admin-resumen"); await ev(`(closeSheet(), true)`);
await ev(`(go("ajustes"), true)`); await w(900); await ev(`(document.querySelector("#uAdd").scrollIntoView({block: "center"}), true)`); await shot("admin-usuarios");
await ev(`(document.querySelector("#p_ti").scrollIntoView({block: "center"}), true)`); await shot("admin-aviso");
await ev(`(document.querySelector("#pAdd").scrollIntoView({block: "center"}), true)`); await shot("admin-promociones");
await ev(`(promoSheet("miercolesnegro"), true)`); await w(500); await shot("admin-editar-promocion"); await ev(`(closeSheet(), true)`);
await logout();
await open(); await w(800);
await shot("login");

// ---- recepción: taller ----
await login("maria", "Ejemplo12345");
await until(`orders.length === 2`);
await ev(`(go("cola"), true)`); await w(800); await shot("rec-taller");
await ev(`(() => { const o = orders.find(x => x.name === "Ana Torres"); orderSheet(o.id); return true; })()`); await until(`document.querySelectorAll("#phbox .thb").length === 3`); await w(600);
await ev(`(document.querySelector("#phbox").scrollIntoView({block: "center"}), true)`); await shot("rec-ficha-miniaturas");
await ev(`(document.querySelector("#phbox .thb").click(), true)`); await until(`document.querySelector(".lightbox img") && document.querySelector(".lightbox img").src.length > 9000`); await w(500); await shot("rec-foto-grande");
await ev(`(document.querySelector(".lightbox").click(), closeSheet(), true)`);
await ev(`(async () => { const o = orders.find(x => x.name === "Ana Torres"); await advance(o.id); await __w(600); await advance(o.id); await __w(600); closeSheet(); return true; })()`);
await ev(`(go("gastos"), true)`); await w(700); await ev(`(document.querySelector("[data-use]").click(), true)`); await w(400); await ev(`(__set("#us_q", "1"), true)`); await shot("rec-usar-insumo"); await ev(`(closeSheet(), true)`);
// ---- recepción ----
await nuevo("0995556677", "Carla Méndez", [0, 4], ["#e67e22", "#16a085"], "rec-nuevo");
await ev(`(go("entregas"), true)`); await w(800); await shot("rec-entregas");
await ev(`(async () => { const o = orders.find(x => x.name === "Ana Torres"); await advance(o.id); const t0 = Date.now(); while (document.querySelectorAll("#pp_entrega img.ref").length < 3 && Date.now() - t0 < 15000) await __w(200);
  for (let k = 0; k < 2; k++) { const inp = document.querySelector("#pp_entrega [data-slot]"); await __attach(inp, ["#c0392b", "#2c3e50"][k]); const t1 = Date.now(); while (document.querySelectorAll("#pp_entrega .th").length < k + 1 && Date.now() - t1 < 15000) await __w(150); }
  document.querySelector("#pp_entrega").scrollIntoView({block: "center"}); return true; })()`);
await shot("rec-entrega-fotos");
await ev(`(async () => { const inp = document.querySelector("#pp_entrega [data-slot]"); await __attach(inp, "#ecf0f1"); await __w(1500); document.querySelector("#doDeliver").click(); return true; })()`);
await until(`orders.find(x => x.name === "Ana Torres").status === "entregado"`); await ev(`(closeSheet(), true)`);
await ev(`(go("gastos"), true)`); await w(800); await shot("rec-gastos");
await ev(`(go("entregas"), true)`); await w(500); await ev(`(cierreSheet(), true)`); await w(600); await shot("rec-cierre"); await ev(`(closeSheet(), true)`);
await ev(`(execSheet(), true)`); await w(600); await shot("rec-resumen"); await ev(`(closeSheet(), true)`);
ws.close(); try { execSync(`taskkill /PID ${ch.pid} /T /F`, { stdio: "ignore" }); } catch {}
console.log("listo");
