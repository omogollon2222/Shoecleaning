(function(){
"use strict";
/* ---------- Constantes ---------- */
const DAY = 864e5;
const DEFAULT_SERVICES = [
  {key:"clasicos",label:"Zapatos clásicos",price:4.00},
  {key:"gamuza",label:"Zapatos gamuza o blancos",price:4.50},
  {key:"botas",label:"Botas cuero / trabajo",price:6.00},
  {key:"cascos",label:"Cascos",price:5.00},
  {key:"gorras",label:"Gorras",price:3.00},
  {key:"bolso",label:"Bolso / mochila",price:6.00},
  {key:"carteras",label:"Carteras",price:5.00},
  {key:"nino",label:"Zapatos de niño",price:3.00},
  {key:"otro",label:"Otro",price:0}
];
const DEFAULTS = {
  business:"Shoe Cleaning", phone:"0980035702", hours:"Lunes a Sábado, 9am – 18h",
  cc:"593", prefix:"B", nextNumber:574,
  loyaltyVisits:10, loyaltyMonths:6, loyaltyPct:30, inactiveDays:45, deliveryDays:3, notifyAll:true, reportPhone:"", photoDays:60,
  services:DEFAULT_SERVICES
};
const ST = {
  recibido:{l:"Recibido",next:"produccion",btn:"Pasar a producción",ic:"📥"},
  produccion:{l:"En producción",next:"listo",btn:"Marcar como listo",ic:"🧼"},
  listo:{l:"Listo para entregar",next:"entregado",btn:"Confirmar entrega",ic:"✅"},
  entregado:{l:"Entregado",ic:"🤝"}
};
const FLOW = ["recibido","produccion","listo","entregado"];
const PROC = ["produccion"];
const OLD_PROC = ["lavado","secado","esterilizacion"]; // etapas de versiones anteriores: hoy cuentan como "En producción"
// Todo pedido que llega (nube, respaldo o este dispositivo) pasa por aquí: cada campo
// queda con su tipo correcto. Así un dato alterado no puede inyectar HTML ni romper la app.
const ORDER_KEYS = new Set(["id","num","name","phone","phoneKey","items","subtotal","discount","discountPct","total","abono","paidFull","method","notes","status","createdAt","dueDate","loyaltyRedeemed","createdBy","photos","avisoOk","promoOk","erasedAt","readyAt","deliveredAt","deliveredBy","cobradoEntrega","methodFinal","notifiedStatus","notifiedAt",...FLOW.slice(0,3).flatMap(s => [s+"At", s+"By"]),"promoName","promoDisc","manualPct","manualDisc"]);
const NUM = (v, max=1e6) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
const STR = (v, max=200) => typeof v === "string" ? v.slice(0, max) : (v == null ? "" : String(v).slice(0, max));
const TS = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
const DATE = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
const norm = o => {
  const c = (o && typeof o === "object") ? JSON.parse(JSON.stringify(o)) : {};
  c.id = STR(c.id, 40).replace(/[^A-Za-z0-9_-]/g,"");
  c.num = STR(c.num, 30);
  if(OLD_PROC.includes(c.status)) c.status = "produccion";
  if(!c.produccionAt){ const t0 = c.lavadoAt || c.secadoAt || c.esterilizacionAt; if(t0){ c.produccionAt = t0; c.produccionBy = c.lavadoBy || c.secadoBy || c.esterilizacionBy || ""; } }
  if(!ST[c.status]) c.status = "recibido";
  c.promoName = STR(c.promoName, 80); c.promoDisc = NUM(c.promoDisc); c.manualPct = Math.min(15, NUM(c.manualPct, 100)); c.manualDisc = NUM(c.manualDisc);
  if(!c.promoName) delete c.promoName; if(!c.promoDisc) delete c.promoDisc; if(!c.manualPct) delete c.manualPct; if(!c.manualDisc) delete c.manualDisc;
  for(const k of ["name","phone","phoneKey","notes","method","methodFinal","createdBy","deliveredBy","notifiedStatus"]) if(k in c) c[k] = STR(c[k], k==="notes"?2000:120);
  for(const k of ["subtotal","discount","total","abono","cobradoEntrega"]) if(k in c){ if(c[k] == null) delete c[k]; else c[k] = NUM(c[k]); }
  c.discountPct = NUM(c.discountPct, 100);
  for(const k of ["createdAt","readyAt","deliveredAt","notifiedAt","erasedAt",...FLOW.map(s=>s+"At")]) if(k in c && c[k] != null) c[k] = TS(c[k]);
  for(const s of FLOW) if((s+"By") in c) c[s+"By"] = STR(c[s+"By"], 60);
  c.createdAt = TS(c.createdAt);
  c.dueDate = DATE(c.dueDate);
  c.items = Array.isArray(c.items) ? c.items.slice(0, 50).filter(i => i && typeof i === "object").map(i => ({key:STR(i.key,40), label:STR(i.label,80), qty:Math.round(NUM(i.qty, 999)), price:NUM(i.price, 10000)})) : [];
  const ph = (c.photos && typeof c.photos === "object") ? c.photos : {};
  c.photos = {recepcion:Math.round(NUM(ph.recepcion, 99)), entrega:Math.round(NUM(ph.entrega, 99))};
  c.paidFull = c.paidFull === true; c.loyaltyRedeemed = c.loyaltyRedeemed === true;
  c.promoOk = c.promoOk === true; c.avisoOk = c.avisoOk === true;
  for(const k of Object.keys(c)) if(!ORDER_KEYS.has(k)) delete c[k]; // campos desconocidos fuera (las reglas tampoco los aceptan)
  return c;
};
// Datos del titular para el aviso de privacidad (privacidad.html los lee de config/privacy, que es público).
const PRIV_DEFAULT = {titular:"", ruc:"", direccion:"", correo:"", whatsapp:"0980035702", vigencia:"", anios:2};
function normPrivacy(p){
  const x = (p && typeof p === "object") ? p : {};
  return {
    titular: STR(x.titular, 120), ruc: digits(x.ruc).slice(0,13), direccion: STR(x.direccion, 200),
    correo: STR(x.correo, 120), whatsapp: STR(x.whatsapp ?? PRIV_DEFAULT.whatsapp, 30),
    vigencia: /^\d{4}-\d{2}-\d{2}$/.test(String(x.vigencia||"")) ? String(x.vigencia) : "",
    anios: INT(x.anios, 1, 10, PRIV_DEFAULT.anios)
  };
}
let privacy = null; // se carga al arrancar (loadPrivacy), cuando ya existen las utilidades
// Igual para los ajustes: números como números y claves de servicio solo con letras.
const INT = (v, min, max, def) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
// Promociones de ejemplo (el administrador las edita, pausa o borra en Ajustes → Promociones)
const DEFAULT_PROMOS = [
  {id:"lunesblanco", name:"Lunes de Blanco", type:"pct", pct:25, n:2, m:1, days:[1], services:["gamuza"], req:"", active:true},
  {id:"miercolesnegro", name:"Miércoles de negro", type:"nxm", pct:0, n:3, m:2, days:[3], services:["clasicos","gamuza","botas","nino"], req:"Calzado negro u oscuro", active:true},
  {id:"cumple", name:"Promoción cumpleañera", type:"nxm", pct:0, n:2, m:1, days:[], services:[], req:"Presentó su cédula y cumple años hoy", active:true}
];
function normPromos(arr){
  return arr.slice(0, 20).filter(x => x && typeof x === "object").map(x => {
    const type = x.type==="nxm" ? "nxm" : "pct", n = INT(x.n, 2, 10, 2);
    return {id:STR(x.id,30).replace(/[^A-Za-z0-9_-]/g,"") || ("p" + Math.random().toString(36).slice(2,8)), name:STR(x.name,60) || "Promoción", type,
      pct:INT(x.pct, 1, 100, 10), n, m:INT(x.m, 1, n-1, n-1), days:[...new Set((Array.isArray(x.days)?x.days:[]).map(Number).filter(d => d>=0 && d<=6))].sort(),
      services:(Array.isArray(x.services)?x.services:[]).slice(0,30).map(k => STR(k,30).replace(/[^A-Za-z0-9_]/g,"")).filter(Boolean), req:STR(x.req,80), active:x.active !== false};
  });
}
function normSettings(s){
  const d = JSON.parse(JSON.stringify(DEFAULTS)), x = Object.assign({}, d, (s && typeof s === "object") ? s : {});
  const out = Object.assign(d, {
    business: STR(x.business, 80) || d.business, phone: STR(x.phone, 30), hours: STR(x.hours, 120), cc: digits(x.cc).slice(0,4) || "593",
    prefix: STR(x.prefix, 6).replace(/[^A-Za-z0-9-]/g,""), nextNumber: INT(x.nextNumber, 1, 1e8, d.nextNumber),
    loyaltyVisits: INT(x.loyaltyVisits, 1, 100, d.loyaltyVisits), loyaltyMonths: INT(x.loyaltyMonths, 1, 60, d.loyaltyMonths),
    loyaltyPct: Math.min(100, NUM(x.loyaltyPct ?? d.loyaltyPct)), inactiveDays: INT(x.inactiveDays, 1, 3650, d.inactiveDays),
    deliveryDays: INT(x.deliveryDays, 0, 60, d.deliveryDays), notifyAll: x.notifyAll !== false, reportPhone: STR(x.reportPhone, 30),
    photoDays: INT(x.photoDays, 7, 365, d.photoDays), numEpoch: INT(x.numEpoch, 0, 1e6, 0)
  });
  const sv = Array.isArray(x.services) ? x.services.slice(0, 30).map(v => ({key:STR(v && v.key, 30).replace(/[^A-Za-z0-9_]/g,""), label:STR(v && v.label, 60), price:NUM(v && v.price, 10000)})).filter(v => v.key && v.label) : [];
  out.services = sv.length ? sv : d.services;
  out.promos = Array.isArray(x.promos) ? normPromos(x.promos) : normPromos(DEFAULT_PROMOS);
  if(Array.isArray(x.users)) out.users = x.users; // solo modo local (sin nube)
  return out;
}
const WD = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const WD_ORDER = [1,2,3,4,5,6,0];

/* ---------- Estado ---------- */
let orders = [];
let settings = JSON.parse(JSON.stringify(DEFAULTS));
let view = "pedidos";
let filter = "recibido";
let q = "";
let clientQ = "";
let clientFilter = "todos";
let period = 30;
let draft = null;
let mode = "local";
let db = null, downloads = null;
let ordersCol = null, settingsDoc = null;
const cloud = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
let fb = null, fbAuth = null, cloudUsers = [], bootstrapping = false, bootstrapped = true, cloudError = false, unsub = [];
let me = null, ready = !(window.claude && window.claude.use) && !cloud, gateShown = null, opsFilter = "todos";
const ROLE = {admin:"Administrador", recepcion:"Recepción", operaciones:"Operaciones (ya no se usa)"};
const ROLE_DESC = {admin:"Ve y configura todo", recepcion:"Recibe, pasa a producción, marca listo, cobra y entrega"};
const ROLES_ACTIVE = ["admin","recepcion"]; // el rol Operaciones se retiró el 22-nov-2026
const ICON = {"pedidos": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M9 8h6M9 12h6M9 16h4\"/></svg>", "clientes": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5\"/><path d=\"M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2\"/></svg>", "nuevo": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\"><path d=\"M12 5v14M5 12h14\"/></svg>", "analisis": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 20V10M10 20V4M16 20v-7M22 20H2\"/></svg>", "ajustes": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/></svg>", "entregas": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 7l9-4 9 4v10l-9 4-9-4z\"/><path d=\"M3 7l9 4 9-4M12 11v10\"/><path d=\"M8.5 15.5l2 2 4-4\"/></svg>", "consultar": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-3.5-3.5\"/></svg>", "cola": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6h13M8 12h13M8 18h13\"/><circle cx=\"3.5\" cy=\"6\" r=\"1\"/><circle cx=\"3.5\" cy=\"12\" r=\"1\"/><circle cx=\"3.5\" cy=\"18\" r=\"1\"/></svg>"};
const TABS = {
  admin:[["tablero","Tablero"],["pedidos","Pedidos"],["nuevo","Nuevo"],["clientes","Clientes"],["gastos","Gastos"],["analisis","Análisis"],["ajustes","Ajustes"]],
  recepcion:[["nuevo","Nuevo"],["cola","Taller"],["entregas","Entregas"],["clientes","Clientes"],["gastos","Gastos"]]
};
const HOME = {admin:"tablero", recepcion:"nuevo"};
ICON.gastos = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M16.5 15h2"/><path d="M6 6l9-3 1.2 3"/></svg>';
ICON.insumos = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v4l-4 5v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8l-4-5V3"/><path d="M6 14h12"/></svg>';
ICON.tablero = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>';
const MAX_OPS = 5, PHOTO_MAX = 30; // fotos por etapa: una por par o artículo
let presence = {}, loginsData = [], hbTimer = null, sessionSince = 0, pendingLoginType = null;
let pendingPhotos = {recepcion:{}, entrega:{}}; // fotos por tomar, por unidad ("clasicos:1" → {data, thumb})

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const r2 = n => Math.round(((+n)||0)*100 + (n>=0?1e-9:-1e-9)) / 100;
// Acepta "4,50", "4.50", "$4.5", "4 ,5", "1.234,50", "1,234.50"
function parseNum(v){
  let t = String(v ?? "").replace(/[^\d.,]/g,"");
  const dec = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if(dec>=0){
    const intPart = t.slice(0,dec).replace(/[.,]/g,""), frac = t.slice(dec+1).replace(/[.,]/g,"");
    // "1.234" o "1,234" con 3 cifras y un solo separador: se toma como decimal (precios pequeños)
    t = (intPart||"0") + "." + frac;
  }
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}
const fmt2 = n => r2(n).toFixed(2);
const money = n => (r2(n) < 0 ? "-$" : "$") + fmt2(Math.abs(r2(n)));
const digits = s => String(s||"").replace(/\D/g,"");
function loadPrivacy(){ try{ privacy = normPrivacy(JSON.parse(localStorage.getItem("sc_privacy")||"null") || PRIV_DEFAULT); }catch(e){ privacy = normPrivacy(PRIV_DEFAULT); } }
loadPrivacy();
const phoneKey = p => { let d = digits(p); if(d.startsWith(settings.cc) && d.length>10) d = "0"+d.slice(settings.cc.length); return d; };
const waNumber = p => { let d = digits(p); if(d.startsWith("0")) d = settings.cc + d.slice(1); else if(d.length<=9) d = settings.cc + d; return d; };
const waLink = (p,msg) => "https://wa.me/" + waNumber(p) + "?text=" + encodeURIComponent(msg);
const uid = () => "o" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const todayStr = (add=0) => { const d = new Date(Date.now()+add*DAY); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const fmtDate = (ms,opt) => new Date(ms).toLocaleDateString("es-EC", opt || {day:"numeric",month:"short"});
const fmtDue = s => { if(!s) return "—"; const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("es-EC",{weekday:"short",day:"numeric",month:"short"}); };
const isLate = o => o.status!=="entregado" && o.dueDate && o.dueDate < todayStr();
const saldo = o => o.paidFull ? 0 : Math.max(0, r2((o.total||0) - (o.abono||0)));
const itemsText = o => (o.items||[]).map(i => i.qty + " " + i.label).join(", ");
const clean = o => JSON.parse(JSON.stringify(o));
const svgWA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3z"/></svg>';

function snack(text, href, id){
  document.querySelectorAll(".snack,.toast").forEach(x=>x.remove());
  const t = document.createElement("div"); t.className="snack"; t.setAttribute("role","status");
  t.innerHTML = `<p>${text}</p><a class="btn wa" href="${esc(href)}" target="_blank" rel="noopener">${svgWA} Avisar</a>`;
  t.querySelector("a").onclick = () => { if(id) markNotified(id); setTimeout(()=>t.remove(),50); };
  document.body.appendChild(t); setTimeout(()=>t.remove(), 7000);
}
function toast(msg){
  const t = document.createElement("div"); t.className="toast"; t.textContent=msg; t.setAttribute("role","status");
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2600);
}

/* ---------- Fidelización ---------- */
function loyalty(phone, excludeId){
  const key = phoneKey(phone);
  if(!key) return {visits:0, eligible:false, need:settings.loyaltyVisits};
  const now = Date.now();
  const winStart = now - settings.loyaltyMonths*30.44*DAY;
  const mine = orders.filter(o => o.phoneKey===key && o.id!==excludeId);
  const lastRedeem = mine.filter(o=>o.loyaltyRedeemed).reduce((m,o)=>Math.max(m,o.createdAt),0);
  const from = Math.max(winStart, lastRedeem ? lastRedeem+1 : 0);
  const visits = mine.filter(o => o.createdAt>=from && !o.loyaltyRedeemed).length;
  return {visits, eligible: visits >= settings.loyaltyVisits, need: Math.max(0, settings.loyaltyVisits - visits)};
}
function punchHTML(v){
  const n = settings.loyaltyVisits; let h = '<div class="punch" aria-label="'+Math.min(v,n)+' de '+n+' visitas">';
  for(let i=0;i<n;i++) h += '<i class="'+(i<v?"f":"")+'"></i>';
  h += '<i class="gift '+(v>=n?"f":"")+'" title="Visita con descuento"></i></div>';
  return h;
}

/* ---------- Clientes ---------- */
function clients(){
  const map = new Map();
  for(const o of orders){
    if(!o.phoneKey) continue;
    let c = map.get(o.phoneKey);
    if(!c){ c = {key:o.phoneKey, phone:o.phone, name:o.name, visits:0, spent:0, first:o.createdAt, last:o.createdAt, orders:[], promoOk:!!o.promoOk}; map.set(o.phoneKey,c); }
    c.visits++; c.spent += o.total||0; c.orders.push(o);
    if(o.createdAt >= c.last){ c.last = o.createdAt; c.name = o.name || c.name; c.phone = o.phone || c.phone; c.promoOk = !!o.promoOk; }
    if(o.createdAt < c.first) c.first = o.createdAt;
  }
  return [...map.values()];
}

/* ---------- Mensajes WhatsApp ---------- */
function msgReceipt(o){
  const l = loyalty(o.phone);
  let m = `Hola ${o.name} 👋\nRecibimos tus artículos en ${settings.business}.\n\n🧾 Pedido N° ${o.num}\n👟 ${itemsText(o)}\n💵 Total: ${money(o.total)}`;
  if(o.promoDisc) m += `\n🏷️ Promoción ${o.promoName}: -${money(o.promoDisc)}`;
  if(o.manualDisc) m += `\n🏷️ Descuento ${o.manualPct}%: -${money(o.manualDisc)}`;
  if(o.loyaltyRedeemed && o.discount) m += `\n🎁 Descuento fidelidad: -${money(o.discount)}`;
  m += `\n✅ Abono: ${money(o.paidFull?o.total:o.abono)}\n📌 Saldo: ${money(saldo(o))}\n📅 Entrega: ${fmtDue(o.dueDate)}\n\n`;
  m += o.loyaltyRedeemed ? `🎁 ¡Gracias por ser cliente frecuente! Tu tarjeta de fidelidad empieza de nuevo.` :
       l.eligible ? `🎁 ¡Tu próxima visita tiene ${settings.loyaltyPct}% de descuento!` :
       `⭐ Tarjeta de fidelidad: ${l.visits}/${settings.loyaltyVisits} visitas. Con ${settings.loyaltyVisits} visitas en ${settings.loyaltyMonths} meses, la siguiente tiene ${settings.loyaltyPct}% de descuento.`;
  m += `\n\n${settings.hours}`;
  return m;
}
function stagesText(o){
  const idx = FLOW.indexOf(o.status);
  return FLOW.slice(0,3).map((k,i)=>(i<idx?"✅":i===idx?"👉":"⬜")+" "+ST[k].l.replace(" para entregar","")).join("\n");
}
function msgStatus(o){
  return `Hola ${o.name} 👋\nActualización de tu pedido N° ${o.num} en ${settings.business}:\n\n${ST[o.status].ic} Ahora está en: *${ST[o.status].l}*\n\n${stagesText(o)}\n\n📅 Entrega estimada: ${fmtDue(o.dueDate)}\nTe avisaremos cuando esté listo.`;
}
function msgFor(o){ return o.status==="listo" ? msgReady(o) : PROC.includes(o.status) ? msgStatus(o) : msgReceipt(o); }
function msgReady(o){
  return `Hola ${o.name} ✨\n¡Tus artículos ya están listos en ${settings.business}!\n\n🧾 Pedido N° ${o.num}\n👟 ${itemsText(o)}\n💵 Saldo a pagar: ${money(saldo(o))}\n\nPuedes retirarlos ${settings.hours}. ¡Te esperamos!`;
}
function msgThanks(o){
  const l = loyalty(o.phone);
  return `¡Gracias por tu visita, ${o.name}! 🙌\nEntregamos tu pedido N° ${o.num}.\n\n⭐ Llevas ${l.visits}/${settings.loyaltyVisits} visitas en tu tarjeta de fidelidad.${l.eligible?` ¡Tu próxima visita tiene ${settings.loyaltyPct}% de descuento! 🎁`:` Te faltan ${l.need} para tu descuento de ${settings.loyaltyPct}%.`}`;
}
function msgMiss(c){
  const l = loyalty(c.phone);
  return `Hola ${c.name} 👋 Te extrañamos en ${settings.business}.\n¿Tus zapatos necesitan una limpieza? Lavado, secado y esterilización listos en pocos días.\n\n⭐ Tienes ${l.visits}/${settings.loyaltyVisits} visitas en tu tarjeta.${l.eligible?` ¡Tu próxima visita tiene ${settings.loyaltyPct}% de descuento! 🎁`:""}\n\n${settings.hours}`;
}

/* ---------- Avisos por WhatsApp en cada etapa ---------- */
// Cuando un pedido cambia de etapa queda un aviso pendiente. Recepción los envía
// desde la bandeja (botón verde abajo) con un toque cada uno.
const NOTIFY_SINCE = Date.UTC(2026,9,7); // avisos anteriores a esta versión no se reclaman
const stageAt = o => o.status==="listo" ? (o.readyAt||o.listoAt||0) : (o[o.status+"At"]||0);
function needsNotice(o){
  if(!(settings.notifyAll ? [...PROC,"listo"] : ["listo"]).includes(o.status)) return false;
  if(digits(o.phone).length < 7 || o.notifiedStatus===o.status) return false;
  const at = stageAt(o);
  if(at < NOTIFY_SINCE) return false;
  return !(o.notifiedAt && o.notifiedAt >= at);
}
const pendingNotices = () => orders.filter(needsNotice).sort((a,b)=>stageAt(a)-stageAt(b));
function markNotified(id){
  const o = orders.find(x=>x.id===id); if(!o || o.status==="entregado") return;
  patchOrder(id, {notifiedStatus:o.status, notifiedAt:Date.now()}).then(renderNotices);
}
let lastNoticeCount = -1;
function renderNotices(){
  const pill = $("#nqPill"); if(!pill) return;
  const list = me && !isOps() ? pendingNotices() : [];
  if(lastNoticeCount>=0 && list.length>lastNoticeCount && !$("#nq")){ toast("📲 Nuevo aviso por enviar al cliente"); try{ if(navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(150); }catch(e){} }
  lastNoticeCount = me ? list.length : -1;
  pill.hidden = !list.length;
  document.body.classList.toggle("hasnq", !!list.length);
  pill.innerHTML = `${svgWA} Avisos por enviar <b>${list.length}</b>`;
  pill.setAttribute("aria-label", `${list.length} avisos de WhatsApp por enviar`);
  pill.onclick = noticesSheet;
  const box = $("#nq"); if(box) box.innerHTML = noticesHTML(list);
}
function noticesHTML(list){
  if(!list.length) return `<div class="empty" style="padding:20px"><strong>¡Todo avisado!</strong>No hay mensajes pendientes.</div>`;
  return list.map(o => `<div class="nqrow"><span class="nqi"><span class="num">N° ${esc(o.num)}</span> ${esc(o.name)}<br><span class="small muted">${ST[o.status].ic} ${ST[o.status].l} · hace ${fmtDur(Date.now()-stageAt(o))}</span></span>
    <button class="btn ghost" data-nqskip="${esc(o.id)}" aria-label="Omitir aviso de ${esc(o.num)}">Omitir</button>
    <a class="btn wa" href="${esc(waLink(o.phone,msgFor(o)))}" target="_blank" rel="noopener" data-nqsend="${esc(o.id)}">${svgWA} Enviar</a></div>`).join("");
}
function noticesSheet(){
  openSheet(`<h2>Avisos por enviar</h2><p class="muted small" style="margin:0 0 6px">Pedidos que cambiaron de etapa. Toca <b>Enviar</b>: se abre WhatsApp con el mensaje listo; al volver, sigue con el siguiente.</p>
    <div id="nq">${noticesHTML(pendingNotices())}</div>
    <div class="stack"><button class="btn ghost block" data-close>Cerrar</button></div>`);
  $("#nq").addEventListener("click", e => {
    const t = e.target.closest("[data-nqsend],[data-nqskip]"); if(!t) return;
    markNotified(t.dataset.nqsend || t.dataset.nqskip);
  });
}

/* ---------- Persistencia ---------- */
function saveLocal(){ try{ localStorage.setItem("sc_orders", JSON.stringify(orders)); localStorage.setItem("sc_settings", JSON.stringify(settings)); }catch(e){} }
function loadLocal(){
  try{ const o = JSON.parse(localStorage.getItem("sc_orders")||"null"); if(Array.isArray(o)) orders = o.map(norm); }catch(e){}
  try{ const s = JSON.parse(localStorage.getItem("sc_settings")||"null"); if(s) settings = normSettings(s); }catch(e){}
}
// Sin internet: en la nube cada escritura queda guardada en el equipo al instante y se sube sola
// cuando vuelve la conexión. No se espera la respuesta del servidor (sin internet nunca llega):
// se espera un momento y se sigue. Si luego el servidor la rechaza, se avisa.
function cloudWrite(pr, what){
  pr.catch(err => toast((what || "Un cambio") + " no se pudo guardar en la nube: " + fbErr(err)));
  return Promise.race([pr.then(() => true, () => false), new Promise(r => setTimeout(() => r(null), 1500))]);
}
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo")), ms))]);
async function putOrder(o){
  const i = orders.findIndex(x=>x.id===o.id);
  if(i>=0) orders[i] = o; else orders.unshift(o);
  if(mode==="db"){ try{ await (cloud ? cloudWrite(ordersCol.doc(o.id).set(clean(o)), "El pedido") : ordersCol.doc(o.id).set(clean(o))); }catch(e){ toast("No se pudo guardar. Revisa tu conexión."); } }
  else saveLocal();
}
async function patchOrder(id, patch){
  const i = orders.findIndex(x=>x.id===id); if(i<0) return;
  orders[i] = Object.assign({}, orders[i], patch);
  if(mode==="db"){ try{ await (cloud ? cloudWrite(ordersCol.doc(id).update(clean(patch)), "El cambio del pedido") : ordersCol.doc(id).update(clean(patch))); }catch(e){ toast("No se pudo guardar. Revisa tu conexión."); } }
  else saveLocal();
}
async function removeOrder(id){
  orders = orders.filter(x=>x.id!==id);
  try{ await deletePhotos(id); }catch(e){}
  if(mode==="db"){ try{ await ordersCol.doc(id).delete(); }catch(e){ toast("No se pudo eliminar."); } }
  else saveLocal();
}
async function savePrivacy(){
  try{ localStorage.setItem("sc_privacy", JSON.stringify(privacy)); }catch(e){}
  if(mode==="db" && fb){ try{ await fb.doc("config/privacy").set(Object.assign({}, privacy, {fotosDias: settings.photoDays})); }catch(e){ toast("No se pudo guardar el aviso de privacidad."); } }
}
async function saveSettings(){
  if(mode==="db"){ try{ const st = clean(settings); if(cloud) delete st.users; await (cloud ? cloudWrite(settingsDoc.set(st), "Los ajustes") : settingsDoc.set(st)); }catch(e){ toast("No se pudieron guardar los ajustes."); } }
  else saveLocal();
}

/* ---------- Navegación ---------- */
function go(v){ if(!allowed(v)) return; view = v; if(v==="nuevo" && !draft) newDraft(); render(); window.scrollTo(0,0); }

/* ---------- Acceso ---------- */
const isOps = () => !!me && me.role==="operaciones";
const isAdmin = () => !!me && me.role==="admin";
const allowed = v => !!me && (TABS[me.role]||[]).some(t=>t[0]===v && v!=="consultar");
const newSalt = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
async function hashPw(salt, pw){
  const data = new TextEncoder().encode(salt + ":" + pw);
  try{ if(window.crypto && crypto.subtle){ const b = await crypto.subtle.digest("SHA-256", data); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); } }catch(e){}
  let h = 5381; for(const c of data) h = ((h<<5)+h+c)>>>0; return "x"+h.toString(16);
}
const users = () => cloud ? cloudUsers : (Array.isArray(settings.users) ? settings.users : []);
function setSession(u){ if(cloud) return; try{ if(u) localStorage.setItem("sc_session", u); else localStorage.removeItem("sc_session"); }catch(e){} }
function restoreSession(){
  if(cloud) return;
  let u = null; try{ u = localStorage.getItem("sc_session"); }catch(e){}
  const f = u && users().find(x=>x.u===u);
  me = f ? {u:f.u, name:f.name, role:f.role} : null;
}
function refreshMe(){
  if(!me) return;
  const f = users().find(x=>x.u===me.u);
  if(!f){ logout(true); return; }
  me = {u:f.u, name:f.name, role:f.role};
}
async function logout(silent){
  if(cloud && fbAuth){
    if(fb){ const synced = await Promise.race([fb.waitForPendingWrites().then(() => true, () => true), new Promise(r => setTimeout(() => r(false), 2500))]);
      if(!synced){ alert("Hay pedidos, fotos o gastos guardados solo en este equipo.\n\nConéctate a internet y espera a que diga «Sincronizado ✓» antes de cerrar sesión."); return; } }
    clearInterval(hbTimer); closeSheet();
    const pid = me && (me.uid||me.u); const fin = () => fbAuth.signOut().catch(()=>{}).then(wipeLocalCache);
    if(pid && fb && me){ withTimeout(fb.doc("presence/"+pid).set({uid:pid,u:me.u,name:me.name,role:me.role,lastSeen:Date.now(),since:sessionSince,offline:true}), 2500).then(fin, fin); } else fin();
    if(!silent) toast("Sesión cerrada"); return;
  }
  clearInterval(hbTimer); me = null; setSession(null); closeSheet(); draft = null; gateShown = null; render(); if(!silent) toast("Sesión cerrada");
}
// Al cerrar sesión se borra la copia local de pedidos y clientes (tablets compartidas).
async function wipeLocalCache(){
  try{ if(fb){ await fb.terminate(); await fb.clearPersistence(); } }catch(e){}
  try{ ["sc_orders","sc_settings","sc_expenses","sc_supplies","sc_moves"].forEach(k => localStorage.removeItem(k)); Object.keys(localStorage).filter(k => k.startsWith("sc_me_")).forEach(k => localStorage.removeItem(k)); }catch(e){}
  location.reload();
}
function renderNav(){
  const nav = document.querySelector("nav.tabs");
  if(!me){ nav.hidden = true; return; }
  nav.hidden = false;
  const tabs = TABS[me.role] || [];
  const inner = $("#navInner");
  inner.style.gridTemplateColumns = `repeat(${tabs.length},1fr)`;
  inner.innerHTML = tabs.map(([k,l]) => k==="nuevo"
    ? `<button data-tab="nuevo" aria-label="Nuevo pedido" ${view===k?'aria-current="page"':""}><span class="plus">${ICON.nuevo}</span>${l}</button>`
    : `<button data-tab="${k}" ${view===k?'aria-current="page"':""}>${ICON[k]}${l}</button>`).join("");
  inner.querySelectorAll("button").forEach(b => b.onclick = () => b.dataset.tab==="consultar" ? openConsult() : go(b.dataset.tab));
}
function renderUser(){
  const b = $("#userBtn");
  if(!me){ b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<span>👤 ${esc(me.name||me.u)}</span><small>${ROLE[me.role]}</small>`; b.setAttribute("aria-label", "Sesión de "+(me.name||me.u)+", "+ROLE[me.role]);
  b.onclick = () => openSheet(`<h2>${esc(me.name||me.u)}</h2><p class="muted" style="margin:0">@${esc(me.u)} · <span class="rolepill r-${me.role}">${ROLE[me.role]}</span></p>
    <div class="stack">${cloud?`<button class="btn ghost block" id="myPw">Cambiar mi contraseña</button>`:""}<button class="btn block" id="doLogout">Cerrar sesión</button><button class="btn ghost block" data-close>Cancelar</button></div>`) || ($("#doLogout").onclick = () => logout(), $("#myPw") && ($("#myPw").onclick = myPwSheet));
}
function renderGate(){
  renderNav(); renderUser();
  if(!ready){ if(gateShown!=="loading"){ gateShown="loading"; $("#view").innerHTML = `<div class="empty"><strong>Cargando…</strong></div>`; } return; }
  const want = cloud ? (cloudError ? "error" : bootstrapped ? "login" : "setup") : (users().length ? "login" : "setup");
  if(gateShown===want && $("#gate")) return;
  gateShown = want;
  const v = $("#view");
  if(want==="error"){
    v.innerHTML = `<div class="gate" id="gate"><div class="card"><h2>Sin conexión</h2><p class="muted">No se pudo conectar con la nube. Revisa tu internet y vuelve a intentar.</p><button class="btn block" id="gateRetry">Reintentar</button></div></div>`;
    $("#gateRetry").onclick = () => location.reload();
    return;
  }
  if(want==="setup"){
    v.innerHTML = `<div class="gate" id="gate"><form class="card" id="gateForm" autocomplete="off">
      <h2>Bienvenido 👋</h2><p class="muted small" style="margin:0 0 16px">Crea el usuario <b>administrador</b>. Con él podrás crear los usuarios de recepción.</p>
      <div class="field"><label for="g_n">Tu nombre</label><input class="input" id="g_n" required placeholder="Ej. Osiris"></div>
      <div class="field"><label for="g_u">${cloud?"Tu correo":"Usuario"}</label><input class="input" id="g_u" required autocapitalize="none" ${cloud?'type="email" autocomplete="email" placeholder="Ej. dueno@gmail.com"':'placeholder="Ej. admin"'}></div>
      <div class="field"><label for="g_p">Contraseña</label><input class="input" id="g_p" type="password" required minlength="4" autocomplete="new-password"></div>
      <div class="field"><label for="g_p2">Repite la contraseña</label><input class="input" id="g_p2" type="password" required minlength="4" autocomplete="new-password"></div>
      <button class="btn block" type="submit">Crear administrador y entrar</button></form></div>`;
    $("#gateForm").onsubmit = async e => {
      e.preventDefault();
      const u = $("#g_u").value.trim().toLowerCase(), n = $("#g_n").value.trim(), p1 = $("#g_p").value, p2 = $("#g_p2").value;
      if(!u || !n){ toast(cloud?"Completa nombre y correo":"Completa nombre y usuario"); return; }
      if(cloud && !isEmail(u)){ toast("Revisa el correo"); return; }
      if(p1.length<4){ toast("La contraseña debe tener al menos 4 caracteres"); return; }
      if(p1!==p2){ toast("Las contraseñas no coinciden"); return; }
      if(cloud){ await cloudSetup(u, n, p1); return; }
      const salt = newSalt();
      settings.users = [{u, name:n, role:"admin", salt, h: await hashPw(salt,p1)}];
      await saveSettings();
      me = {u, name:n, role:"admin"}; setSession(u); view = HOME.admin; gateShown = null; render();
      toast("Administrador creado");
    };
  } else {
    v.innerHTML = `<div class="gate" id="gate"><form class="card" id="gateForm">
      <h2>Iniciar sesión</h2><p class="muted small" style="margin:0 0 16px">Ingresa con tu usuario${cloud?" o correo":""} y contraseña.</p>
      <div class="field"><label for="l_u">${cloud?"Usuario o correo":"Usuario"}</label><input class="input" id="l_u" required autocapitalize="none" autocomplete="username"></div>
      <div class="field"><label for="l_p">Contraseña</label><input class="input" id="l_p" type="password" required autocomplete="current-password"></div>
      <button class="btn block" type="submit" style="min-height:52px">Entrar</button>
      ${cloud?`<button type="button" class="btn ghost block" id="forgot" style="margin-top:10px">¿Olvidaste tu contraseña?</button>`:`<p class="small muted" style="margin:14px 0 0">¿Olvidaste tu contraseña? Pide al administrador que te asigne una nueva.</p>`}
      <p class="small muted" style="margin:8px 0 0"><a href="privacidad.html" target="_blank" rel="noopener">Aviso de privacidad</a></p></form></div>`;
    const fg = $("#forgot");
    if(fg) fg.onclick = () => {
      const v = $("#l_u").value.trim().toLowerCase();
      if(isEmail(v)) sendReset(v);
      else toast(v ? "Si entras con usuario (no correo), pide al administrador que te cree uno nuevo." : "Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?»", 6000);
    };
    $("#gateForm").onsubmit = async e => {
      e.preventDefault();
      const u = $("#l_u").value.trim().toLowerCase(), p = $("#l_p").value;
      if(cloud){
        const btn = $("#gateForm button[type=submit]"); btn.disabled = true; btn.textContent = "Entrando…";
        pendingLoginType = "login";
        try{ await fbAuth.signInWithEmailAndPassword(toEmail(u), p); }
        catch(err){ toast(/network/.test(err.code||"") ? "Sin conexión a internet" : "Usuario o contraseña incorrectos"); btn.disabled = false; btn.textContent = "Entrar"; $("#l_p").value=""; $("#l_p").focus(); }
        return;
      }
      const f = users().find(x=>x.u===u);
      if(f && !ROLES_ACTIVE.includes(f.role)){ toast("El rol Operaciones ya no existe. Pide al administrador que te asigne Recepción."); return; }
      if(!f || (await hashPw(f.salt,p))!==f.h){ toast("Usuario o contraseña incorrectos"); $("#l_p").value=""; $("#l_p").focus(); return; }
      me = {u:f.u, name:f.name, role:f.role}; setSession(f.u); recordLogin("login"); startPresence(); view = HOME[f.role]; draft = null; gateShown = null; render(); window.scrollTo(0,0);
    };
  }
  const first = v.querySelector("input"); if(first) first.focus({preventScroll:true});
}

/* ---------- Entrega: banderita ---------- */
function dueLevel(o){
  if(!o.dueDate || o.status==="entregado") return "ok";
  const t = todayStr(), m = todayStr(1);
  if(o.dueDate < t) return "late"; if(o.dueDate===t) return "today"; if(o.dueDate===m) return "tomorrow"; return "ok";
}
function flagHTML(o){
  const d = dueLevel(o);
  return d==="late" ? `<span class="flag flag-late">⚠️ Atrasado</span>` : d==="today" ? `<span class="flag">🚩 Entrega HOY</span>` : d==="tomorrow" ? `<span class="flag">🚩 Entrega mañana</span>` : "";
}
const dueCls = o => { const d = dueLevel(o); return d==="late" ? "t-late" : (d==="today"||d==="tomorrow") ? "t-soon" : ""; };
const consultBtn = () => `<button class="btn ghost block" data-consult style="margin-bottom:14px">${ICON.consultar} Consultar estado de un pedido</button>`;

/* ---------- Consultar estado ---------- */
function openConsult(){
  openSheet(`<h2>Consultar estado</h2><p class="muted small" style="margin:0 0 12px">Busca por N° de recibo, celular o nombre.</p>
    <input class="search" id="cs" type="search" placeholder="Ej. 574, 0991234567 o Ana" autocomplete="off">
    <div id="csr"><p class="small muted">Escribe al menos 2 caracteres.</p></div>
    <div class="stack"><button class="btn ghost block" data-close>Cerrar</button></div>`);
  const inp = $("#cs"); inp.focus();
  inp.oninput = () => {
    const s = inp.value.trim().toLowerCase(), d = digits(s), box = $("#csr");
    if(s.length<2){ box.innerHTML = `<p class="small muted">Escribe al menos 2 caracteres.</p>`; return; }
    const res = orders.filter(o => (o.name||"").toLowerCase().includes(s) || (o.num||"").toLowerCase().includes(s) || (d.length>=2 && (digits(o.num).includes(d) || (o.phoneKey||"").includes(d) || digits(o.phone).includes(d))))
      .sort((a,b)=>b.createdAt-a.createdAt).slice(0,25);
    box.innerHTML = res.length ? res.map(o => {
      const st = ST[o.status], idx = FLOW.indexOf(o.status), sal = saldo(o);
      return `<button class="ticket crow s-${o.status} ${dueCls(o)}" data-open="${esc(o.id)}"><div class="body">
        <div class="head"><span class="headl"><span class="num">N° ${esc(o.num)}</span>${flagHTML(o)}</span><span class="status">${st.ic} ${st.l}</span></div>
        <div class="name">${esc(o.name)}</div><div class="items">${esc(itemsText(o))}</div>
        <div class="meta"><span>${o.status==="entregado"?"Entregado "+fmtDate(o.deliveredAt||o.createdAt):"Entrega: "+fmtDue(o.dueDate)}</span>${isOps()?"":sal>0?`<span>Saldo <b>${money(sal)}</b></span>`:`<span class="muted">Pagado</span>`}</div>
        ${progressHTML(o)}</div></button>`; }).join("") : `<div class="empty" style="padding:20px">Sin resultados</div>`;
    box.querySelectorAll("[data-open]").forEach(b => b.onclick = () => orderSheet(b.dataset.open));
  };
}

/* ---------- Vista: Entregas (recepción) ---------- */
function viewEntregas(){
  let list = orders.filter(o=>o.status==="listo").sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||"") || (a.readyAt||0)-(b.readyAt||0));
  const inProc = orders.filter(o=>o.status==="recibido"||PROC.includes(o.status)).length;
  const porCobrar = list.reduce((t,o)=>t+saldo(o),0);
  if(q){ const s = q.toLowerCase(); list = list.filter(o => (o.name||"").toLowerCase().includes(s) || (o.num||"").toLowerCase().includes(s) || (o.phone||"").includes(s)); }
  let h = consultBtn() + reportBtns(true) + `<div class="dayline"><span><b>${list.length}</b> listo${list.length===1?"":"s"} para entregar</span><span><b>${money(porCobrar)}</b> por cobrar</span><span><b>${inProc}</b> en taller</span></div>
  <div class="listhead"><h2>Entregar y cobrar</h2></div>
  <input class="search" id="q" type="search" placeholder="Buscar por nombre, teléfono o N°" value="${esc(q)}">`;
  if(!list.length) h += `<div class="empty"><strong>Nada por entregar</strong>Cuando un pedido se marque como listo en el Taller, aparecerá aquí.</div>`;
  list.forEach(o => h += ticketHTML(o));
  return h;
}

/* ---------- Vista: Taller (recepción y administración) ---------- */
function viewCola(){
  const queue = orders.filter(o=>o.status==="recibido"||PROC.includes(o.status));
  const cnt = {todos:queue.length, recibido:0, produccion:0};
  queue.forEach(o=>{ if(o.status in cnt) cnt[o.status]++; });
  if(!(opsFilter in cnt)) opsFilter = "todos";
  let list = opsFilter==="todos" ? queue : queue.filter(o=>o.status===opsFilter);
  if(q){ const s2 = q.toLowerCase(); list = list.filter(o => (o.name||"").toLowerCase().includes(s2) || (o.num||"").toLowerCase().includes(s2) || (o.phone||"").includes(s2)); }
  list = list.slice().sort((a,b)=>(a.dueDate||"9").localeCompare(b.dueDate||"9") || a.createdAt-b.createdAt);
  const late = queue.filter(o=>dueLevel(o)==="late").length, soon = queue.filter(o=>["today","tomorrow"].includes(dueLevel(o))).length;
  const chip = (k,l) => `<button class="chip" data-of="${k}" aria-pressed="${opsFilter===k}">${l} <span class="n">${cnt[k]}</span></button>`;
  let h = `<div class="listhead"><h2>Taller</h2><span class="small muted">${queue.length} pendiente${queue.length===1?"":"s"}</span></div>`;
  if(late) h += `<div class="alertbar">⚠️ <span><b>${late} atrasado${late===1?"":"s"}</b> · pasó la fecha de entrega</span></div>`;
  if(soon) h += `<div class="alertbar" style="border-left-color:#e07b00;background:color-mix(in srgb,#ffb347 18%,var(--surface))">🚩 <span><b style="color:#b35f00">${soon} pedido${soon===1?"":"s"}</b> se entrega${soon===1?"":"n"} hoy o mañana</span></div>`;
  h += `<div class="chips" role="group" aria-label="Filtrar por etapa">${chip("todos","Todos")}${chip("recibido","📥 Por producir")}${chip("produccion","🧼 En producción")}</div>
  <input class="search" id="q" type="search" placeholder="Buscar por nombre, teléfono o N°" value="${esc(q)}">`;
  if(!list.length) h += `<div class="empty"><strong>Sin trabajo pendiente</strong>${queue.length?"No hay pedidos en esta etapa.":"Todo está listo. ¡Buen trabajo!"}</div>`;
  list.forEach(o => h += ticketHTML(o));
  return h;
}
function opsSheet(o){
  openSheet(`<div class="row" style="justify-content:space-between"><span class="num">N° ${esc(o.num)}</span>${flagHTML(o)}</div>
    <h2 style="margin-top:10px">${esc(o.name)}</h2>
    <div class="panel pad" style="margin-top:12px"><div class="totals">${(o.items||[]).map(i=>`<div><span>${esc(i.label)}</span><b>${esc(i.qty)}</b></div>`).join("")}</div></div>
    ${o.notes?`<p><b>Notas:</b> ${esc(o.notes)}</p>`:""}
    <p class="small">Entrega: <b>${fmtDue(o.dueDate)}</b> · Recibido ${fmtDate(o.createdAt,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
    <span class="lbl" style="margin-top:12px">Fotos de cómo llegó · toca para ampliar</span>
    <div id="phbox" class="small muted">${photoCount(o)?"Cargando fotos…":"Sin fotos de recepción."}</div>
    <span class="lbl" style="margin-top:12px">Etapa</span>
    <div class="stwrap" role="group" id="stSeg">${FLOW.slice(0,5).map(k=>`<button type="button" data-st="${k}" aria-pressed="${o.status===k}">${ST[k].ic} ${ST[k].l.replace(" para entregar","")}</button>`).join("")}</div>
    <div class="stack"><button class="btn ghost block" data-close>Cerrar</button></div>`);
  if(photoCount(o)) renderPhotoPanel(o, {readOnly:true, stages:["recepcion"]});
  $("#stSeg").querySelectorAll("[data-st]").forEach(b => b.onclick = async () => {
    if(busy.has(o.id)) return; busy.add(o.id); setTimeout(()=>busy.delete(o.id), 350);
    const k = b.dataset.st; const patch = {status:k, [k+"At"]:Date.now(), [k+"By"]:me.u};
    if(k==="listo" && !o.readyAt) patch.readyAt = Date.now();
    await patchOrder(o.id, patch); closeSheet(); render();
    toast(k==="listo" ? `${o.num} listo. Recepción avisará al cliente.` : `${o.num} → ${ST[k].ic} ${ST[k].l}`);
  });
}

/* ---------- Usuarios (admin) ---------- */
function usersPanel(){
  const nOps = users().filter(x=>x.role==="operaciones").length;
  return `<div class="lbl">Usuarios y roles</div><div class="panel pad">
    ${nOps ? `<p class="small" style="margin:0 0 6px;color:var(--danger)">${nOps} usuario${nOps===1?"":"s"} con el rol Operaciones ya no puede${nOps===1?"":"n"} entrar: cámbiales el rol a Recepción o desactívalos.</p>` : ""}
    ${users().map(u=>`<div class="hist" style="align-items:center"><span><b>${esc(u.name)}</b> <span class="muted small">${u.email?esc(u.email):"@"+esc(u.u)}</span><br><span class="rolepill r-${u.role}">${ROLE[u.role]}</span></span>
      <span class="row" style="gap:6px">${cloud?"":`<button class="btn ghost" style="min-height:38px;padding:6px 10px" data-upw="${esc(u.u)}">Cambiar clave</button>`}${u.u!==me.u?`<button class="btn ghost" style="min-height:38px;padding:6px 10px" data-urole="${esc(u.u)}">Cambiar rol</button>`:""}${u.u!==me.u?`<button class="btn danger" style="min-height:38px;padding:6px 10px" data-udel="${esc(u.u)}">${cloud?"Desactivar":"Quitar"}</button>`:""}</span></div>`).join("")}
    <button class="btn block" id="uAdd" style="margin-top:10px">Agregar usuario</button>
    ${cloud?`<p class="small muted" style="margin:10px 0 0">Cada usuario cambia su propia contraseña tocando su nombre arriba a la derecha. Los administradores entran con su correo y, si la olvidan, usan «¿Olvidaste tu contraseña?» al iniciar sesión. Si alguien de recepción u operaciones la olvida, desactívalo y créale un usuario nuevo (por ejemplo maria2).</p>`:""}</div>`;
}
function userSheet(){
  let role = "recepcion";
  openSheet(`<h2>Nuevo usuario</h2>
    <div class="field" style="margin-top:12px"><label for="u_n">Nombre</label><input class="input" id="u_n" placeholder="Ej. María"></div>
    <div class="field" id="u_ef" hidden><label for="u_e">Correo del administrador</label><input class="input" id="u_e" type="email" autocapitalize="none" autocomplete="off" placeholder="Ej. dueno@gmail.com"><p class="small muted" style="margin:6px 0 0">Le llegará un correo para que cree su propia contraseña. Después entra con ese correo.</p></div>
    <div class="field" id="u_uf"><label for="u_u">Usuario</label><input class="input" id="u_u" autocapitalize="none" placeholder="Ej. maria"></div>
    <div class="field" id="u_pf"><label for="u_p">Contraseña</label><input class="input" id="u_p" type="text" autocomplete="off" placeholder="Mínimo ${cloud?8:4} caracteres"></div>
    <span class="lbl">Rol</span><div class="rolepick" id="u_r">${ROLES_ACTIVE.map(k=>`<button type="button" data-r="${k}" aria-pressed="${k===role}"><b>${ROLE[k]}</b><small>${ROLE_DESC[k]}</small></button>`).join("")}</div>
    <div class="stack"><button class="btn block" id="u_save">Crear usuario</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  const byEmail = () => cloud && role==="admin";
  $("#u_r").querySelectorAll("[data-r]").forEach(b => b.onclick = () => { role = b.dataset.r; $("#u_r").querySelectorAll("[data-r]").forEach(x=>x.setAttribute("aria-pressed", x===b));
    $("#u_ef").hidden = !byEmail(); $("#u_uf").hidden = byEmail(); $("#u_pf").hidden = byEmail(); });
  $("#u_save").onclick = async () => {
    if(byEmail()){
      const n = $("#u_n").value.trim(), em = $("#u_e").value.trim().toLowerCase();
      if(!n){ toast("Escribe el nombre"); return; }
      if(!isEmail(em) || em.length>120){ toast("Revisa el correo"); $("#u_e").focus(); return; }
      if(users().some(x=>x.email===em)){ toast("Ese correo ya tiene usuario"); return; }
      const sb = $("#u_save"); sb.disabled = true; sb.textContent = "Creando…";
      if(await cloudInviteAdmin(em, n)){ closeSheet(); toast(`Listo. Enviamos a ${em} el enlace para crear su contraseña.`, 6000); }
      else { sb.disabled = false; sb.textContent = "Crear usuario"; }
      return;
    }
    const n = $("#u_n").value.trim(), u = $("#u_u").value.trim().toLowerCase().replace(/\s+/g,""), p = $("#u_p").value;
    if(!n || !u){ toast("Completa nombre y usuario"); return; }
    if(users().some(x=>x.u===u)){ toast("Ese usuario ya existe"); return; }
  
    if(p.length<(cloud?8:4)){ toast(`La contraseña debe tener al menos ${cloud?8:4} caracteres`); return; }
    if(cloud){ const sb = $("#u_save"); sb.disabled = true; sb.textContent = "Creando…"; if(await cloudCreateUser(u,n,role,p)){ closeSheet(); toast(`Usuario ${u} creado (${ROLE[role]})`); } else { sb.disabled = false; sb.textContent = "Crear usuario"; } return; }
    const salt = newSalt();
    settings.users = users().concat([{u, name:n, role, salt, h: await hashPw(salt,p)}]);
    await saveSettings(); closeSheet(); render(); toast(`Usuario ${u} creado (${ROLE[role]})`);
  };
}
function pwSheet(u){
  const f = users().find(x=>x.u===u); if(!f) return;
  openSheet(`<h2>Cambiar contraseña</h2><p class="muted" style="margin:0">${esc(f.name)} · @${esc(f.u)}</p>
    <div class="field" style="margin-top:14px"><label for="pw1">Nueva contraseña</label><input class="input" id="pw1" type="text" autocomplete="off"></div>
    <div class="stack"><button class="btn block" id="pwSave">Guardar</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  $("#pwSave").onclick = async () => {
    const p = $("#pw1").value; if(p.length<4){ toast("Mínimo 4 caracteres"); return; }
    const salt = newSalt(), h = await hashPw(salt,p);
    settings.users = users().map(x => x.u===u ? Object.assign({}, x, {salt, h}) : x);
    await saveSettings(); closeSheet(); toast("Contraseña actualizada");
  };
}
function promoSheet(id){
  const old = id ? promoById(id) : null;
  const x = old ? JSON.parse(JSON.stringify(old)) : {id:"p" + Date.now().toString(36), name:"", type:"pct", pct:10, n:2, m:1, days:[], services:[], req:"", active:true};
  const draw = () => {
    openSheet(`<h2>${old ? "Editar promoción" : "Nueva promoción"}</h2>
      <div class="field" style="margin-top:12px"><label for="pr_n">Nombre</label><input class="input" id="pr_n" maxlength="60" placeholder="Ej. Lunes de Blanco" value="${esc(x.name)}"></div>
      <span class="lbl">Tipo</span><div class="seg" role="group" id="pr_t"><button type="button" data-t="pct" aria-pressed="${x.type==="pct"}">% de descuento</button><button type="button" data-t="nxm" aria-pressed="${x.type==="nxm"}">Lleva N, paga M</button></div>
      ${x.type==="pct" ? `<div class="field" style="margin-top:10px"><label for="pr_p">Porcentaje</label><input class="input" id="pr_p" inputmode="numeric" value="${x.pct}"></div>`
        : `<div class="two" style="margin-top:10px"><div class="field"><label for="pr_nn">Lleva</label><input class="input" id="pr_nn" inputmode="numeric" value="${x.n}"></div><div class="field"><label for="pr_mm">Paga</label><input class="input" id="pr_mm" inputmode="numeric" value="${x.m}"></div></div>`}
      <span class="lbl">Días (ninguno = todos los días)</span><div class="catpick" id="pr_d">${[1,2,3,4,5,6,0].map(d => `<button type="button" class="chip" data-d="${d}" aria-pressed="${x.days.includes(d)}">${DOW[d]}</button>`).join("")}</div>
      <span class="lbl">Artículos (ninguno = todos)</span><div class="catpick" id="pr_s">${settings.services.map(sv => `<button type="button" class="chip" data-s="${esc(sv.key)}" aria-pressed="${x.services.includes(sv.key)}">${esc(sv.label)}</button>`).join("")}</div>
      <div class="field"><label for="pr_r">Requisito que recepción debe verificar (opcional)</label><input class="input" id="pr_r" maxlength="80" placeholder="Ej. Presentar cédula" value="${esc(x.req)}"></div>
      <label class="ck" style="margin-bottom:12px"><input type="checkbox" id="pr_a" ${x.active?"checked":""}> <span>Promoción activa</span></label>
      <div class="stack"><button class="btn block" id="pr_save">Guardar promoción</button>${old ? `<button class="btn danger block" id="pr_del">Borrar promoción</button>` : ""}<button class="btn ghost block" data-close>Cancelar</button></div>`);
    const sync = () => { x.name = $("#pr_n").value.trim(); x.req = $("#pr_r").value.trim(); x.active = $("#pr_a").checked;
      if($("#pr_p")) x.pct = Math.round(parseNum($("#pr_p").value)); if($("#pr_nn")){ x.n = Math.round(parseNum($("#pr_nn").value)); x.m = Math.round(parseNum($("#pr_mm").value)); } };
    $("#pr_t").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { sync(); x.type = b.dataset.t; draw(); });
    $("#pr_d").querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const d = +b.dataset.d; x.days = x.days.includes(d) ? x.days.filter(y => y!==d) : x.days.concat(d); b.setAttribute("aria-pressed", x.days.includes(d)); });
    $("#pr_s").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { const k = b.dataset.s; x.services = x.services.includes(k) ? x.services.filter(y => y!==k) : x.services.concat(k); b.setAttribute("aria-pressed", x.services.includes(k)); });
    $("#pr_save").onclick = async () => {
      sync();
      if(!x.name){ toast("Escribe el nombre de la promoción"); return; }
      if(x.type==="pct" && !(x.pct >= 1 && x.pct <= 100)){ toast("El porcentaje debe estar entre 1 y 100"); return; }
      if(x.type==="nxm" && !(x.n >= 2 && x.n <= 10 && x.m >= 1 && x.m < x.n)){ toast("Revisa los números: por ejemplo lleva 3, paga 2"); return; }
      const clean2 = normPromos([x])[0];
      settings.promos = old ? settings.promos.map(y => y.id===x.id ? clean2 : y) : (settings.promos||[]).concat(clean2);
      await saveSettings(); closeSheet(); render(); toast("Promoción guardada");
    };
    const dl = $("#pr_del"); if(dl) dl.onclick = async () => { if(!confirm(`¿Borrar la promoción "${old.name}"?`)) return; settings.promos = settings.promos.filter(y => y.id!==old.id); await saveSettings(); closeSheet(); render(); toast("Promoción borrada"); };
  };
  draw();
}
function roleSheet(u){
  const f = users().find(x=>x.u===u); if(!f || u===me.u) return;
  let role = f.role;
  openSheet(`<h2>Cambiar rol</h2><p class="muted" style="margin:0">${esc(f.name)} · ${f.email?esc(f.email):"@"+esc(f.u)}</p>
    <span class="lbl" style="margin-top:14px">Rol</span><div class="rolepick" id="ur_r">${ROLES_ACTIVE.map(k=>`<button type="button" data-r="${k}" aria-pressed="${k===role}"><b>${ROLE[k]}</b><small>${ROLE_DESC[k]}</small></button>`).join("")}</div>
    ${cloud && !f.email?`<p class="small muted" style="margin:8px 0 0">Seguirá entrando con su usuario <b>${esc(f.u)}</b> y la misma contraseña.</p>`:""}
    <div class="stack"><button class="btn block" id="ur_save">Guardar rol</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  $("#ur_r").querySelectorAll("[data-r]").forEach(b => b.onclick = () => { role = b.dataset.r; $("#ur_r").querySelectorAll("[data-r]").forEach(x=>x.setAttribute("aria-pressed", x===b)); });
  $("#ur_save").onclick = async () => {
    if(role===f.role){ closeSheet(); return; }
    if(f.role==="admin" && users().filter(x=>x.role==="admin").length<=1){ toast("Debe quedar al menos un administrador"); return; }

    if(role==="admin" && !confirm(`${f.name} podrá ver y cambiar todo: caja, precios, usuarios y respaldos. ¿Continuar?`)) return;
    const sb = $("#ur_save"); sb.disabled = true; sb.textContent = "Guardando…";
    if(cloud){
      try{ await fb.doc("users/"+f.uid).update({role}); }
      catch(err){ toast(fbErr(err)); sb.disabled = false; sb.textContent = "Guardar rol"; return; }
    } else {
      settings.users = users().map(x => x.u===u ? Object.assign({}, x, {role}) : x);
      await saveSettings();
    }
    closeSheet(); render(); toast(`${f.name} ahora es ${ROLE[role]}`);
  };
}
async function delUser(u){
  const f = users().find(x=>x.u===u); if(!f || u===me.u) return;
  if(f.role==="admin" && users().filter(x=>x.role==="admin").length<=1){ toast("Debe quedar al menos un administrador"); return; }
  if(!confirm(`¿${cloud?"Desactivar":"Quitar"} el usuario ${f.u} (${f.name})?`)) return;
  if(cloud){ try{ await fb.doc("users/"+f.uid).delete(); toast("Usuario desactivado"); }catch(err){ toast(fbErr(err)); } return; }
  settings.users = users().filter(x=>x.u!==u); await saveSettings(); render(); toast("Usuario quitado");
}


function render(){
  $("#bizName").textContent = settings.business;
  if(!ready || !me){ renderNotices(); renderGate(); return; }
  gateShown = null;
  if(!allowed(view)) view = HOME[me.role];
  if(view==="nuevo" && !draft) newDraft();
  renderNav(); renderUser();
  const v = $("#view");
  if(view==="pedidos") v.innerHTML = viewOrders();
  else if(view==="nuevo") v.innerHTML = viewNew();
  else if(view==="clientes") v.innerHTML = viewClients();
  else if(view==="analisis") v.innerHTML = viewAnalytics();
  else if(view==="ajustes") v.innerHTML = viewSettings();
  else if(view==="entregas") v.innerHTML = viewEntregas();
  else if(view==="cola") v.innerHTML = viewCola();
  else if(view==="tablero") v.innerHTML = viewTablero();
  else if(view==="gastos") v.innerHTML = viewGastos();
  else if(view==="insumos") v.innerHTML = viewInsumos();
  bind(); renderNotices();
}

/* ---------- Vista: Pedidos ---------- */
function viewOrders(){
  const t0 = new Date(); t0.setHours(0,0,0,0);
  const today = orders.filter(o=>o.createdAt>=t0.getTime());
  if(!["recibido","proceso","listo","entregado"].includes(filter)) filter = "recibido";
  const inBox = (o,k) => k==="proceso" ? PROC.includes(o.status) : o.status===k;
  const counts = {recibido:0, proceso:0, listo:0, entregado:0};
  orders.forEach(o=>{ if(PROC.includes(o.status)) counts.proceso++; else if(o.status in counts) counts[o.status]++; });
  const lateIn = k => orders.filter(o=>inBox(o,k) && isLate(o)).length;
  let list = orders.filter(o=>inBox(o,filter));
  if(filter==="entregado") list = list.slice().sort((a,b)=>(b.deliveredAt||0)-(a.deliveredAt||0)).slice(0,60);
  else list = list.slice().sort((a,b)=> (a.dueDate||"").localeCompare(b.dueDate||"") || a.createdAt-b.createdAt);
  if(q){ const s = q.toLowerCase(); list = list.filter(o => (o.name||"").toLowerCase().includes(s) || (o.num||"").toLowerCase().includes(s) || (o.phone||"").includes(s)); }
  const BOX = {recibido:"Recibido", proceso:"En producción", listo:"Pendiente de entrega", entregado:"Entregado"};
  const KEYS = ["recibido","proceso","listo","entregado"];
  const stage = (k,i) => `<button class="stage b-${k} ${counts[k]?"":"zero"}" data-filter="${k}" aria-pressed="${filter===k}" aria-label="Etapa ${i+1}: ${BOX[k]}, ${counts[k]} pedidos">
      <span class="sn">Etapa ${i+1}</span><b>${counts[k]}</b><span class="l">${BOX[k]}</span></button>`;
  const lateR = lateIn("recibido");
  const alert = counts.recibido ? `<button class="alertbar" data-filter="recibido">📥 <span><b>${counts.recibido} pedido${counts.recibido===1?"":"s"} por procesar</b>${lateR?` · ${lateR} atrasado${lateR===1?"":"s"}`:""}</span></button>`
    : `<div class="alertbar" style="border-left-color:var(--ready)">✨ <span>Nada por procesar. ¡Todo al día!</span></div>`;
  const heads = {recibido:"Por procesar · lo más urgente primero", proceso:"En proceso · por fecha de entrega", listo:"Pendientes de entrega", entregado:"Entregados recientes"};
  let h = `${mode==="local"?'<div class="notice">Los datos se guardan solo en este dispositivo. Descarga un respaldo desde Ajustes cada semana.</div>':""}
  <div class="dayline"><span>Hoy: <b>${money(today.reduce((s,o)=>s+(o.total||0),0))}</b> en ventas</span><span><b>${today.length}</b> pedido${today.length===1?"":"s"} nuevo${today.length===1?"":"s"}</span></div>
  <nav class="stages" role="group" aria-label="Etapas del pedido">${KEYS.map(stage).join("")}</nav>
  ${alert}
  <div class="listhead"><h2>${heads[filter]}</h2><span class="small muted">${list.length}</span></div>
  <input class="search" id="q" type="search" placeholder="Buscar por nombre, teléfono o N°" value="${esc(q)}">`;
  if(!list.length){
    const emptyMsg = {recibido:"No hay pedidos por procesar. ¡Todo al día!", proceso:"No hay pedidos en producción.", listo:"No hay pedidos esperando entrega.", entregado:"Aún no hay entregas."};
    h += orders.length ? `<div class="empty"><strong>${q?"Sin resultados":"Cajita vacía"}</strong>${q?"Prueba con otro nombre o número.":emptyMsg[filter]}</div>`
      : `<div class="empty"><strong>Aún no hay pedidos</strong>Toca el botón + para registrar el primer cliente.<br><br><button class="btn" data-go="nuevo">Registrar pedido</button></div>`;
  }
  list.forEach(o => h += ticketHTML(o));
  return h;
}
function ticketHTML(o){
  const st = ST[o.status];
  const late = isLate(o);
  const s = saldo(o);
  return `<article class="ticket s-${o.status} ${dueCls(o)}">
    <div class="body" data-open="${esc(o.id)}" role="button" tabindex="0" aria-label="Ver pedido ${esc(o.num)}">
      <div class="head"><span class="headl"><span class="num">N° ${esc(o.num)}</span>${flagHTML(o)}</span><span class="status">${st.ic} ${st.l}</span></div>
      <div class="name">${esc(o.name)}${o.loyaltyRedeemed?'<span class="loyal-tag">Fidelidad -'+esc(o.discountPct||0)+'%</span>':""}${o.promoName?'<span class="loyal-tag">'+esc(o.promoName)+'</span>':""}${o.manualDisc?'<span class="loyal-tag">-'+esc(o.manualPct)+'%</span>':""}</div>
      <div class="items">${esc(itemsText(o))}</div>
      <div class="meta">
        <span>${o.status==="entregado"?"Entregado "+fmtDate(o.deliveredAt||o.createdAt):'Entrega: <span class="'+(late?"late":"")+'">'+fmtDue(o.dueDate)+(late?" · atrasado":"")+"</span>"}</span>
        <span>Total <b>${money(o.total)}</b></span>${photoCount(o)?`<span class="muted">📷 ${esc(photoCount(o))}</span>`:""}
        ${s>0?`<span>Saldo <b>${money(s)}</b></span>`:`<span class="muted">Pagado</span>`}
      </div>
      ${progressHTML(o)}
    </div>
    ${o.status!=="entregado"?`<div class="actions">
      <button class="btn ${o.status==="listo"?"ok":""}" data-adv="${esc(o.id)}">${st.btn}</button>
      <a class="btn wa icon" href="${esc(waLink(o.phone, msgFor(o)))}" target="_blank" rel="noopener" data-wa="${esc(o.id)}" aria-label="WhatsApp a ${esc(o.name)}">${svgWA}</a>
    </div>`:""}
  </article>`;
}

function progressHTML(o){
  const idx = FLOW.indexOf(o.status);
  return `<div class="track-st" aria-label="Etapa ${idx+1} de ${FLOW.length}">${FLOW.map((k,i)=>`<span class="${i<=idx?"f":""}"></span>`).join("")}</div>
  <div class="track-lbl"><span>Recibido</span><span>Producción</span><span>Listo</span><span>Entregado</span></div>`;
}

/* ---------- Vista: Nuevo pedido ---------- */
function newDraft(){
  pendingPhotos.recepcion = {};
  draft = {name:"", phone:"", qty:{}, price:{}, due: todayStr(settings.deliveryDays), abonoMode:"total", abono:"", method:"Efectivo", notes:"", useReward:true, avisoOk:false, promoOk:false, promoId:"", promoUnits:"", promoReq:false, manualOn:false, manualPct:""};
  settings.services.forEach(s => { draft.qty[s.key]=0; draft.price[s.key]=fmt2(s.price); });
}
// Descuentos: promoción del día + descuento manual (máx. 15%) se pueden sumar.
// La tarjeta de fidelidad va sola: si se aplica, no se combina con promociones ni descuento manual.
const MANUAL_MAX = 15;
const DOW = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const promoById = id => (settings.promos||[]).find(x => x.id===id);
const promosToday = () => (settings.promos||[]).filter(x => x.active && (!x.days.length || x.days.includes(new Date().getDay())));
function promoDesc(x){
  const svc = x.services.length ? x.services.map(k => (settings.services.find(sv => sv.key===k)||{label:k}).label).join(", ") : "todos los artículos";
  return `${x.type==="pct" ? x.pct + "% de descuento" : x.n + "x" + x.m + " (lleva " + x.n + ", paga " + x.m + ")"} · ${x.days.length ? x.days.map(d => DOW[d]).join(", ") : "todos los días"} · ${svc}${x.req ? " · requisito: " + x.req : ""}`;
}
// Pares que califican: los más económicos primero (a favor del negocio cuando no aplican todos)
function promoCalc(x, items, unitsTxt){
  if(!x) return {disc:0, eligible:0, used:0};
  const prices = [];
  items.forEach(i => { if(!x.services.length || x.services.includes(i.key)) for(let k = 0; k < i.qty; k++) prices.push(i.price); });
  prices.sort((a,b) => a-b);
  const eligible = prices.length;
  const used = String(unitsTxt||"").trim()==="" ? eligible : Math.max(0, Math.min(eligible, Math.round(parseNum(unitsTxt))));
  const sel = prices.slice(0, used);
  let disc = 0;
  if(x.type==="pct") disc = sel.reduce((t,v) => t+v, 0) * x.pct/100;
  else disc = sel.slice(0, Math.floor(used / x.n) * (x.n - x.m)).reduce((t,v) => t+v, 0);
  return {disc: r2(disc), eligible, used};
}
function calc(){
  const items = settings.services.filter(s=>draft.qty[s.key]>0).map(s=>({key:s.key,label:s.label,qty:draft.qty[s.key],price:r2(parseNum(draft.price[s.key]))}));
  const subtotal = r2(items.reduce((t,i)=>t+i.qty*i.price,0));
  const l = loyalty(draft.phone);
  const apply = l.eligible && draft.useReward && !draft.promoId && !draft.manualOn;
  const promo = !apply && draft.promoId ? promoById(draft.promoId) : null;
  const pc = promoCalc(promo, items, draft.promoUnits);
  const manualPct = !apply && draft.manualOn ? Math.min(MANUAL_MAX, Math.max(0, r2(parseNum(draft.manualPct)))) : 0;
  const manualDisc = r2((subtotal - pc.disc) * manualPct/100);
  const loyalDisc = apply ? r2(subtotal*settings.loyaltyPct/100) : 0;
  const discount = r2(pc.disc + manualDisc + loyalDisc);
  const total = r2(subtotal-discount);
  const abono = draft.abonoMode==="total" ? total : draft.abonoMode==="nada" ? 0 : r2(Math.min(total, Math.max(0, parseNum(draft.abono))));
  return {items, subtotal, discount, total, abono, saldo: Math.max(0, r2(total-abono)), l, apply, promo, pc, manualPct, manualDisc, loyalDisc};
}
function discHTML(c){
  const today = promosToday(), x = c.promo;
  return `<div class="field" style="margin-bottom:10px"><label for="d_promo">Promoción de hoy (${DOW[new Date().getDay()]})</label>
    <select class="input" id="d_promo" ${c.apply ? "disabled" : ""}><option value="">${today.length ? "Sin promoción" : "No hay promociones para hoy"}</option>${today.map(p => `<option value="${esc(p.id)}" ${draft.promoId===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
    ${x ? `<p class="small muted" style="margin:-4px 0 8px">${esc(promoDesc(x))}</p>
      <div class="two"><div class="field"><label for="d_units">Pares que aplican</label><input class="input" id="d_units" inputmode="numeric" placeholder="${c.pc.eligible}" value="${esc(draft.promoUnits)}"></div>
      <div class="field"><span class="lbl">Ahorro</span><b id="d_save" style="display:block;padding:12px 0;font-size:1.1rem;color:var(--ready)">−${money(c.pc.disc)}</b></div></div>
      ${x.req ? `<label class="ck" style="margin-bottom:10px"><input type="checkbox" id="d_req" ${draft.promoReq?"checked":""}> <span>Verifiqué el requisito: <b>${esc(x.req)}</b></span></label>` : ""}` : ""}
    <label class="ck"><input type="checkbox" id="d_mon" ${draft.manualOn?"checked":""} ${c.apply ? "disabled" : ""}> <span><b>Aplicar descuento manual</b> (máximo ${MANUAL_MAX}%)</span></label>
    ${draft.manualOn ? `<div class="field" style="margin-top:8px"><label for="d_mpct">Porcentaje de descuento</label><input class="input" id="d_mpct" inputmode="decimal" placeholder="Ej. 10" value="${esc(draft.manualPct)}"></div>` : ""}
    ${c.apply ? `<p class="small muted" style="margin:8px 0 0">Se está aplicando la tarjeta de fidelidad: no se combina con promociones ni descuento manual.</p>` : ""}`;
}
function bindDisc(){
  const sel = $("#d_promo"); if(!sel) return;
  const redo = () => { const box = $("#disc"); if(box){ box.innerHTML = discHTML(calc()); bindDisc(); } refreshNew(); };
  sel.onchange = e => { draft.promoId = e.target.value; draft.promoUnits = ""; draft.promoReq = false; if(draft.promoId) draft.useReward = false; redo(); };
  const u = $("#d_units"); if(u) u.oninput = e => { draft.promoUnits = e.target.value; refreshNew(); const sv = $("#d_save"); if(sv) sv.textContent = "−" + money(calc().pc.disc); };
  const rq = $("#d_req"); if(rq) rq.onchange = e => { draft.promoReq = e.target.checked; };
  const mo = $("#d_mon"); if(mo) mo.onchange = e => { draft.manualOn = e.target.checked; if(draft.manualOn) draft.useReward = false; redo(); if(draft.manualOn && $("#d_mpct")) $("#d_mpct").focus(); };
  const mp = $("#d_mpct"); if(mp) mp.oninput = e => { draft.manualPct = e.target.value; if(parseNum(e.target.value) > MANUAL_MAX) toast(`El descuento manual es de máximo ${MANUAL_MAX}%`); refreshNew(); };
}
function viewNew(){
  const c = calc();
  let svc = "";
  settings.services.forEach(s => {
    svc += `<div class="svc ${draft.qty[s.key]>0?"on":""}">
      <div class="nm">${esc(s.label)}</div>
      <div class="step"><button type="button" data-dec="${s.key}" aria-label="Quitar ${esc(s.label)}">−</button><span id="q_${s.key}">${draft.qty[s.key]}</span><button type="button" data-inc="${s.key}" aria-label="Agregar ${esc(s.label)}">+</button></div>
      <input class="price" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-price="${s.key}" value="${esc(draft.price[s.key])}" aria-label="Precio ${esc(s.label)}">
    </div>`;
  });
  return `${me && me.role==="recepcion"?consultBtn():""}<h2 style="font-size:1.4rem;margin-bottom:4px">Nuevo pedido</h2>
  <p class="muted small" style="margin:0 0 16px">Próximo N° <span class="num">${esc(nextNumPreview())}</span></p>
  <div class="field"><label for="f_phone">Teléfono (WhatsApp)</label><input class="input" id="f_phone" type="tel" inputmode="tel" autocomplete="off" placeholder="099 123 4567" value="${esc(draft.phone)}"></div>
  <div id="suggest"></div>
  <div class="field"><label for="f_name">Nombre del cliente</label><input class="input" id="f_name" autocomplete="off" placeholder="Nombre y apellido" value="${esc(draft.name)}"></div>
  <div id="reward">${rewardHTML(c)}</div>
  <div class="lbl">Artículos</div>
  <div class="panel">${svc}</div>
  <div class="two">
    <div class="field"><label for="f_due">Fecha de entrega</label><input class="input" id="f_due" type="date" value="${esc(draft.due)}"></div>
    <div class="field"><label for="f_method">Medio de pago</label><select class="input" id="f_method"><option ${draft.method==="Efectivo"?"selected":""}>Efectivo</option><option ${draft.method==="Transferencia"?"selected":""}>Transferencia</option></select></div>
  </div>
  <div class="lbl">Descuentos</div>
  <div class="panel pad" id="disc" style="margin-bottom:14px">${discHTML(c)}</div>
  <div class="field"><span class="lbl">Pago ahora</span>
    <div class="seg" role="group"><button type="button" data-ab="total" aria-pressed="${draft.abonoMode==="total"}">Pagado</button><button type="button" data-ab="abono" aria-pressed="${draft.abonoMode==="abono"}">Abono</button><button type="button" data-ab="nada" aria-pressed="${draft.abonoMode==="nada"}">Paga al retirar</button></div>
  </div>
  ${draft.abonoMode==="abono"?`<div class="field"><label for="f_abono">Monto del abono</label><input class="input" id="f_abono" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0,00" value="${esc(draft.abono)}"></div>`:""}
  ${pickerHTML("recepcion", photoUnits(c.items))}
  <div class="field"><label for="f_notes">Notas (opcional)</label><input class="input" id="f_notes" placeholder="Ej. mancha en la punta, cordones aparte" value="${esc(draft.notes)}"></div>
  <div class="panel pad consent">
    <label class="ck"><input type="checkbox" id="f_aviso" ${draft.avisoOk?"checked":""}> <span><b>Informé al cliente</b> que sus datos (nombre, celular y fotos) se usan solo para este servicio. <a href="privacidad.html" target="_blank" rel="noopener">Aviso de privacidad</a></span></label>
    <label class="ck"><input type="checkbox" id="f_promo" ${draft.promoOk?"checked":""}> <span>El cliente <b>acepta recibir promociones</b> por WhatsApp (opcional)</span></label>
  </div>
  <div class="panel pad" id="totals">${totalsHTML(c)}</div>
  <button class="btn block" id="save" style="min-height:54px;font-size:1.05rem">Registrar pedido</button>`;
}
function totalsHTML(c){
  return `<div class="totals">
    <div><span>Subtotal</span><span>${money(c.subtotal)}</span></div>
    ${c.pc && c.pc.disc?`<div style="color:var(--ready)"><span>Promoción: ${esc(c.promo.name)}</span><span>−${money(c.pc.disc)}</span></div>`:""}
    ${c.manualDisc?`<div style="color:var(--ready)"><span>Descuento manual ${String(c.manualPct).replace(".",",")}%</span><span>−${money(c.manualDisc)}</span></div>`:""}
    ${c.loyalDisc?`<div style="color:var(--ready)"><span>Descuento fidelidad ${settings.loyaltyPct}%</span><span>−${money(c.loyalDisc)}</span></div>`:""}
    <div class="big"><span>Total</span><span>${money(c.total)}</span></div>
    <div><span>Abono</span><span>${money(c.abono)}</span></div>
    <div><span><b>Saldo</b></span><span><b>${money(c.saldo)}</b></span></div>
  </div>`;
}
function rewardHTML(c){
  if(!phoneKey(draft.phone) || digits(draft.phone).length<7) return "";
  const l = c.l;
  if(l.eligible) return `<div class="reward"><h3>🎁 Visita con premio</h3>Este cliente tiene ${l.visits} visitas en los últimos ${settings.loyaltyMonths} meses. Le toca ${settings.loyaltyPct}% de descuento.
    <label><input type="checkbox" id="f_reward" ${draft.useReward?"checked":""}> Aplicar descuento</label></div>`;
  return `<div class="panel pad"><div class="small"><b>Tarjeta de fidelidad:</b> ${l.visits} de ${settings.loyaltyVisits} visitas. ${!orders.some(o=>o.phoneKey===phoneKey(draft.phone))?"Cliente nuevo.":`Le faltan ${l.need} (contando esta visita: ${l.visits+1}).`}</div>${punchHTML(l.visits)}</div>`;
}
function refreshNew(){
  const c = calc();
  $("#totals").innerHTML = totalsHTML(c);
  $("#reward").innerHTML = rewardHTML(c);
  const r = $("#f_reward"); if(r) r.onchange = e => { draft.useReward = e.target.checked; if(draft.useReward){ draft.promoId = ""; draft.manualOn = false; } const box = $("#disc"); if(box){ box.innerHTML = discHTML(calc()); bindDisc(); } refreshNew(); };
  const sv = $("#d_save"); if(sv) sv.textContent = "−" + money(c.pc.disc);
  // Si cambian los artículos, cambian los espacios para fotos (una por par)
  const units = photoUnits(c.items), pp = $("#pp_recepcion");
  if(pp && pp.dataset.sig !== units.map(u => u.slot).join(",")){
    Object.keys(pendingPhotos.recepcion).forEach(k => { if(!units.some(u => u.slot===k)) delete pendingPhotos.recepcion[k]; });
    pp.outerHTML = pickerHTML("recepcion", units); bindPicker("recepcion", units);
  }
}
function showSuggest(){
  const box = $("#suggest"); if(!box) return;
  const s = digits(draft.phone); const n = (draft.name||"").toLowerCase();
  if(s.length<3 && n.length<2){ box.innerHTML=""; return; }
  const list = clients().filter(c => (s.length>=3 && c.key.includes(s)) || (n.length>=2 && (c.name||"").toLowerCase().includes(n))).filter(c=>c.key!==phoneKey(draft.phone)).slice(0,4);
  box.innerHTML = list.length ? `<div class="suggest">${list.map(c=>`<button type="button" data-pick="${esc(c.key)}"><b>${esc(c.name)}</b> <span class="muted small">${esc(c.phone)} · ${c.visits} visitas</span></button>`).join("")}</div>` : "";
  box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
    const c = clients().find(x=>x.key===b.dataset.pick); if(!c) return;
    draft.phone = c.phone; draft.name = c.name; $("#f_phone").value = c.phone; $("#f_name").value = c.name; box.innerHTML=""; refreshNew();
  });
}
let saving = false;
const busy = new Set();
async function submitNew(){
  if(saving) return;
  const c = calc();
  if(!draft.name.trim()){ toast("Escribe el nombre del cliente"); $("#f_name").focus(); return; }
  if(digits(draft.phone).length<7){ toast("Escribe un teléfono válido"); $("#f_phone").focus(); return; }
  if(!c.items.length){ toast("Agrega al menos un artículo"); return; }
  if(c.total<=0){ toast("Revisa los precios: el total es $0.00"); return; }
  if(!draft.avisoOk){ toast("Marca que informaste al cliente sobre el uso de sus datos"); $("#f_aviso").focus(); return; }
  if(c.promo && c.promo.req && !draft.promoReq){ toast("Confirma el requisito de la promoción: " + c.promo.req); const rq = $("#d_req"); if(rq) rq.focus(); return; }
  if(c.promo && !c.pc.disc){ toast("La promoción no aplica a estos artículos. Revisa los pares que aplican o quítala."); return; }
  if(draft.manualOn && !(c.manualPct > 0)){ toast(`Escribe el porcentaje de descuento (1 a ${MANUAL_MAX}%)`); const mp = $("#d_mpct"); if(mp) mp.focus(); return; }
  if(draft.manualOn && parseNum(draft.manualPct) > MANUAL_MAX){ toast(`El descuento manual es de máximo ${MANUAL_MAX}%`); return; }
  if(draft.abonoMode==="abono" && parseNum(draft.abono) > c.total){ toast("El abono no puede ser mayor que el total"); $("#f_abono").focus(); return; }
  const units = photoUnits(c.items);
  const phs = units.filter(u => pendingPhotos.recepcion[u.slot]).map(u => Object.assign({slot:u.slot, label:u.label}, pendingPhotos.recepcion[u.slot]));
  const miss = units.length - phs.length;
  if(miss && !confirm(`Falta${miss===1?"":"n"} ${miss} foto${miss===1?"":"s"} de recepción (una por par o artículo). Las fotos protegen al negocio ante reclamos.\n\n¿Registrar el pedido igual?`)) return;
  const o = {id:uid(), num:"", name:draft.name.trim(), phone:draft.phone.trim(), phoneKey:phoneKey(draft.phone),
    items:c.items, subtotal:c.subtotal, discount:c.discount, discountPct:c.apply?settings.loyaltyPct:0, total:c.total,
    ...(c.pc.disc ? {promoName:c.promo.name, promoDisc:c.pc.disc} : {}), ...(c.manualDisc ? {manualPct:c.manualPct, manualDisc:c.manualDisc} : {}),
    abono:c.abono, paidFull:c.saldo<=0, method:draft.method, notes:draft.notes.trim(),
    status:"recibido", createdAt:Date.now(), dueDate:draft.due, loyaltyRedeemed:c.apply, createdBy:me?me.u:"", photos:{recepcion:phs.length, entrega:0}, avisoOk:true, promoOk:!!draft.promoOk};
  saving = true; const sb = $("#save"); if(sb){ sb.disabled = true; sb.textContent = "Guardando…"; }
  try{ o.num = await takeNumber(); await putOrder(o); if(!cloud) await saveSettings(); }
  catch(err){ saving = false; if(sb){ sb.disabled = false; sb.textContent = "Registrar pedido"; } toast("No se pudo registrar. Revisa tu conexión."); return; }
  try{ for(const p of phs) await savePhoto({orderId:o.id, num:o.num, stage:"recepcion", data:p.data, at:Date.now(), by:me?me.u:"", slot:p.slot, label:p.label}, p.thumb); }
  catch(err){ toast("El pedido se guardó, pero no las fotos"); }
  finally { saving = false; }
  draft = null; view = HOME[me.role]==="nuevo" ? "nuevo" : "pedidos"; filter = "recibido"; render();
  openSheet(`<h2>Pedido registrado</h2>
    <p><span class="num">N° ${esc(o.num)}</span> · ${esc(o.name)} · ${money(o.total)}</p>
    ${o.loyaltyRedeemed?`<p style="color:var(--ready);font-weight:600">Se aplicó el descuento de fidelidad. La tarjeta del cliente empieza de nuevo.</p>`:`<p class="muted small">Visita ${loyalty(o.phone,o.id).visits+1} de ${settings.loyaltyVisits} en su tarjeta de fidelidad.</p>`}
    <div class="stack">
      <a class="btn wa block" href="${esc(waLink(o.phone,msgReceipt(o)))}" target="_blank" rel="noopener" data-close>${svgWA} Enviar comprobante por WhatsApp</a>
      <button class="btn ghost block" data-close>Listo</button>
    </div>`);
}

/* ---------- Avanzar estado ---------- */
async function advance(id){
  if(busy.has(id)) return;
  busy.add(id);
  try{ await advanceNow(id); } finally { setTimeout(()=>busy.delete(id), 350); }
}
async function advanceNow(id){
  const o = orders.find(x=>x.id===id); if(!o) return;
  const next = ST[o.status] && ST[o.status].next;
  if(next && next!=="listo" && next!=="entregado"){
    await patchOrder(id,{status:next,[next+"At"]:Date.now(),[next+"By"]:me?me.u:""}); render();
    const fresh = orders.find(x=>x.id===id);
    if(isOps()){ toast(`${fresh.num} → ${ST[next].ic} ${ST[next].l}`); return; }
    snack(`${esc(fresh.num)} → ${ST[next].ic} ${ST[next].l}`, waLink(fresh.phone,msgStatus(fresh)), id);
  }
  else if(next==="listo"){
    await patchOrder(id,{status:"listo",readyAt:Date.now(),listoBy:me?me.u:""}); render();
    if(isOps()){ toast(`${o.num} listo. Recepción avisará al cliente.`); return; }
    openSheet(`<h2>¡Listo para entregar!</h2><p>Avisa a <b>${esc(o.name)}</b> que puede retirar su pedido <span class="num">N° ${esc(o.num)}</span>.</p>
      <div class="stack"><a class="btn wa block" href="${esc(waLink(o.phone,msgReady(o)))}" target="_blank" rel="noopener" data-notify="${esc(o.id)}">${svgWA} Avisar por WhatsApp</a>
      <button class="btn ghost block" data-close>Más tarde</button></div>`);
  }
  else if(o.status==="listo" && !isOps()) deliverSheet(o);
}
function deliverSheet(o){
  const s = saldo(o), units = photoUnits(o.items), refs = {};
  pendingPhotos.entrega = {};
  openSheet(`<h2>Confirmar entrega</h2>
    <p><span class="num">N° ${esc(o.num)}</span> · ${esc(o.name)}<br><span class="muted">${esc(itemsText(o))}</span></p>
    ${s>0?`<div class="panel pad"><div class="totals"><div class="big"><span>Cobrar saldo</span><span>${money(s)}</span></div></div>
    <div class="field" style="margin-top:12px"><span class="lbl">Medio de pago</span><div class="seg" role="group" id="dm"><button type="button" aria-pressed="true">Efectivo</button><button type="button" aria-pressed="false">Transferencia</button></div></div></div>`:`<p class="muted">El pedido ya está pagado.</p>`}
    ${pickerHTML("entrega", units, refs)}
    <p class="small muted" style="margin:-6px 0 10px">La miniatura pequeña muestra cómo llegó cada par, para comparar.</p>
    <div class="stack"><button class="btn ok block" id="doDeliver">${s>0?"Cobrar "+money(s)+" y entregar":"Confirmar entrega"}</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  const dm = $("#dm");
  bindPicker("entrega", units, refs);
  if(photoCount(o)) loadThumbs(o.id).then(list => {
    list.filter(p => p.stage==="recepcion" && p.slot).forEach(p => { refs[p.slot] = p; });
    const r = $("#pp_entrega"); if(r){ r.outerHTML = pickerHTML("entrega", units, refs); bindPicker("entrega", units, refs); }
  }).catch(() => {});
  if(dm) dm.querySelectorAll("button").forEach(b=>b.onclick=()=>dm.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x===b)));
  $("#doDeliver").onclick = async (ev) => {
    const btn = ev.currentTarget; if(btn.disabled) return;
    const phs = units.filter(u => pendingPhotos.entrega[u.slot]).map(u => Object.assign({slot:u.slot, label:u.label}, pendingPhotos.entrega[u.slot]));
    const miss = units.length - phs.length;
    if(miss && !confirm(`Falta${miss===1?"":"n"} ${miss} foto${miss===1?"":"s"} de entrega (una por par o artículo).\n\n¿Entregar igual?`)) return;
    btn.disabled = true;
    const m = dm ? dm.querySelector('[aria-pressed="true"]').textContent : null;
    const patch = {status:"entregado", deliveredAt:Date.now(), paidFull:true, deliveredBy:me?me.u:"", cobradoEntrega:s};
    if(m) patch.methodFinal = m;
    if(phs.length) patch.photos = Object.assign({recepcion:0}, o.photos||{}, {entrega:Math.min(PHOTO_MAX, ((o.photos||{}).entrega||0)+phs.length)});
    try{ for(const p of phs) await savePhoto({orderId:o.id, num:o.num, stage:"entrega", data:p.data, at:Date.now(), by:me?me.u:"", slot:p.slot, label:p.label}, p.thumb); }catch(err){ toast("No se pudieron guardar las fotos"); }
    await patchOrder(o.id, patch); pendingPhotos.entrega = {}; render();
    const fresh = orders.find(x=>x.id===o.id);
    openSheet(`<h2>Entregado ✓</h2><p>Envía un agradecimiento con el avance de su tarjeta de fidelidad. Así vuelve más pronto.</p>
      <div class="stack"><a class="btn wa block" href="${esc(waLink(fresh.phone,msgThanks(fresh)))}" target="_blank" rel="noopener" data-close>${svgWA} Enviar agradecimiento</a><button class="btn ghost block" data-close>Cerrar</button></div>`);
  };
}
function orderSheet(id){
  const o = orders.find(x=>x.id===id); if(!o) return;
  if(isOps()){ opsSheet(o); return; }
  const l = loyalty(o.phone);
  const lines = (o.items||[]).map(i=>`<div><span>${esc(i.qty)} × ${esc(i.label)}</span><span>${money(i.qty*i.price)}</span></div>`).join("");
  openSheet(`<div class="row" style="justify-content:space-between"><span class="num">N° ${esc(o.num)}</span><span class="small muted">${fmtDate(o.createdAt,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span></div>
    <h2 style="margin-top:10px">${esc(o.name)}</h2><p class="muted" style="margin:0">${esc(o.phone)}</p>
    <div class="panel pad" style="margin-top:14px"><div class="totals">${lines}
      ${o.promoDisc?`<div style="color:var(--ready)"><span>Promoción: ${esc(o.promoName)}</span><span>−${money(o.promoDisc)}</span></div>`:""}
      ${o.manualDisc?`<div style="color:var(--ready)"><span>Descuento manual ${esc(o.manualPct)}%</span><span>−${money(o.manualDisc)}</span></div>`:""}
      ${o.loyaltyRedeemed && o.discount?`<div style="color:var(--ready)"><span>Descuento fidelidad</span><span>−${money(o.discount)}</span></div>`:""}
      <div class="big"><span>Total</span><span>${money(o.total)}</span></div>
      <div><span>Saldo</span><span>${money(saldo(o))}</span></div></div></div>
    ${o.notes?`<p><b>Notas:</b> ${esc(o.notes)}</p>`:""}
    <p class="small">Entrega: ${fmtDue(o.dueDate)} · Pago: ${esc(o.method||"—")}</p>
    <div class="small"><b>Fidelidad:</b> ${l.visits}/${settings.loyaltyVisits} visitas</div>${punchHTML(l.visits)}
    <span class="lbl" style="margin-top:16px">Fotos · una por par o artículo (toca para ampliar)</span>
    <div id="phbox" class="small muted">${photoCount(o)?"Cargando fotos…":"Sin fotos."}</div>
    <span class="lbl" style="margin-top:16px">Estado</span>
    ${o.status==="entregado" && !isAdmin() ? `<p class="small muted" style="margin:0">Entregado. Solo el administrador puede deshacer una entrega.</p>` : `<div class="stwrap" role="group" id="stSeg">${FLOW.map(k=>`<button type="button" data-st="${k}" aria-pressed="${o.status===k}">${ST[k].ic} ${ST[k].l.replace(" para entregar","")}</button>`).join("")}</div>`}
    <div class="stack">
      <a class="btn wa block" href="${esc(waLink(o.phone,msgFor(o)))}" target="_blank" rel="noopener">${svgWA} ${o.status==="listo"?"Avisar que está listo":PROC.includes(o.status)?"Enviar estado al cliente":"Enviar comprobante"}</a>
      ${isAdmin()?`<button class="btn danger block" id="del">Eliminar pedido</button>`:""}
      <button class="btn ghost block" data-close>Cerrar</button>
    </div>`);
  renderPhotoPanel(o);
  if($("#stSeg")) $("#stSeg").querySelectorAll("[data-st]").forEach(b => b.onclick = async () => {
    if(busy.has(o.id)) return; busy.add(o.id); setTimeout(()=>busy.delete(o.id), 350);
    const k = b.dataset.st; const patch = {status:k};
    if(PROC.includes(k)){ patch[k+"At"] = Date.now(); patch[k+"By"] = me?me.u:""; }
    if(k==="entregado" && !o.deliveredAt){ patch.deliveredAt = Date.now(); patch.paidFull = true; }
    if(k==="listo" && !o.readyAt) patch.readyAt = Date.now();
    if(k!=="entregado" && o.status==="entregado"){ patch.deliveredAt = null; }
    await patchOrder(o.id, patch); closeSheet(); render();
    const fresh = orders.find(x=>x.id===o.id);
    if(k==="entregado") toast("Pedido entregado"); else snack(`${esc(fresh.num)} → ${ST[k].ic} ${ST[k].l}`, waLink(fresh.phone,msgFor(fresh)), o.id);
  });
  if($("#del")) $("#del").onclick = async () => {
    if(!confirm("¿Eliminar el pedido "+o.num+"? Esta acción no se puede deshacer.")) return;
    await removeOrder(o.id); closeSheet(); render(); toast("Pedido eliminado");
  };
}

/* ---------- Vista: Clientes ---------- */
function viewClients(){
  let list = clients();
  const now = Date.now();
  list.forEach(c => { c.l = loyalty(c.phone); c.days = Math.floor((now-c.last)/DAY); });
  const counts = {todos:list.length, premio:list.filter(c=>c.l.eligible).length, frecuentes:list.filter(c=>c.l.visits>=3).length, inactivos:list.filter(c=>c.days>=settings.inactiveDays).length};
  if(clientFilter==="premio") list = list.filter(c=>c.l.eligible);
  if(clientFilter==="frecuentes") list = list.filter(c=>c.l.visits>=3);
  if(clientFilter==="inactivos") list = list.filter(c=>c.days>=settings.inactiveDays);
  if(clientQ){ const s = clientQ.toLowerCase(); list = list.filter(c=>(c.name||"").toLowerCase().includes(s) || c.key.includes(digits(s)||"§")); }
  list.sort((a,b)=> clientFilter==="inactivos" ? b.spent-a.spent : b.l.visits-a.l.visits || b.last-a.last);
  const chip = (k,l) => `<button class="chip" data-cf="${k}" aria-pressed="${clientFilter===k}">${l} <span class="n">${counts[k]}</span></button>`;
  let h = `<div class="chips" role="group" aria-label="Filtrar clientes">${chip("todos","Todos")}${chip("premio","Con premio")}${chip("frecuentes","Frecuentes")}${chip("inactivos","Inactivos")}</div>
  <input class="search" id="cq" type="search" placeholder="Buscar cliente" value="${esc(clientQ)}">`;
  if(clientFilter==="inactivos" && list.length) h += `<p class="small muted" style="margin-top:0">Clientes sin visitas en ${settings.inactiveDays} días o más. Escríbeles para que vuelvan.</p>`;
  if(!list.length) h += `<div class="empty"><strong>Sin clientes en esta lista</strong>Los clientes aparecen al registrar pedidos.</div>`;
  list.forEach(c => {
    h += `<div class="client"><div class="row"><div data-client="${esc(c.key)}" role="button" tabindex="0" style="flex:1"><b>${esc(c.name)}</b>${c.l.eligible?'<span class="loyal-tag">Premio listo</span>':""}
      <div class="small muted">${esc(c.phone)} · ${c.visits} visita${c.visits===1?"":"s"} · ${money(c.spent)} · última hace ${c.days} día${c.days===1?"":"s"}</div>${punchHTML(c.l.visits)}</div>
      ${c.promoOk?`<a class="btn wa" style="padding:0;width:46px" href="${esc(waLink(c.phone,msgMiss(c)))}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(c.name)}">${svgWA}</a>`:`<span class="small muted" style="max-width:84px;text-align:right">Sin permiso de promociones</span>`}</div></div>`;
  });
  return h;
}
function clientSheet(key){
  const c = clients().find(x=>x.key===key); if(!c) return;
  const l = loyalty(c.phone);
  const hist = c.orders.slice().sort((a,b)=>b.createdAt-a.createdAt).map(o=>`<div class="hist"><span><span class="num">${esc(o.num)}</span> ${fmtDate(o.createdAt,{day:"numeric",month:"short",year:"2-digit"})}<br><span class="muted small">${esc(itemsText(o))}</span></span><b>${money(o.total)}</b></div>`).join("");
  openSheet(`<h2>${esc(c.name)}</h2><p class="muted" style="margin:0">${esc(c.phone)} · cliente desde ${fmtDate(c.first,{month:"short",year:"numeric"})}</p>
    <div class="kpis" style="margin-top:14px"><div class="kpi"><span>Visitas</span><b>${c.visits}</b></div><div class="kpi"><span>Gastado</span><b>${money(c.spent)}</b></div><div class="kpi"><span>Ticket prom.</span><b>${money(c.spent/c.visits)}</b></div></div>
    <div class="panel pad"><b>Tarjeta de fidelidad</b><div class="small muted">${l.visits}/${settings.loyaltyVisits} visitas en ${settings.loyaltyMonths} meses${l.eligible?" — ¡próxima visita con "+settings.loyaltyPct+"% de descuento!":""}</div>${punchHTML(l.visits)}</div>
    <div class="stack" style="margin-top:0"><button class="btn block" id="cNew">Nuevo pedido para ${esc(c.name.split(" ")[0])}</button>
    ${c.promoOk?`<a class="btn wa block" href="${esc(waLink(c.phone,msgMiss(c)))}" target="_blank" rel="noopener">${svgWA} Escribir por WhatsApp</a>`:`<p class="small muted" style="margin:0">Este cliente no aceptó promociones. Solo se le escribe por sus pedidos.</p>`}</div>
    <h3 class="sec">Historial</h3>${hist}
    <div class="stack">${isAdmin()?`<button class="btn danger block" id="cErase">Borrar datos personales del cliente</button>`:""}<button class="btn ghost block" data-close>Cerrar</button></div>`);
  $("#cNew").onclick = () => { closeSheet(); newDraft(); draft.phone=c.phone; draft.name=c.name; view="nuevo"; render(); };
  if($("#cErase")) $("#cErase").onclick = () => eraseClient(c);
}

// Derecho de eliminación (LOPDP): se borran nombre, celular, notas y fotos del cliente.
// Los montos quedan (sin datos personales) para la contabilidad del negocio.
async function eraseClient(c){
  if(!isAdmin()) return;
  if(!confirm(`¿Borrar los datos personales de ${c.name}? Se quitan nombre, celular, notas y fotos de sus ${c.orders.length} pedidos. Los montos se conservan sin datos personales. No se puede deshacer.`)) return;
  let n = 0;
  for(const o of c.orders){
    try{ await deletePhotos(o.id); await patchOrder(o.id, {name:"Cliente eliminado", phone:"", phoneKey:"", notes:"", promoOk:false, photos:{recepcion:0, entrega:0}, erasedAt:Date.now()}); n++; }catch(e){}
  }
  closeSheet(); render(); toast(`Datos borrados de ${n} pedido${n===1?"":"s"}`);
}

/* ---------- Vista: Análisis ---------- */
function viewAnalytics(){
  const now = Date.now();
  const start = period ? now - period*DAY : 0;
  const P = orders.filter(o=>o.createdAt>=start);
  const prevP = period ? orders.filter(o=>o.createdAt>=start-period*DAY && o.createdAt<start) : [];
  const per = `<div class="seg" role="group" style="margin-bottom:16px">${[[7,"7 días"],[30,"30 días"],[90,"90 días"],[0,"Todo"]].map(([v,l])=>`<button type="button" data-per="${v}" aria-pressed="${period===v}">${l}</button>`).join("")}</div>`;
  if(!P.length) return reportBtns(true) + per + `<div class="empty"><strong>Sin datos en este periodo</strong>El análisis aparece cuando registras pedidos.</div>`;

  const sales = P.reduce((s,o)=>s+(o.total||0),0);
  const prevSales = prevP.reduce((s,o)=>s+(o.total||0),0);
  const avg = sales/P.length;
  const prevAvg = prevP.length ? prevSales/prevP.length : 0;
  const keysP = new Set(P.map(o=>o.phoneKey));
  const firstSeen = {}; orders.forEach(o=>{ if(!(o.phoneKey in firstSeen) || o.createdAt<firstSeen[o.phoneKey]) firstSeen[o.phoneKey]=o.createdAt; });
  const newC = [...keysP].filter(k=>firstSeen[k]>=start).length;
  const returning = keysP.size - newC;
  const retRate = keysP.size ? returning/keysP.size*100 : 0;
  const pending = orders.reduce((s,o)=>s+saldo(o),0);
  const discounts = P.reduce((s,o)=>s+(o.discount||0),0);
  const delivered = P.filter(o=>o.readyAt);
  const avgHours = delivered.length ? delivered.reduce((s,o)=>s+(o.readyAt-o.createdAt),0)/delivered.length/36e5 : 0;

  const prod = {};
  P.forEach(o=>(o.items||[]).forEach(i=>{ const p = prod[i.label] || (prod[i.label]={qty:0,rev:0}); p.qty+=i.qty; p.rev+=i.qty*i.price; }));
  const prodArr = Object.entries(prod).sort((a,b)=>b[1].rev-a[1].rev);
  const star = prodArr.slice().sort((a,b)=>b[1].qty-a[1].qty)[0];

  const wd = Array(7).fill(0).map(()=>({n:0,s:0}));
  const hr = {}; for(let h=7;h<=20;h++) hr[h]=0;
  P.forEach(o=>{ const d = new Date(o.createdAt); wd[d.getDay()].n++; wd[d.getDay()].s+=o.total||0; const h=d.getHours(); hr[h]=(hr[h]||0)+1; });
  const bestDay = WD_ORDER.reduce((b,i)=>wd[i].s>wd[b].s?i:b, WD_ORDER[0]);
  const worstDay = WD_ORDER.filter(i=>i!==0).reduce((b,i)=>wd[i].s<wd[b].s?i:b, 1);
  const hrKeys = Object.keys(hr).map(Number).sort((a,b)=>a-b);
  const bestHour = hrKeys.reduce((b,h)=>hr[h]>hr[b]?h:b, hrKeys[0]);

  const cl = {};
  P.forEach(o=>{ const c = cl[o.phoneKey] || (cl[o.phoneKey]={name:o.name,n:0,s:0}); c.n++; c.s+=o.total||0; c.name=o.name; });
  const topC = Object.entries(cl).sort((a,b)=>b[1].n-a[1].n || b[1].s-a[1].s).slice(0,5);

  const weeks = [];
  for(let w=7;w>=0;w--){ const a = now-(w+1)*7*DAY, b = now-w*7*DAY; weeks.push({l: w===0?"Esta":fmtDate(a+DAY,{day:"numeric",month:"numeric"}), s: orders.filter(o=>o.createdAt>=a&&o.createdAt<b).reduce((s,o)=>s+(o.total||0),0)}); }

  const allC = clients(); const inactive = allC.filter(c=>(now-c.last)/DAY>=settings.inactiveDays);
  const close = allC.filter(c=>{ const l = loyalty(c.phone); return !l.eligible && l.need>0 && l.need<=2; });

  const delta = (a,b) => !period || !b ? "" : `<small>${a>=b?"▲":"▼"} ${Math.abs((a-b)/b*100).toFixed(0)}% vs periodo anterior</small>`;
  const hFmt = h => (h%12||12) + (h<12?"am":"pm");

  // Insights
  const ins = [];
  ins.push(`Tu mejor día es <b>${WD[bestDay]}</b> (${money(wd[bestDay].s)}). ${worstDay!==bestDay && wd[worstDay].n>=0?`El ${WD[worstDay].toLowerCase()} es el más flojo: prueba una promo solo para ese día.`:""}`);
  if(hr[bestHour]) ins.push(`La hora con más clientes es <b>${hFmt(bestHour)}–${hFmt(bestHour+1)}</b>. Ten personal y espacio listos a esa hora.`);
  if(star) ins.push(`Tu producto estrella es <b>${esc(star[0])}</b> (${esc(star[1].qty)} unidades). Úsalo en tus publicaciones de antes/después.`);
  if(avg && prodArr.length) ins.push(`Ticket promedio de ${money(avg)}. Ofrece un combo (ej. zapatos + gorra o mochila) para subirlo.`);
  if(inactive.length) ins.push(`<b>${inactive.length}</b> cliente${inactive.length===1?"":"s"} no vuelve${inactive.length===1?"":"n"} hace ${settings.inactiveDays}+ días. Escríbeles desde Clientes → Inactivos.`);
  if(close.length) ins.push(`<b>${close.length}</b> cliente${close.length===1?" está":"s están"} a 1–2 visitas del premio. Recuérdaselo por WhatsApp.`);
  if(pending>0) ins.push(`Tienes ${money(pending)} en saldos por cobrar.`);

  const maxP = Math.max(...prodArr.map(p=>p[1].rev),1);
  const maxW = Math.max(...WD_ORDER.map(i=>wd[i].s),1);
  const maxH = Math.max(...hrKeys.map(h=>hr[h]),1);
  const maxWk = Math.max(...weeks.map(w=>w.s),1);

  return reportBtns(true) + per + `
  <div class="kpis">
    <div class="kpi"><span>Ventas</span><b>${money(sales)}</b>${delta(sales,prevSales)}</div>
    <div class="kpi"><span>Pedidos</span><b>${P.length}</b>${delta(P.length,prevP.length)}</div>
    <div class="kpi"><span>Ticket promedio</span><b>${money(avg)}</b>${delta(avg,prevAvg)}</div>
    <div class="kpi"><span>Clientes</span><b>${keysP.size}</b><small>${newC} nuevos · ${returning} recurrentes</small></div>
    <div class="kpi"><span>Tasa de retorno</span><b>${retRate.toFixed(0)}%</b><small>clientes que repiten</small></div>
    <div class="kpi"><span>Saldo por cobrar</span><b>${money(pending)}</b>${avgHours?`<small>listo en ${avgHours<48?avgHours.toFixed(0)+" h":(avgHours/24).toFixed(1)+" días"} en promedio</small>`:""}</div>
  </div>
  ${star?`<div class="star"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg><div><span>Producto estrella</span><h3>${esc(star[0])}</h3><span>${esc(star[1].qty)} unidades · ${money(star[1].rev)}</span></div></div>`:""}
  <div class="insights"><h3>Qué hacer para vender más</h3><ul>${ins.map(i=>"<li>"+i+"</li>").join("")}</ul></div>
  ${extraAnalytics(P, start)}

  <h3 class="sec">Ventas por semana</h3>
  <div class="panel pad"><div class="cols">${weeks.map((w,i)=>`<div class="c ${w.s===maxWk&&w.s>0?"top":""}" title="${money(w.s)}"><span>${w.s?"$"+Math.round(w.s):""}</span><i style="height:${w.s/maxWk*100}%"></i><span>${w.l}</span></div>`).join("")}</div></div>

  <h3 class="sec">Mejor día</h3>
  <div class="panel pad"><div class="bars">${WD_ORDER.map(i=>`<div class="bar ${i===bestDay&&wd[i].s>0?"top":""}"><span>${WD[i].slice(0,3)}</span><div class="track"><div class="fill" style="width:${wd[i].s/maxW*100}%"></div></div><span class="v">${money(wd[i].s)}</span></div>`).join("")}</div></div>

  <h3 class="sec">Mejor horario</h3>
  <div class="panel pad"><div class="cols">${hrKeys.map(h=>`<div class="c ${h===bestHour&&hr[h]>0?"top":""}" title="${hr[h]} pedidos"><span>${hr[h]||""}</span><i style="height:${hr[h]/maxH*100}%"></i><span>${h%12||12}</span></div>`).join("")}</div><p class="small muted" style="margin:8px 0 0">Pedidos recibidos por hora del día.</p></div>

  <h3 class="sec">Productos</h3>
  <div class="panel pad"><div class="bars">${prodArr.map(([k,v],i)=>`<div class="bar ${i===0?"top":""}" style="grid-template-columns:120px 1fr 64px"><span>${esc(k)} <span class="muted">(${esc(v.qty)})</span></span><div class="track"><div class="fill" style="width:${v.rev/maxP*100}%"></div></div><span class="v">${money(v.rev)}</span></div>`).join("")}</div></div>

  <h3 class="sec">Clientes frecuentes</h3>
  <div class="panel pad scroll"><table class="t"><thead><tr><th>Cliente</th><th class="r">Visitas</th><th class="r">Gastado</th></tr></thead><tbody>
  ${topC.map(([k,c])=>`<tr><td><button class="chip" style="border:0;padding:0;background:none" data-client="${esc(k)}">${esc(c.name)}</button></td><td class="r">${c.n}</td><td class="r">${money(c.s)}</td></tr>`).join("")}
  </tbody></table></div>
  ${discounts?`<p class="small muted">Descuentos de fidelidad entregados en el periodo: ${money(discounts)}.</p>`:""}`;
}

/* ---------- Vista: Ajustes ---------- */
function viewSettings(){
  return `<h2 style="font-size:1.4rem;margin-bottom:14px">Ajustes</h2>
  <div class="lbl">Precios</div>
  <div class="panel">${settings.services.map((s,i)=>`<div class="svc" style="grid-template-columns:1fr 90px"><input class="input" style="min-height:40px;padding:8px 10px" data-sl="${i}" value="${esc(s.label)}" aria-label="Nombre del servicio"><input class="price" type="text" inputmode="decimal" data-sp="${i}" value="${fmt2(s.price)}" aria-label="Precio de ${esc(s.label)}"></div>`).join("")}</div>
  <div class="lbl">Fidelización</div>
  <div class="panel pad">
    <div class="two"><div class="field"><label for="s_lv">Visitas para el premio</label><input class="input" id="s_lv" inputmode="numeric" value="${settings.loyaltyVisits}"></div>
    <div class="field"><label for="s_lm">En cuántos meses</label><input class="input" id="s_lm" inputmode="numeric" value="${settings.loyaltyMonths}"></div></div>
    <div class="two"><div class="field"><label for="s_lp">Descuento en la visita siguiente (%)</label><input class="input" id="s_lp" inputmode="decimal" value="${settings.loyaltyPct}"></div>
    <div class="field"><label for="s_id">Cliente inactivo después de (días)</label><input class="input" id="s_id" inputmode="numeric" value="${settings.inactiveDays}"></div></div>
    <p class="small muted" style="margin:0">Con ${settings.loyaltyVisits} visitas en ${settings.loyaltyMonths} meses, la visita ${settings.loyaltyVisits+1} tiene ${settings.loyaltyPct}% de descuento.</p>
  </div>
  <div class="lbl">Negocio</div>
  <div class="panel pad">
    <div class="field"><label for="s_bn">Nombre</label><input class="input" id="s_bn" value="${esc(settings.business)}"></div>
    <div class="field"><label for="s_hr">Horario (aparece en los mensajes)</label><input class="input" id="s_hr" value="${esc(settings.hours)}"></div>
    <div class="two"><div class="field"><label for="s_nn">Próximo N° de pedido</label><input class="input" id="s_nn" inputmode="numeric" value="${settings.nextNumber}" data-shown="${settings.nextNumber}"></div>
    <div class="field"><label for="s_dd">Días para entrega</label><input class="input" id="s_dd" inputmode="numeric" value="${settings.deliveryDays}"></div></div>
    <div class="two"><div class="field"><label for="s_px">Prefijo del N°</label><input class="input" id="s_px" value="${esc(settings.prefix)}"></div>
    <div class="field"><label for="s_cc">Código de país</label><input class="input" id="s_cc" inputmode="numeric" value="${esc(settings.cc)}"></div></div>
    <div class="field"><label for="s_na">Avisar al cliente por WhatsApp</label><select class="input" id="s_na"><option value="1" ${settings.notifyAll?"selected":""}>Al pasar a producción y cuando está listo</option><option value="0" ${settings.notifyAll?"":"selected"}>Solo cuando está listo</option></select></div>
    <div class="field"><label for="s_rp">WhatsApp para recibir reportes (dueño o gerente)</label><input class="input" id="s_rp" type="tel" inputmode="tel" placeholder="Ej. 099 123 4567 · vacío = elegir contacto" value="${esc(settings.reportPhone||"")}"></div>
  </div>
  <div class="lbl">Aviso de privacidad (LOPDP)</div>
  <div class="panel pad">
    <p class="small muted" style="margin:0 0 10px">Estos datos aparecen en el <a href="privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a> que ven tus clientes.</p>
    <div class="field"><label for="p_ti">Responsable (razón social o nombre)</label><input class="input" id="p_ti" maxlength="120" value="${esc(privacy.titular)}"></div>
    <div class="two"><div class="field"><label for="p_ruc">RUC</label><input class="input" id="p_ruc" inputmode="numeric" maxlength="13" value="${esc(privacy.ruc)}"></div>
    <div class="field"><label for="p_vg">Vigente desde</label><input class="input" id="p_vg" type="date" value="${esc(privacy.vigencia)}"></div></div>
    <div class="field"><label for="p_dir">Dirección</label><input class="input" id="p_dir" maxlength="200" value="${esc(privacy.direccion)}"></div>
    <div class="two"><div class="field"><label for="p_co">Correo para temas de datos</label><input class="input" id="p_co" type="email" maxlength="120" value="${esc(privacy.correo)}"></div>
    <div class="field"><label for="p_wa">WhatsApp de contacto</label><input class="input" id="p_wa" type="tel" inputmode="tel" maxlength="30" value="${esc(privacy.whatsapp)}"></div></div>
    <div class="field"><label for="p_an">Guardar nombre y celular del cliente después de su última visita</label><select class="input" id="p_an">${[1,2,3,4,5].map(n=>`<option value="${n}" ${privacy.anios===n?"selected":""}>${n} ${n===1?"año":"años"}${n===2?" (recomendado)":""}</option>`).join("")}</select></div>
  </div>
  <button class="btn block" id="saveSet" style="margin-bottom:12px">Guardar ajustes</button>
  <div class="lbl">Promociones</div>
  <div class="panel pad">
    ${(settings.promos||[]).length ? settings.promos.map(x => `<div class="hist" style="align-items:center"><span><b>${esc(x.name)}</b>${x.active?"":' <span class="small muted">(pausada)</span>'}<br><span class="small muted">${esc(promoDesc(x))}</span></span><button class="btn ghost" style="min-height:38px;padding:6px 10px" data-pedit="${esc(x.id)}">Editar</button></div>`).join("") : `<p class="small muted" style="margin:0">Aún no hay promociones.</p>`}
    <button class="btn block" id="pAdd" style="margin-top:10px">＋ Nueva promoción</button>
    <p class="small muted" style="margin:10px 0 0">En cada pedido, recepción elige la promoción del día y puede sumar un descuento manual de hasta ${MANUAL_MAX}%.</p>
  </div>
  <div class="lbl">Respaldo de fotos</div>
  <div class="panel pad">
    <p class="small muted" style="margin:0 0 10px">Descarga las fotos en un archivo ZIP. Cada foto lleva el N° de ticket en el nombre (por ejemplo B000575_recepcion_1_Zapatos-clasicos-1.webp). Las fotos se borran ${settings.photoDays} días después de entregado el pedido: descárgalas antes si las necesitas.</p>
    <div class="two"><button class="btn ghost block" data-zipdays="1">Hoy</button><button class="btn ghost block" data-zipdays="7">Últimos 7 días</button></div>
    <button class="btn ghost block" data-zipdays="31" style="margin-top:8px">Últimos 30 días</button>
  </div>
  ${usersPanel()}
  <div class="lbl">Datos</div>
  <div class="stack" style="margin-top:0">
    <button class="btn ghost block" id="export">Exportar ventas a Excel (CSV)</button>
    <button class="btn ghost block" id="backup">Descargar respaldo</button>
    <label class="btn ghost block" for="restore" style="cursor:pointer">Restaurar respaldo</label>
    <input type="file" id="restore" accept=".json,application/json" hidden>
  </div>
  <p class="small muted" style="margin-top:16px">${orders.length} pedidos guardados · ${mode==="db"?"sincronizado en la nube":"guardado en este dispositivo"}</p>`;
}
async function saveSettingsForm(){
  const n = (id,def) => { const raw = String($(id).value||"").trim(); return raw==="" ? def : parseNum(raw); };
  document.querySelectorAll("[data-sl]").forEach(el => settings.services[+el.dataset.sl].label = el.value.trim() || settings.services[+el.dataset.sl].label);
  document.querySelectorAll("[data-sp]").forEach(el => settings.services[+el.dataset.sp].price = r2(Math.max(0, n("[data-sp='"+el.dataset.sp+"']",0))));
  settings.loyaltyVisits = Math.max(1, Math.round(n("#s_lv",10)));
  settings.loyaltyMonths = Math.max(1, Math.round(n("#s_lm",6)));
  settings.loyaltyPct = Math.min(100, Math.max(0, n("#s_lp",30)));
  settings.inactiveDays = Math.max(1, Math.round(n("#s_id",45)));
  settings.business = $("#s_bn").value.trim() || "Shoe Cleaning";
  settings.hours = $("#s_hr").value.trim();
  { const nn = Math.max(1, Math.round(n("#s_nn",settings.nextNumber)));
    if(String(nn) !== String($("#s_nn").dataset.shown)){ settings.nextNumber = nn; settings.numEpoch = (settings.numEpoch||0) + 1; } } // si no se tocó, se conserva el número más reciente
  settings.deliveryDays = Math.max(0, Math.round(n("#s_dd",3)));
  settings.prefix = $("#s_px").value.trim();
  settings.cc = digits($("#s_cc").value) || "593";
  settings.notifyAll = $("#s_na").value==="1";
  settings.reportPhone = $("#s_rp").value.trim();
  const correo = $("#p_co").value.trim();
  if(correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){ toast("Revisa el correo del aviso de privacidad"); $("#p_co").focus(); return; }
  privacy = normPrivacy({titular:$("#p_ti").value.trim(), ruc:$("#p_ruc").value, direccion:$("#p_dir").value.trim(), correo,
    whatsapp:$("#p_wa").value.trim(), vigencia:$("#p_vg").value, anios:$("#p_an").value});
  await saveSettings(); await savePrivacy(); draft = null; render(); toast("Ajustes guardados");
}
async function saveFile(filename, data, mime){
  if(downloads){
    try{ await downloads.save({filename, data}); return; }
    catch(e){ if(e && e.code==="declined") return; }
  }
  try{
    const url = URL.createObjectURL(new Blob([data],{type:mime}));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }catch(e){ toast("No se pudo descargar el archivo"); }
}
async function backupJSON(){
  await saveFile("respaldo-shoe-cleaning-"+todayStr()+".json", JSON.stringify({app:"shoe-cleaning",version:3,exportedAt:new Date().toISOString(),settings,orders,expenses,supplies},null,1), "application/json");
}
function restoreJSON(file){
  const rd = new FileReader();
  rd.onload = async () => {
    try{
      const data = JSON.parse(rd.result);
      if(!data || !Array.isArray(data.orders)) throw 0;
      const ids = new Set(orders.map(o=>o.id)); let added = 0;
      for(const raw of data.orders){ if(!raw || !raw.id || ids.has(raw.id)) continue; await putOrder(norm(raw)); added++; }
      if(data.settings && confirm("¿Usar también los precios y ajustes del respaldo?")){
        const keepUsers = settings.users; const rs = Object.assign({}, data.settings); delete rs.users; settings = normSettings(rs); if(keepUsers && keepUsers.length) settings.users = keepUsers;
        const maxN = Math.max(0, ...orders.map(o=>parseInt(String(o.num||"").replace(/\D/g,""))||0));
        settings.nextNumber = Math.max(settings.nextNumber, maxN+1);
        await saveSettings();
      }
      render(); toast(added ? `Se restauraron ${added} pedidos` : "No había pedidos nuevos en el respaldo");
    }catch(e){ toast("El archivo no es un respaldo válido de Shoe Cleaning"); }
  };
  rd.readAsText(file);
}
async function exportCSV(){
  // Excel en español usa coma decimal y punto y coma como separador
  const dc = n => fmt2(n||0).replace(".",",");
  const head = ["Numero","Fecha","Hora","Cliente","Telefono","Articulos","Subtotal","Descuento","Total","Abono","Saldo","Pago","Estado","Entrega"];
  const rows = orders.slice().sort((a,b)=>a.createdAt-b.createdAt).map(o=>{ const d=new Date(o.createdAt); return [o.num, d.toLocaleDateString("es-EC"), d.toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"}), o.name, o.phone, itemsText(o), dc(o.subtotal), dc(o.discount), dc(o.total), dc(o.paidFull?o.total:o.abono), dc(saldo(o)), o.methodFinal||o.method||"", ST[o.status].l, o.dueDate||""]; });
  const cell = v => { let t = String(v); if(/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g,'""') + '"'; }; // un nombre como =HYPERLINK(...) no se ejecuta en Excel
  const csv = "\ufeff" + [head,...rows].map(r=>r.map(cell).join(";")).join("\n");
  await saveFile("ventas-shoe-cleaning-"+todayStr()+".csv", csv, "text/csv;charset=utf-8");
}

/* ---------- Hoja modal ---------- */
function openSheet(html){
  closeSheet();
  const s = document.createElement("div"); s.className="scrim"; s.id="scrim";
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  s.addEventListener("click", e => { if(e.target===s) closeSheet(); });
  document.body.appendChild(s);
  s.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => setTimeout(closeSheet, 50)));
  s.querySelectorAll("[data-notify]").forEach(b => b.addEventListener("click", () => { markNotified(b.dataset.notify); setTimeout(closeSheet,50); }));
  s.querySelectorAll("[data-client]").forEach(b => b.addEventListener("click", () => clientSheet(b.dataset.client)));
  const f = s.querySelector("button, a"); if(f) f.focus({preventScroll:true});
}
function closeSheet(){ const s = $("#scrim"); if(s) s.remove(); }
document.addEventListener("keydown", e => { if(e.key==="Escape") closeSheet(); });

/* ---------- Eventos ---------- */
function bind(){
  const v = $("#view");
  v.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  v.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { filter = b.dataset.filter; render(); });
  v.querySelectorAll("[data-adv]").forEach(b => b.onclick = () => advance(b.dataset.adv));
  v.querySelectorAll("[data-wa]").forEach(a => a.addEventListener("click", () => { markNotified(a.dataset.wa); }));
  v.querySelectorAll("[data-open]").forEach(b => { b.onclick = () => orderSheet(b.dataset.open); b.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); orderSheet(b.dataset.open); } }; });
  const qi = $("#q"); if(qi) qi.oninput = e => { q = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(pos,pos); };
  v.querySelectorAll("[data-consult]").forEach(b => b.onclick = openConsult);
  v.querySelectorAll("[data-report]").forEach(b => b.onclick = () => b.dataset.report==="exec" ? execSheet() : cierreSheet());
  v.querySelectorAll("[data-of]").forEach(b => b.onclick = () => { opsFilter = b.dataset.of; render(); });
  // gastos e insumos
  v.querySelectorAll("[data-expnew]").forEach(b => b.onclick = () => expenseSheet());
  v.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => expDetailSheet(b.dataset.exp));
  v.querySelectorAll("[data-sup]").forEach(b => b.onclick = () => supplySheet(b.dataset.sup));
  v.querySelectorAll("[data-supnew]").forEach(b => b.onclick = () => supplySheet(null));
  v.querySelectorAll("[data-use]").forEach(b => b.onclick = () => useSheet(b.dataset.use));
  v.querySelectorAll("[data-count]").forEach(b => b.onclick = () => countSheet(b.dataset.count));
  v.querySelectorAll("[data-em]").forEach(b => b.onclick = () => { expMonth = b.dataset.em; render(); });
  v.querySelectorAll("[data-expcsv]").forEach(b => b.onclick = exportExpCSV);
  // clientes
  v.querySelectorAll("[data-cf]").forEach(b => b.onclick = () => { clientFilter = b.dataset.cf; render(); });
  v.querySelectorAll("[data-client]").forEach(b => { b.onclick = () => clientSheet(b.dataset.client); b.onkeydown = e => { if(e.key==="Enter"){ clientSheet(b.dataset.client); } }; });
  const cq = $("#cq"); if(cq) cq.oninput = e => { clientQ = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#cq"); n.focus(); n.setSelectionRange(pos,pos); };
  // análisis
  v.querySelectorAll("[data-per]").forEach(b => b.onclick = () => { period = +b.dataset.per; render(); });
  // nuevo
  if(view==="nuevo"){
    $("#f_phone").oninput = e => { draft.phone = e.target.value; const c = clients().find(x=>x.key===phoneKey(draft.phone)); if(c && !draft.name){ draft.name = c.name; $("#f_name").value = c.name; } showSuggest(); refreshNew(); };
    $("#f_name").oninput = e => { draft.name = e.target.value; showSuggest(); };
    $("#f_due").onchange = e => draft.due = e.target.value;
    $("#f_method").onchange = e => draft.method = e.target.value;
    $("#f_notes").oninput = e => draft.notes = e.target.value;
    $("#f_aviso").onchange = e => draft.avisoOk = e.target.checked;
    $("#f_promo").onchange = e => draft.promoOk = e.target.checked;
    const ab = $("#f_abono"); if(ab){ ab.oninput = e => { draft.abono = e.target.value; refreshNew(); }; ab.onblur = e => { if(e.target.value.trim()!==""){ draft.abono = fmt2(parseNum(e.target.value)); e.target.value = draft.abono; refreshNew(); } }; }
    v.querySelectorAll("[data-ab]").forEach(b => b.onclick = () => { draft.abonoMode = b.dataset.ab; render(); if(draft.abonoMode==="abono") $("#f_abono").focus(); });
    const step = (k,d) => { draft.qty[k] = Math.max(0,(draft.qty[k]||0)+d); $("#q_"+k).textContent = draft.qty[k]; $("#q_"+k).closest(".svc").classList.toggle("on", draft.qty[k]>0); refreshNew(); };
    v.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => step(b.dataset.inc,1));
    v.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => step(b.dataset.dec,-1));
    v.querySelectorAll("[data-price]").forEach(i => { i.oninput = e => { draft.price[i.dataset.price] = e.target.value; refreshNew(); }; i.onblur = e => { draft.price[i.dataset.price] = fmt2(parseNum(e.target.value)); e.target.value = draft.price[i.dataset.price]; refreshNew(); }; i.onfocus = e => e.target.select(); });
    const r = $("#f_reward"); if(r) r.onchange = e => { draft.useReward = e.target.checked; if(draft.useReward){ draft.promoId = ""; draft.manualOn = false; } render(); };
    bindDisc();
    $("#save").onclick = submitNew;
    bindPicker("recepcion", photoUnits(calc().items));
  }
  if(view==="ajustes"){
    $("#saveSet").onclick = saveSettingsForm;
    $("#uAdd").onclick = userSheet;
    v.querySelectorAll("[data-upw]").forEach(b => b.onclick = () => pwSheet(b.dataset.upw));
    v.querySelectorAll("[data-udel]").forEach(b => b.onclick = () => delUser(b.dataset.udel));
    v.querySelectorAll("[data-urole]").forEach(b => b.onclick = () => roleSheet(b.dataset.urole));
    $("#pAdd").onclick = () => promoSheet(null);
    v.querySelectorAll("[data-pedit]").forEach(b => b.onclick = () => promoSheet(b.dataset.pedit));
    v.querySelectorAll("[data-zipdays]").forEach(b => b.onclick = () => zipPhotosSince(+b.dataset.zipdays));
    $("#export").onclick = exportCSV;
    $("#backup").onclick = backupJSON;
    $("#restore").onchange = e => { const f = e.target.files && e.target.files[0]; if(f) restoreJSON(f); e.target.value = ""; };
  }
}

/* ---------- Inicio ---------- */
function setSync(t){ $("#sync").textContent = t; }
let syncState = "";
function showSync(){
  if(!cloud || !me) return;
  if(!navigator.onLine) setSync(syncState==="pend" ? "Sin internet · guardado en este equipo ⏳" : "Sin internet · trabajando en este equipo");
  else setSync(syncState==="pend" ? "Subiendo cambios…" : syncState==="off" ? "Conectando…" : "Sincronizado ✓");
}
window.addEventListener("online", () => { showSync(); topUpBlock(); });
window.addEventListener("offline", showSync);
let purgeDone = false;
function onData(){
  if(isAdmin() && !purgeDone){ purgeDone = true; setTimeout(() => purgeOldPhotos().catch(()=>{}), 8000); }
  renderNotices();
  if(view==="nuevo"){ if($("#totals")) refreshNew(); return; }
  if(view==="ajustes") return; // no borrar lo que se está escribiendo
  const a = document.activeElement, id = a && a.id, pos = a && a.selectionStart;
  render();
  if(id){ const n = document.getElementById(id); if(n){ n.focus({preventScroll:true}); try{ n.setSelectionRange(pos,pos); }catch(e){} } }
}

/* ---------- Fotos ---------- */
// Una foto por cada par o artículo, en recepción y en entrega. Cada foto se guarda en dos tamaños:
// la foto (máx. 720 px, unos 30-70 KB) y su miniatura (160 px, unos 4-8 KB), en WebP si el
// navegador lo permite (JPEG si no, por ejemplo Safari antiguo). Las listas cargan solo miniaturas;
// la foto grande se descarga al tocarla y se libera al cerrarla. Al recomprimir se pierden los
// datos EXIF (ubicación GPS, modelo del celular): no se guarda nada más que la imagen.
const photoCount = o => o && o.photos ? (o.photos.recepcion||0) + (o.photos.entrega||0) : 0;
const PHOTO_IN_MAX = 30 * 1024 * 1024; // archivos más grandes pueden colgar celulares con poca memoria
// Unidades del pedido: "Zapatos 1", "Zapatos 2", "Gorra"... (una foto por cada una)
function photoUnits(items){
  const out = [];
  (items||[]).forEach(i => {
    const n = Math.max(0, Math.round(i.qty||0)), key = String(i.key||"art").replace(/[^A-Za-z0-9_]/g,"") || "art";
    for(let k = 1; k <= n && out.length < PHOTO_MAX; k++) out.push({slot:`${key}:${k}`, label: n>1 ? `${i.label} ${k}` : String(i.label||"Artículo")});
  });
  return out;
}
let webpOk = null;
function encodeCanvas(cv, q){
  if(webpOk !== false){ const u = cv.toDataURL("image/webp", q); if(u.startsWith("data:image/webp")){ webpOk = true; return u; } webpOk = false; }
  return cv.toDataURL("image/jpeg", q);
}
function drawScaled(img, maxpx){
  const k = Math.min(1, maxpx / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth*k)), h = Math.max(1, Math.round(img.naturalHeight*k));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0,0,w,h); cx.drawImage(img, 0, 0, w, h);
  return cv;
}
async function compressImage(file){
  if(!file || !/^image\//.test(file.type || "")) throw new Error("tipo");
  if(file.size > PHOTO_IN_MAX) throw new Error("grande");
  const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); }; i.src = u; });
  const cv = drawScaled(img, 720);
  let q = 0.6, data = encodeCanvas(cv, q);
  while(data.length > 80000 && q > 0.3){ q -= 0.08; data = encodeCanvas(cv, q); }
  cv.width = cv.height = 0; // libera la memoria del lienzo enseguida (Safari en iPhone la retiene)
  const tc = drawScaled(img, 160);
  let tq = 0.55, thumb = encodeCanvas(tc, tq);
  while(thumb.length > 14000 && tq > 0.25){ tq -= 0.1; thumb = encodeCanvas(tc, tq); }
  tc.width = tc.height = 0; img.src = "";
  if(data.length > 150000 || thumb.length > 19000) throw new Error("grande");
  return {data, thumb};
}
const photoErr = err => err && err.message==="tipo" ? "Ese archivo no es una foto" : err && err.message==="grande" ? "La foto es demasiado grande" : "No se pudo guardar la foto";
let idbP = null;
function idb(){
  if(idbP) return idbP;
  idbP = new Promise((res, rej) => { const r = indexedDB.open("sc_photos", 1); r.onupgradeneeded = () => { const st = r.result.createObjectStore("photos", {keyPath:"id"}); st.createIndex("orderId","orderId"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return idbP;
}
async function idbByOrder(orderId){
  const d = await idb();
  return await new Promise((res, rej) => { const r = d.transaction("photos").objectStore("photos").index("orderId").getAll(orderId); r.onsuccess = () => res(r.result||[]); r.onerror = () => rej(r.error); });
}
// Guarda la foto y su miniatura juntas (en la nube, en una sola operación)
async function savePhoto(ph, thumb){
  ph.id = ph.id || uid();
  if(!ph.slot) delete ph.slot; if(!ph.label) delete ph.label;
  if(cloud && fb){
    const b = fb.batch();
    b.set(fb.collection("photos").doc(ph.id), ph);
    if(thumb) b.set(fb.collection("thumbs").doc(ph.id), {id:ph.id, orderId:ph.orderId, stage:ph.stage, slot:ph.slot||"", label:ph.label||"", data:thumb, at:ph.at});
    await cloudWrite(b.commit(), "Una foto"); return ph.id;
  }
  const d = await idb();
  await new Promise((res, rej) => { const t = d.transaction("photos","readwrite"); t.objectStore("photos").put(Object.assign({}, ph, thumb ? {thumb} : {})); t.oncomplete = res; t.onerror = () => rej(t.error); });
  return ph.id;
}
// Solo las miniaturas de un pedido. Fotos de antes de las miniaturas: se usa la foto.
async function loadThumbs(orderId){
  let list = [];
  if(cloud && fb){
    const sn = await fb.collection("thumbs").where("orderId","==",orderId).get();
    list = sn.docs.map(x => x.data());
    const o = orders.find(x => x.id===orderId);
    if(o && list.length < photoCount(o)){
      const have = new Set(list.map(x => x.id));
      const ps = await fb.collection("photos").where("orderId","==",orderId).get();
      ps.docs.forEach(d => { const p = d.data(); if(!have.has(p.id)) list.push({id:p.id, orderId, stage:p.stage, slot:p.slot||"", label:p.label||"", data:p.data, at:p.at}); });
    }
  } else {
    list = (await idbByOrder(orderId)).map(p => ({id:p.id, orderId, stage:p.stage, slot:p.slot||"", label:p.label||"", data:p.thumb||p.data, at:p.at}));
  }
  return list.sort((a,b) => (a.at||0)-(b.at||0));
}
async function loadFull(id){
  if(cloud && fb){ const d = await fb.collection("photos").doc(id).get(); return d.exists ? d.data().data : ""; }
  const d = await idb();
  return await new Promise((res, rej) => { const r = d.transaction("photos").objectStore("photos").get(id); r.onsuccess = () => res(r.result ? r.result.data : ""); r.onerror = () => rej(r.error); });
}
async function deletePhotos(orderId){
  if(cloud && fb){
    const [a, t] = await Promise.all([fb.collection("photos").where("orderId","==",orderId).get(), fb.collection("thumbs").where("orderId","==",orderId).get()]);
    await cloudWrite(Promise.all([...a.docs, ...t.docs].map(d => d.ref.delete())), "El borrado de fotos"); return a.size;
  }
  const d = await idb();
  return await new Promise((res, rej) => { const t = d.transaction("photos","readwrite"); const st = t.objectStore("photos"); let n = 0; const r = st.index("orderId").getAllKeys(orderId); r.onsuccess = () => { n = (r.result||[]).length; (r.result||[]).forEach(k => st.delete(k)); }; t.oncomplete = () => res(n); t.onerror = () => rej(t.error); });
}
// Retención (LOPDP: no guardar más de lo necesario) y cuidado del espacio gratuito:
// las fotos de pedidos entregados hace más de settings.photoDays días se borran solas.
// Lo hace la sesión del administrador, una vez al día.
async function purgeOldPhotos(){
  if(!isAdmin()) return;
  const key = "sc_purge_" + (me.uid||me.u);
  try{ if(localStorage.getItem(key)===todayStr()) return; }catch(e){}
  const cutoff = Date.now() - settings.photoDays*DAY;
  const old = orders.filter(o => o.status==="entregado" && o.deliveredAt && o.deliveredAt < cutoff && photoCount(o));
  let n = 0;
  for(const o of old.slice(0, 100)){ try{ n += await deletePhotos(o.id); await patchOrder(o.id, {photos:{recepcion:0, entrega:0}}); }catch(e){} }
  try{ localStorage.setItem(key, todayStr()); }catch(e){}
  if(n) toast(`Se borraron ${n} fotos de pedidos entregados hace más de ${settings.photoDays} días`);
}
const safeImg = u => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u||"") ? u : "";
// Foto grande: se descarga al abrirla y se suelta de la memoria al cerrarla
function openFull(id, thumb, caption){
  const d = document.createElement("div"); d.className = "lightbox"; d.setAttribute("role","dialog"); d.setAttribute("aria-label","Foto ampliada");
  d.innerHTML = `<img alt="Foto ampliada" src="${esc(safeImg(thumb))}"><div class="cap">${esc(caption||"Foto")} · cargando…</div>`;
  const onKey = e => { if(e.key==="Escape") close(); };
  const close = () => { const im = d.querySelector("img"); if(im) im.removeAttribute("src"); d.remove(); document.removeEventListener("keydown", onKey); };
  d.onclick = close; document.addEventListener("keydown", onKey); document.body.appendChild(d);
  loadFull(id).then(u => { if(!d.isConnected) return; const ok = safeImg(u); if(ok) d.querySelector("img").src = ok; d.querySelector(".cap").textContent = caption || ""; })
    .catch(() => { if(d.isConnected) d.querySelector(".cap").textContent = "No se pudo cargar la foto (¿sin internet?)"; });
}
const thumbGrid = list => `<div class="thgrid">${list.map(p => `<button type="button" class="thb" data-ph="${esc(p.id)}"><img src="${esc(safeImg(p.data))}" alt="${esc(p.label||"Foto")}" loading="lazy" decoding="async"><span>${esc(p.label||"Foto")}</span></button>`).join("")}</div>`;
function bindThumbs(root, list){
  root.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => { const p = list.find(x => x.id===b.dataset.ph); if(p) openFull(p.id, p.data, p.label); });
}
// Fotos de un pedido en su ficha: miniaturas por etapa y espacios para las que faltan
async function renderPhotoPanel(o, opts = {}){
  const box = $("#phbox"); if(!box) return;
  let list = [];
  if(photoCount(o)){ try{ list = await loadThumbs(o.id); }catch(e){ const b0 = $("#phbox"); if(b0) b0.textContent = "No se pudieron cargar las fotos."; return; } }
  const b = $("#phbox"); if(!b) return;
  const units = photoUnits(o.items);
  const canAdd = st => !opts.readOnly && (st==="recepcion" ? o.status!=="entregado" : o.status==="entregado");
  let h = "";
  for(const st of (opts.stages || ["recepcion","entrega"])){
    const L = list.filter(p => p.stage===st);
    if(!L.length && !canAdd(st)) continue;
    const bySlot = {}; L.forEach(p => { if(p.slot) bySlot[p.slot] = p; });
    const known = units.filter(u => bySlot[u.slot]).map(u => bySlot[u.slot]);
    const extra = L.filter(p => !p.slot || !units.some(u => u.slot===p.slot));
    const missing = canAdd(st) ? units.filter(u => !bySlot[u.slot]) : [];
    h += `<div class="phgroup"><b>${st==="entrega"?"Entrega":"Recepción"}</b> <span class="small muted">${L.length} de ${units.length}</span>
      ${known.length || extra.length ? thumbGrid(known.concat(extra)) : ""}
      ${missing.length ? `<div class="slots">${missing.map(u => `<div class="slot"><label class="cam" aria-label="Tomar foto de ${esc(u.label)}">📷<input type="file" accept="image/*" hidden data-addph="${esc(u.slot)}" data-st="${st}" data-lb="${esc(u.label)}"></label><small>${esc(u.label)}</small></div>`).join("")}</div>` : ""}</div>`;
  }
  if(list.length && !opts.readOnly) h += `<button class="btn ghost block" id="phZip" style="margin-top:6px">⬇️ Descargar fotos del N° ${esc(o.num)}</button>`;
  b.className = ""; b.innerHTML = h || `<span class="small muted">Sin fotos.</span>`;
  const zb = $("#phZip"); if(zb) zb.onclick = () => zipOrderPhotos(o);
  bindThumbs(b, list);
  b.querySelectorAll("[data-addph]").forEach(inp => inp.onchange = async e => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const st = inp.dataset.st, cur = Object.assign({recepcion:0, entrega:0}, o.photos||{});
    if(cur[st] >= PHOTO_MAX){ toast(`Máximo ${PHOTO_MAX} fotos por etapa`); return; }
    try{
      const {data, thumb} = await compressImage(f);
      await savePhoto({orderId:o.id, num:o.num, stage:st, data, at:Date.now(), by:me?me.u:"", slot:inp.dataset.addph, label:inp.dataset.lb}, thumb);
      cur[st]++; await patchOrder(o.id, {photos:cur}); o.photos = cur; toast("Foto guardada"); renderPhotoPanel(o, opts);
    }catch(err){ toast(photoErr(err)); }
  });
}
// Respaldo de fotos: ZIP sin compresión (las fotos ya están comprimidas). Cada archivo empieza con el N° de ticket.
const CRC_T = (() => { const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for(let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipFiles(files){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), tm = ((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1)) & 0xFFFF, dt = (((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()) & 0xFFFF;
  for(const f of files){
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(10,tm,true); h.setUint16(12,dt,true); h.setUint32(14,crc,true); h.setUint32(18,sz,true); h.setUint32(22,sz,true); h.setUint16(26,name.length,true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(12,tm,true); c.setUint16(14,dt,true); c.setUint32(16,crc,true); c.setUint32(20,sz,true); c.setUint32(24,sz,true); c.setUint16(28,name.length,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + sz;
  }
  const csize = central.reduce((t,x) => t + x.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,csize,true); e.setUint32(16,off,true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type:"application/zip"});
}
const slugName = t => String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "foto";
function photoFiles(list){
  const count = {};
  return list.filter(p => safeImg(p.data)).sort((a,b) => String(a.num).localeCompare(String(b.num)) || (a.stage==="entrega") - (b.stage==="entrega") || (a.at||0) - (b.at||0)).map(p => {
    const key = (p.num||"sin-numero") + "_" + p.stage; count[key] = (count[key]||0) + 1;
    const mime = p.data.slice(5, p.data.indexOf(";")), ext = mime==="image/webp" ? "webp" : mime==="image/png" ? "png" : "jpg";
    const bin = atob(p.data.split(",")[1]), data = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return {name:`${slugName(p.num)}_${p.stage==="entrega"?"entrega":"recepcion"}_${count[key]}_${slugName(p.label)}.${ext}`, data};
  });
}
async function zipOrderPhotos(o){
  try{
    let list;
    if(cloud && fb){ const sn = await fb.collection("photos").where("orderId","==",o.id).get(); list = sn.docs.map(d => d.data()); }
    else list = await idbByOrder(o.id);
    if(!list.length){ toast("Este pedido no tiene fotos guardadas"); return; }
    list.forEach(p => { p.num = p.num || o.num; });
    await saveFile(`fotos-${slugName(o.num)}.zip`, zipFiles(photoFiles(list)), "application/zip");
    toast(`${list.length} foto${list.length===1?"":"s"} descargada${list.length===1?"":"s"}`);
  }catch(e){ toast("No se pudieron descargar las fotos"); }
}
async function zipPhotosSince(days){
  if(!(cloud && fb)){ toast("El respaldo de fotos por fechas está disponible en la versión en la nube"); return; }
  const d0 = new Date(); d0.setHours(0,0,0,0); const since = d0.getTime() - (days-1)*DAY;
  toast("Preparando el respaldo de fotos…");
  try{
    const sn = await fb.collection("photos").where("at",">=",since).get();
    const list = sn.docs.map(d => d.data());
    if(!list.length){ toast("No hay fotos en ese periodo"); return; }
    const byNum = {}; orders.forEach(o => { byNum[o.id] = o.num; }); list.forEach(p => { p.num = p.num || byNum[p.orderId] || "sin-numero"; });
    const files = photoFiles(list), PART = 150, stamp = todayStr();
    for(let i = 0, k = 1; i < files.length; i += PART, k++){
      const name = files.length > PART ? `fotos-shoe-cleaning-${stamp}-parte${k}.zip` : `fotos-shoe-cleaning-${stamp}.zip`;
      await saveFile(name, zipFiles(files.slice(i, i+PART)), "application/zip");
    }
    toast(`Respaldo listo: ${files.length} fotos`);
  }catch(e){ toast("No se pudo preparar el respaldo de fotos"); }
}
// Espacios para tomar fotos antes de guardar (nuevo pedido y entrega)
function pickerHTML(stage, units, refs){
  const map = pendingPhotos[stage], n = units.filter(u => map[u.slot]).length;
  return `<div class="photos" id="pp_${stage}" data-sig="${esc(units.map(u => u.slot).join(","))}">
    <span class="lbl">Fotos de ${stage==="entrega"?"entrega":"recepción"} · una por par o artículo</span>
    ${units.length ? `<div class="slots">${units.map(u => { const p = map[u.slot], r = refs && refs[u.slot];
      return `<div class="slot ${p?"has":""}"><span class="refwrap">${p ? `<span class="th"><img src="${esc(safeImg(p.thumb))}" alt="Foto de ${esc(u.label)}"><button type="button" data-rmph="${esc(u.slot)}" aria-label="Quitar foto de ${esc(u.label)}">×</button></span>`
        : `<label class="cam" aria-label="Tomar foto de ${esc(u.label)}">📷<input type="file" accept="image/*" hidden data-slot="${esc(u.slot)}"></label>`}${r ? `<img class="ref" src="${esc(safeImg(r.data))}" alt="Cómo llegó ${esc(u.label)}" title="Cómo llegó">` : ""}</span><small>${esc(u.label)}</small></div>`; }).join("")}</div>
      <small class="muted">${n} de ${units.length} fotos · se guardan en formato liviano</small>` : `<small class="muted">Agrega artículos para tomar sus fotos.</small>`}</div>`;
}
function bindPicker(stage, units, refs){
  const root = $("#pp_"+stage); if(!root) return;
  const redo = () => { const r = $("#pp_"+stage); if(r){ r.outerHTML = pickerHTML(stage, units, refs); bindPicker(stage, units, refs); } };
  root.querySelectorAll("[data-slot]").forEach(inp => inp.onchange = async e => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    try{ pendingPhotos[stage][inp.dataset.slot] = await compressImage(f); }catch(err){ toast(photoErr(err)); }
    redo();
  });
  root.querySelectorAll("[data-rmph]").forEach(b => b.onclick = () => { delete pendingPhotos[stage][b.dataset.rmph]; redo(); });
}

/* ---------- Personal: ingresos y presencia ---------- */
function devName(){ const ua = navigator.userAgent; return /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Otro"; }
function localLogins(){ try{ return JSON.parse(localStorage.getItem("sc_logins")||"[]"); }catch(e){ return []; } }
async function recordLogin(type){
  if(!me) return;
  const key = "sc_lastlog_" + me.u;
  if(type==="apertura"){ try{ if(localStorage.getItem(key)===todayStr()) return; }catch(e){} }
  try{ localStorage.setItem(key, todayStr()); }catch(e){}
  const ev = {uid:me.uid||me.u, u:me.u, name:me.name||me.u, role:me.role, at:Date.now(), day:todayStr(), type, dev:devName()};
  if(cloud && fb){ try{ await fb.collection("logins").add(ev); }catch(e){} return; }
  try{ const a = localLogins(); a.push(ev); localStorage.setItem("sc_logins", JSON.stringify(a.slice(-600))); }catch(e){}
  loginsData = localLogins();
}
function beat(){
  if(!me) return;
  const pid = me.uid || me.u;
  const pr = {uid:pid, u:me.u, name:me.name||me.u, role:me.role, lastSeen:Date.now(), since:sessionSince, offline:false};
  if(cloud && fb) fb.doc("presence/"+pid).set(pr).catch(()=>{}); else presence[pid] = pr;
}
function startPresence(){
  sessionSince = Date.now(); beat(); clearInterval(hbTimer);
  hbTimer = setInterval(() => { if(document.visibilityState==="visible") beat(); }, 60000);
  if(!cloud) loginsData = localLogins();
}
function softRender(){ if($("#scrim") || $(".lightbox")) return; const a = document.activeElement; if(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; render(); }
setInterval(() => { if(me && view==="tablero") softRender(); }, 30000);

/* ---------- Métricas ---------- */
const sumAmt = l => l.reduce((t,x) => t + (x.amt||0), 0);
function payments(){
  const out = [];
  for(const o of orders){
    const ab = r2(o.abono||0);
    if(ab>0) out.push({at:o.createdAt, amt:ab, method:o.method||"Efectivo", o, kind:"abono"});
    if(o.deliveredAt){
      const col = o.cobradoEntrega!=null ? r2(o.cobradoEntrega) : Math.max(0, r2((o.total||0) - ab));
      if(col>0) out.push({at:o.deliveredAt, amt:col, method:o.methodFinal||o.method||"Efectivo", o, kind:"saldo"});
    }
  }
  return out;
}
const STAGE_SEG = [
  ["recibido","Espera para producir","createdAt","produccionAt"],
  ["produccion","Producción","produccionAt","readyAt"],
  ["listo","Espera de retiro","readyAt","deliveredAt"]
];
function stageStats(list){
  return STAGE_SEG.map(([k,l,a,b]) => {
    const v = list.map(o => (o[a] && o[b]) ? o[b]-o[a] : null).filter(x => x!=null && x>=0 && x<90*DAY).sort((x,y) => x-y);
    return {k, l, n:v.length, avg: v.length ? v.reduce((t,x) => t+x, 0)/v.length : 0, med: v.length ? v[Math.floor(v.length/2)] : 0, max: v.length ? v[v.length-1] : 0};
  });
}
function fmtDur(ms){
  if(!ms || ms<0) return "—";
  const m = ms/60000;
  if(m<60) return Math.max(1, Math.round(m)) + " min";
  const h = m/60;
  if(h<48) return (h<10 ? h.toFixed(1).replace(".",",") : Math.round(h)) + " h";
  return (h/24).toFixed(1).replace(".",",") + " días";
}
const stageStart = o => o.status==="listo" ? (o.readyAt||o.createdAt) : (PROC.includes(o.status) ? (o[o.status+"At"]||o.createdAt) : o.createdAt);
const fmtHour = ms => new Date(ms).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
function onTime(o){
  if(!o.readyAt || !o.dueDate) return null;
  const d = new Date(o.readyAt); const s = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  return s <= o.dueDate;
}
function staffStats(list){
  const st = {};
  const add = (u, f) => { if(!u) return; (st[u] = st[u] || {u, recibidos:0, etapas:0, entregas:0})[f]++; };
  list.forEach(o => { add(o.createdBy,"recibidos"); ["produccion","listo"].forEach(k => add(o[k+"By"],"etapas")); add(o.deliveredBy,"entregas"); });
  return Object.values(st);
}
const userName = u => { const f = users().find(x => x.u===u); return f ? f.name : u; };
function barRows(rows, fmtV){
  const mx = Math.max(...rows.map(r => r.v), 1); const top = rows.reduce((b,r) => r.v>b ? r.v : b, 0);
  return `<div class="bars">${rows.map(r => `<div class="bar ${r.v===top&&r.v>0?"top":""}" style="grid-template-columns:118px 1fr 74px" title="${esc(r.l)}: ${fmtV(r.v)}${r.sub?" · "+r.sub:""}"><span>${esc(r.l)}</span><div class="track"><div class="fill" style="width:${r.v/mx*100}%"></div></div><span class="v">${fmtV(r.v)}</span></div>`).join("")}</div>`;
}

/* ---------- Vista: Tablero (admin) ---------- */
function viewTablero(){
  const now = Date.now(), d0 = new Date(); d0.setHours(0,0,0,0); const T = d0.getTime();
  const active = orders.filter(o => o.status!=="entregado");
  const today = orders.filter(o => o.createdAt>=T);
  const payT = payments().filter(p => p.at>=T);
  const cobr = sumAmt(payT), tra = sumAmt(payT.filter(p => p.method==="Transferencia")), efe = cobr - tra;
  const porCobrar = active.reduce((t,o) => t+saldo(o), 0);
  const listos = orders.filter(o => o.status==="listo");
  const porCobrarListos = listos.reduce((t,o) => t+saldo(o), 0);
  const delivT = orders.filter(o => o.deliveredAt && o.deliveredAt>=T).length;
  const late = active.filter(o => dueLevel(o)==="late").length;
  // Etapas en vivo
  const SB = [["recibido","📥 Por producir","--recv"],["produccion","🧼 En producción","--prod"]];
  const live = SB.map(([k,l,c]) => { const L = active.filter(o => o.status===k); const w = L.map(o => now-stageStart(o)); return {k, l, c, n:L.length, avg: w.length ? w.reduce((t,x)=>t+x,0)/w.length : 0, max: w.length ? Math.max(...w) : 0}; });
  const worst = live.filter(x => x.n).sort((a,b) => (b.avg*b.n)-(a.avg*a.n))[0];
  const attn = active.filter(o => ["late","today","tomorrow"].includes(dueLevel(o))).sort((a,b) => (a.dueDate||"").localeCompare(b.dueDate||"") || a.createdAt-b.createdAt).slice(0,8);
  // Personal
  const todayStrV = todayStr();
  const staff = users().map(u => {
    const pid = u.uid || u.u, pr = presence[pid];
    const evs = loginsData.filter(e => e.u===u.u && e.day===todayStrV).sort((a,b) => a.at-b.at);
    const on = pr && !pr.offline && now - pr.lastSeen < 3*60000;
    const ss = staffStats(orders.filter(o => [o.createdAt,o.produccionAt,o.readyAt,o.deliveredAt].some(t => t && t>=T))).find(x => x.u===u.u);
    const work = ss ? (ss.recibidos + ss.etapas + ss.entregas) : 0;
    return {u, on, first: evs[0] ? evs[0].at : null, last: pr ? pr.lastSeen : null, work};
  });
  // Tiempos 30 días
  const P30 = orders.filter(o => o.createdAt >= now-30*DAY);
  const ss30 = stageStats(P30);
  const lead = P30.filter(o => o.readyAt).map(o => o.readyAt-o.createdAt);
  const ot = P30.map(onTime).filter(x => x!=null); const otPct = ot.length ? ot.filter(Boolean).length/ot.length*100 : null;
  const slow = ss30.slice(0,2).filter(x => x.n).sort((a,b) => b.avg-a.avg)[0];
  return `<div class="listhead"><h2>Tablero</h2><span class="live"><i></i> En vivo · ${fmtHour(now)}</span></div>
  ${reportBtns(true)}
  <div class="kpis">
    <div class="kpi hero"><span>Cobrado hoy (caja)</span><b>${money(cobr)}</b><small>Efectivo ${money(efe)} · Transferencia ${money(tra)}</small>
      ${cobr?`<div class="split" aria-hidden="true"><i style="width:${efe/cobr*100}%;background:#ffffff"></i><i style="width:${tra/cobr*100}%;background:color-mix(in srgb,#ffffff 45%,transparent)"></i></div>`:""}</div>
    <div class="kpi"><span>Ventas de hoy</span><b>${money(today.reduce((t,o)=>t+(o.total||0),0))}</b><small>${today.length} pedido${today.length===1?"":"s"} nuevo${today.length===1?"":"s"}</small></div>
    <div class="kpi ${porCobrar>0?"warn":""}"><span>Falta por cobrar</span><b>${money(porCobrar)}</b><small>${money(porCobrarListos)} en pedidos listos</small></div>
    <div class="kpi"><span>En taller</span><b>${active.length - listos.length}</b><small>${late?`<span class="late">${late} atrasado${late===1?"":"s"}</span>`:"ninguno atrasado"}</small></div>
    <div class="kpi"><span>Listos sin retirar</span><b>${listos.length}</b><small>${delivT} entregado${delivT===1?"":"s"} hoy</small></div>
    <div class="kpi"><span>A tiempo (30 días)</span><b>${otPct==null?"—":otPct.toFixed(0)+"%"}</b><small>listos antes de la fecha</small></div>
    ${(() => { const R = monthRange("mes"), g = sumExp(expIn(R.a, R.b)), v = r2(orders.filter(o => o.createdAt>=R.a).reduce((t,o) => t+(o.total||0), 0));
      return `<button class="kpi ${v-g<0?"warn":""}" data-go="gastos" style="text-align:left"><span>Gastos del mes</span><b>${money(g)}</b><small>resultado ${money(v-g)}</small></button>`; })()}
  </div>
  ${lowSupplies().length ? `<button class="alertbar" data-go="gastos">🧴 <span><b>${lowSupplies().length} insumo${lowSupplies().length===1?"":"s"} por acabarse:</b> ${lowSupplies().map(x => esc(x.name)).join(", ")}</span></button>` : ""}

  <h3 class="sec">Operación en tiempo real</h3>
  <div class="stagebar" style="grid-template-columns:repeat(2,1fr)">${live.map(x => `<div style="--c:var(${x.c})" title="${x.n} pedidos · promedio ${fmtDur(x.avg)} en esta etapa"><span>${x.l}</span><b>${x.n}</b><small>${x.n?"prom. "+fmtDur(x.avg):"vacío"}</small></div>`).join("")}</div>
  ${worst?`<div class="bneck">⏳ <b>Cuello de botella ahora:</b> ${worst.l.replace(/^\S+\s/,"")} — ${worst.n} pedido${worst.n===1?"":"s"}, el más antiguo lleva ${fmtDur(worst.max)}.</div>`:""}
  <div class="panel pad"><b class="small">Requieren atención</b>
    ${attn.length ? attn.map(o => `<button class="attn" data-open="${esc(o.id)}"><span><span class="num">${esc(o.num)}</span> ${esc(o.name)}<br><span class="small muted">${ST[o.status].ic} ${ST[o.status].l} · hace ${fmtDur(now-stageStart(o))} en esta etapa</span></span>${flagHTML(o)}</button>`).join("") : `<p class="small muted" style="margin:6px 0 0">Nada urgente. Ningún pedido vence hoy ni mañana.</p>`}
  </div>

  <h3 class="sec">Personal hoy</h3>
  <div class="panel pad scroll"><table class="t"><thead><tr><th>Persona</th><th>Entrada</th><th>Última actividad</th><th class="r">Tareas hoy</th></tr></thead><tbody>
    ${staff.map(x => `<tr><td><span class="dot ${x.on?"on":""}" title="${x.on?"En línea":"Desconectado"}"></span><b>${esc(x.u.name||x.u.u)}</b><br><span class="rolepill r-${x.u.role}">${ROLE[x.u.role]}</span></td><td>${x.first?fmtHour(x.first):'<span class="muted">—</span>'}</td><td>${x.last?(x.on?"En línea":fmtHour(x.last)+(x.last<T?" ("+fmtDate(x.last)+")":"")):'<span class="muted">—</span>'}</td><td class="r">${x.work}</td></tr>`).join("")}
  </tbody></table><p class="small muted" style="margin:8px 0 0">El punto verde indica que está en línea ahora. "Tareas" cuenta pedidos recibidos, etapas avanzadas y entregas.</p></div>

  <h3 class="sec">Tiempo por etapa · últimos 30 días</h3>
  <div class="panel pad">${barRows(ss30.map(x => ({l:x.l, v:x.avg, sub:x.n+" pedidos"})), fmtDur)}
    <p class="small muted" style="margin:10px 0 0">Del ingreso a listo: <b>${fmtDur(lead.length?lead.reduce((t,x)=>t+x,0)/lead.length:0)}</b> en promedio.${slow?` La etapa más lenta en el taller es <b>${slow.l}</b>.`:""}</p></div>
  <button class="btn ghost block" data-go="analisis" style="margin-top:6px">Ver análisis completo</button>`;
}

/* ---------- PDF (generador propio, funciona sin internet) ---------- */
const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const pdfTxt = s => String(s==null?"":s).replace(/[–—]/g,"-").replace(/…/g,"...").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/•/g,"\x95").replace(/[^\x20-\x7e\x95\xa0-\xff]/g,"").trim();
function pdfW(s, size, bold){
  let w = 0;
  for(const ch of pdfTxt(s)){ let c = ch.charCodeAt(0); if(c>126) c = (ch.normalize("NFD").charCodeAt(0)||110); w += HW[c-32] || 556; }
  return w * size / 1000 * (bold ? 1.06 : 1);
}
function pdfWrap(s, size, maxW, bold){
  const out = []; let line = "";
  for(const word of pdfTxt(s).split(/\s+/)){ const t = line ? line+" "+word : word; if(pdfW(t,size,bold) > maxW && line){ out.push(line); line = word; } else line = t; }
  if(line) out.push(line); return out;
}
class MiniPDF {
  constructor(){ this.pages = []; this.W = 595; this.H = 842; this.addPage(); }
  addPage(){ this.cur = []; this.pages.push(this.cur); }
  rgb(hex){ const n = parseInt(hex.replace("#",""),16); return [(n>>16)/255,((n>>8)&255)/255,(n&255)/255].map(x=>x.toFixed(3)).join(" "); }
  text(x, y, s, o={}){
    const size = o.size||10, t = pdfTxt(s); if(!t) return;
    if(o.align==="right") x -= pdfW(t,size,o.bold); else if(o.align==="center") x -= pdfW(t,size,o.bold)/2;
    const esc = t.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
    this.cur.push(`BT ${this.rgb(o.color||"#0c2f4b")} rg /${o.bold?"F2":"F1"} ${size} Tf ${x.toFixed(2)} ${(this.H-y).toFixed(2)} Td (${esc}) Tj ET`);
  }
  rect(x, y, w, h, fill){ this.cur.push(`${this.rgb(fill)} rg ${x.toFixed(2)} ${(this.H-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  line(x1, y1, x2, y2, color, w){ this.cur.push(`${this.rgb(color||"#d5e3ee")} RG ${w||0.7} w ${x1.toFixed(2)} ${(this.H-y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H-y2).toFixed(2)} l S`); }
  bytes(){
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    add("<< /Type /Catalog /Pages 2 0 R >>"); add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = this.pages.map(p => { const c = p.join("\n"); const cid = add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
      return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`); });
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k=>k+" 0 R").join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n"; const offs = [];
    objs.forEach((o,i) => { offs.push(out.length); out += `${i+1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n` + offs.map(n => String(n).padStart(10,"0")+" 00000 n \n").join("");
    out += `trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const b = new Uint8Array(out.length); for(let i=0;i<out.length;i++) b[i] = out.charCodeAt(i) & 255; return b;
  }
}
// Arma un informe con encabezado, secciones, tarjetas de indicadores y tablas
function reportPDF(title, subtitle){
  const pdf = new MiniPDF(), M = 40, CW = 595 - 2*M, BRAND = "#2580bf", MUT = "#5b7184";
  let y = 0;
  const header = () => {
    pdf.rect(0, 0, 595, 70, BRAND);
    pdf.text(M, 30, settings.business, {size:18, bold:true, color:"#ffffff"});
    pdf.text(M, 50, title, {size:11, color:"#ffffff"});
    pdf.text(595-M, 30, subtitle, {size:10, bold:true, color:"#ffffff", align:"right"});
    pdf.text(595-M, 50, "Generado " + new Date().toLocaleString("es-EC",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) + (me ? " · " + (me.name||me.u) : ""), {size:8, color:"#ffffff", align:"right"});
    y = 92;
  };
  const need = h => { if(y + h > 800){ pdf.addPage(); header(); } };
  header();
  const R = {
    pdf,
    section(t){ need(40); y += 8; pdf.rect(M, y, 4, 14, BRAND); pdf.text(M+10, y+11, t, {size:12, bold:true}); y += 24; },
    kpis(items){ // [{l, v, s}]
      const per = 3, gap = 8, w = (CW - gap*(per-1))/per, h = 54;
      for(let i=0;i<items.length;i+=per){
        need(h+gap);
        items.slice(i,i+per).forEach((k,j) => { const x = M + j*(w+gap);
          pdf.rect(x, y, w, h, k.warn ? "#fff1e0" : "#eef5fb");
          pdf.text(x+10, y+15, k.l, {size:8, color:MUT});
          pdf.text(x+10, y+34, k.v, {size:15, bold:true, color: k.warn ? "#b35f00" : "#0c2f4b"});
          if(k.s) pdf.text(x+10, y+47, k.s, {size:7.5, color:MUT}); });
        y += h + gap;
      }
      y += 4;
    },
    table(cols, rows){ // cols: [{l, w (fracción), r}]
      const xs = []; let acc = M; cols.forEach(c => { xs.push(acc); acc += c.w*CW; });
      const head = () => { need(22); pdf.rect(M, y, CW, 18, "#eef5fb"); cols.forEach((c,i) => pdf.text(c.r ? xs[i]+c.w*CW-6 : xs[i]+6, y+12.5, c.l, {size:8, bold:true, color:MUT, align:c.r?"right":"left"})); y += 18; };
      head();
      if(!rows.length){ pdf.text(M+6, y+14, "Sin registros", {size:9, color:MUT}); y += 22; return; }
      rows.forEach(r => {
        if(y + 17 > 800){ pdf.addPage(); header(); head(); }
        cols.forEach((c,i) => { let t = pdfTxt(r[i]); const max = c.w*CW-12; while(t.length>1 && pdfW(t,9,r.bold) > max) t = t.slice(0,-1); pdf.text(c.r ? xs[i]+c.w*CW-6 : xs[i]+6, y+12, t, {size:9, bold:!!r.bold, align:c.r?"right":"left"}); });
        y += 17; pdf.line(M, y, M+CW, y);
      });
      y += 10;
    },
    para(t, o={}){ pdfWrap(t, o.size||9.5, CW - (o.indent||0), o.bold).forEach(l => { need(14); pdf.text(M + (o.indent||0), y+10, l, {size:o.size||9.5, bold:o.bold, color:o.color}); y += 13.5; }); y += 3; },
    bullets(list){ list.forEach(t => { need(14); pdf.text(M+4, y+10, "•", {size:10, color:BRAND, bold:true}); const ls = pdfWrap(t, 9.5, CW-16); ls.forEach((l,i) => { if(i) need(14); pdf.text(M+16, y+10, l, {size:9.5}); y += 13.5; }); y += 2; }); y += 4; },
    space(h){ y += h; },
    signature(labels){ need(70); y += 40; const w = (CW-40)/labels.length; labels.forEach((l,i) => { const x = M + i*(w+40); pdf.line(x, y, x+w, y, "#0c2f4b", 0.8); pdf.text(x+w/2, y+13, l, {size:8.5, color:MUT, align:"center"}); }); y += 24; },
    finish(){ const n = pdf.pages.length; pdf.pages.forEach((p,i) => { pdf.cur = p; pdf.text(595/2, 825, `${settings.business} · Página ${i+1} de ${n}`, {size:7.5, color:MUT, align:"center"}); }); return pdf.bytes(); }
  };
  return R;
}

/* ---------- Reportes: datos ---------- */
const dayStart = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d).getTime(); };
const pctTxt = (a,b) => !b ? "" : (a>=b?"+":"") + ((a-b)/b*100).toFixed(0) + "% vs periodo anterior";
const fmtDay = ms => new Date(ms).toLocaleDateString("es-EC",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
const REPORT_PERIODS = [["hoy","Hoy"],["7","7 días"],["30","30 días"],["mes","Este mes"],["mesant","Mes anterior"]];
function periodRange(k){
  const d0 = new Date(); d0.setHours(0,0,0,0); const T = d0.getTime(), end = T + DAY;
  if(k==="hoy") return {a:T, b:end, l:"Hoy, " + fmtDate(T,{day:"numeric",month:"long",year:"numeric"})};
  if(k==="7"||k==="30"){ const n = +k; return {a:end - n*DAY, b:end, l:`Últimos ${n} días (${fmtDate(end-n*DAY)} – ${fmtDate(T)})`}; }
  const m0 = new Date(d0.getFullYear(), d0.getMonth() - (k==="mesant"?1:0), 1).getTime();
  const m1 = new Date(d0.getFullYear(), d0.getMonth() + (k==="mesant"?0:1), 1).getTime();
  const name = new Date(m0).toLocaleDateString("es-EC",{month:"long",year:"numeric"});
  return {a:m0, b:k==="mesant"?m1:end, l:name.charAt(0).toUpperCase()+name.slice(1) + (k==="mes"?" (hasta hoy)":"")};
}
function execData(k, limited){
  const {a, b, l} = periodRange(k), len = b - a;
  const inR = (t,x=a,y=b) => t && t>=x && t<y;
  const P = orders.filter(o => inR(o.createdAt)), Q = orders.filter(o => inR(o.createdAt, a-len, a));
  const sales = P.reduce((t,o)=>t+(o.total||0),0), prevSales = Q.reduce((t,o)=>t+(o.total||0),0);
  const pays = payments().filter(p => inR(p.at)), cobr = sumAmt(pays), tra = sumAmt(pays.filter(p => p.method==="Transferencia"));
  const active = orders.filter(o => o.status!=="entregado");
  const porCobrar = active.reduce((t,o)=>t+saldo(o),0);
  const firstSeen = {}; orders.forEach(o => { if(o.phoneKey && (!(o.phoneKey in firstSeen) || o.createdAt<firstSeen[o.phoneKey])) firstSeen[o.phoneKey] = o.createdAt; });
  const keys = new Set(P.map(o=>o.phoneKey).filter(Boolean)), newC = [...keys].filter(x => firstSeen[x]>=a).length;
  const deliv = orders.filter(o => inR(o.deliveredAt));
  const ot = orders.filter(o => inR(o.readyAt)).map(onTime).filter(x => x!=null); const otPct = ot.length ? ot.filter(Boolean).length/ot.length*100 : null;
  const readyP = orders.filter(o => inR(o.readyAt)); const lead = readyP.length ? readyP.reduce((t,o)=>t+(o.readyAt-o.createdAt),0)/readyP.length : 0;
  const ss = stageStats(orders.filter(o => inR(o.createdAt) || inR(o.readyAt)));
  const slow = ss.slice(0,2).filter(x => x.n).sort((x,y) => y.avg-x.avg)[0];
  const prod = {}; P.forEach(o => (o.items||[]).forEach(i => { const p = prod[i.label] || (prod[i.label] = {qty:0, rev:0}); p.qty += i.qty; p.rev += i.qty*i.price; }));
  const prodArr = Object.entries(prod).sort((x,y) => y[1].rev-x[1].rev);
  const st = {}; const addS = (u,f) => { if(!u) return; (st[u] = st[u] || {u, recibidos:0, etapas:0, entregas:0})[f]++; };
  orders.forEach(o => { if(inR(o.createdAt)) addS(o.createdBy,"recibidos"); ["produccion","listo"].forEach(s => { const t = s==="listo" ? o.readyAt : o[s+"At"]; if(inR(t)) addS(o[s+"By"],"etapas"); }); if(inR(o.deliveredAt)) addS(o.deliveredBy,"entregas"); });
  const staff = limited ? [] : Object.values(st).sort((x,y) => (y.recibidos+y.etapas+y.entregas)-(x.recibidos+x.etapas+x.entregas));
  const late = active.filter(o => dueLevel(o)==="late").length, listos = active.filter(o => o.status==="listo");
  const discounts = P.reduce((t,o)=>t+(o.discount||0),0);
  const notes = [];
  if(prevSales) notes.push(sales>=prevSales ? `Las ventas crecieron ${((sales-prevSales)/prevSales*100).toFixed(0)}% frente al periodo anterior.` : `Las ventas bajaron ${((prevSales-sales)/prevSales*100).toFixed(0)}% frente al periodo anterior: conviene activar a clientes inactivos desde Clientes.`);
  if(porCobrar>0) notes.push(`Hay ${money(porCobrar)} por cobrar en pedidos activos${listos.length?`, de los cuales ${money(listos.reduce((t,o)=>t+saldo(o),0))} están en ${listos.length} pedido${listos.length===1?"":"s"} listo${listos.length===1?"":"s"} para retirar`:""}.`);
  if(otPct!=null) notes.push(otPct>=90 ? `Cumplimiento de entrega de ${otPct.toFixed(0)}%: el taller cumple las fechas prometidas.` : `Cumplimiento de entrega de ${otPct.toFixed(0)}%, por debajo de la meta de 90%. Revisar la etapa más lenta${slow?` (${slow.l})`:""}.`);
  if(late) notes.push(`${late} pedido${late===1?"":"s"} atrasado${late===1?"":"s"} a la fecha de este reporte.`);
  if(keys.size) notes.push(`${keys.size - newC} de ${keys.size} clientes atendidos ya habían venido antes (${((keys.size-newC)/keys.size*100).toFixed(0)}% de recompra).`);
  if(prodArr[0]) notes.push(`Servicio con más ingresos: ${prodArr[0][0]} (${money(prodArr[0][1].rev)}, ${prodArr[0][1].qty} unidades).`);
  const G = limited ? [] : expenses.filter(e => inR(expDayTs(e))), gastos = sumExp(G);
  const gCat = EXP_CATS.map(([k2,,l2]) => [l2, sumExp(G.filter(e => e.cat===k2))]).filter(x => x[1]>0).sort((x,y) => y[1]-x[1]);
  if(!limited && gastos) notes.push(`Gastos del periodo: ${money(gastos)}${gCat[0] ? ` (el mayor: ${gCat[0][0].toLowerCase()}, ${money(gCat[0][1])})` : ""}. Resultado estimado: ${money(sales - gastos)}.`);
  if(!limited && lowSupplies().length) notes.push(`Insumos por acabarse: ${lowSupplies().map(x => x.name).join(", ")}.`);
  return {k, l, limited:!!limited, gastos, gCat, result: r2(sales - gastos), P, sales, prevSales, n:P.length, prevN:Q.length, avg: P.length ? sales/P.length : 0, cobr, tra, efe: cobr-tra, nPays:pays.length, porCobrar, clients:keys.size, newC, deliv:deliv.length, otPct, lead, ss, slow, prodArr, staff, late, listos:listos.length, taller:active.length-listos.length, discounts, notes};
}
function cierreData(day){
  const a = dayStart(day), b = a + DAY, inR = t => t && t>=a && t<b;
  const pays = payments().filter(p => inR(p.at)).sort((x,y) => x.at-y.at);
  const cobr = sumAmt(pays), tra = sumAmt(pays.filter(p => p.method==="Transferencia"));
  const rec = orders.filter(o => inR(o.createdAt)), del = orders.filter(o => inR(o.deliveredAt));
  const listos = orders.filter(o => o.status==="listo"), active = orders.filter(o => o.status!=="entregado");
  const gastos = expenses.filter(e => e.day===day).sort((x,y) => (x.at||0)-(y.at||0)), gEfe = sumExp(gastos.filter(e => e.method==="Efectivo"));
  const gVisible = isAdmin() || !cloud || day >= todayStr(-1); // recepción ve los gastos de las últimas 48 horas
  return {day, a, pays, cobr, tra, efe: cobr-tra, gastos, gTot: sumExp(gastos), gEfe, gTra: r2(sumExp(gastos) - gEfe), efeCaja: r2(cobr - tra - gEfe), gVisible, abonos: sumAmt(pays.filter(p=>p.kind==="abono")), saldos: sumAmt(pays.filter(p=>p.kind==="saldo")),
    rec: rec.length, ventas: rec.reduce((t,o)=>t+(o.total||0),0), del: del.length, listos: listos.length, porCobrarListos: listos.reduce((t,o)=>t+saldo(o),0),
    taller: active.length - listos.length, late: active.filter(o => dueLevel(o)==="late").length};
}

/* ---------- Reportes: PDF y WhatsApp ---------- */
function execPDF(d){
  const R = reportPDF("Resumen ejecutivo", d.l);
  R.section("Ventas y caja");
  R.kpis([
    {l:"Ventas del periodo", v:money(d.sales), s:pctTxt(d.sales,d.prevSales) || `${d.n} pedidos`},
    {l:"Pedidos", v:String(d.n), s:pctTxt(d.n,d.prevN) || "registrados"},
    {l:"Ticket promedio", v:money(d.avg), s:"por pedido"},
    {l:"Cobrado (caja)", v:money(d.cobr), s:`${d.nPays} cobros`},
    {l:"Efectivo / Transferencia", v:`${money(d.efe)} / ${money(d.tra)}`, s:d.cobr?`${(d.efe/d.cobr*100).toFixed(0)}% en efectivo`:""},
    {l:"Falta por cobrar", v:money(d.porCobrar), s:"pedidos activos", warn:d.porCobrar>0},
  ]);
  R.section("Clientes y operación");
  R.kpis([
    {l:"Clientes atendidos", v:String(d.clients), s:`${d.newC} nuevos · ${d.clients-d.newC} recurrentes`},
    {l:"Entregados", v:String(d.deliv), s:"en el periodo"},
    {l:"Cumplimiento de entrega", v:d.otPct==null?"-":d.otPct.toFixed(0)+"%", s:"listos antes de la fecha", warn:d.otPct!=null&&d.otPct<90},
    {l:"Ingreso a listo", v:fmtDur(d.lead), s:"tiempo promedio"},
    {l:"En taller / listos", v:`${d.taller} / ${d.listos}`, s:d.late?`${d.late} atrasados`:"ninguno atrasado", warn:d.late>0},
    {l:"Descuentos fidelidad", v:money(d.discounts), s:"otorgados"},
  ]);
  if(!d.limited){
    R.section("Gastos y resultado");
    R.kpis([
      {l:"Ventas del periodo", v:money(d.sales), s:`${d.n} pedidos`},
      {l:"Gastos del periodo", v:money(d.gastos), s:d.gCat.length ? `${d.gCat.length} tipos de gasto` : "sin gastos registrados"},
      {l:"Resultado estimado", v:money(d.result), s:"ventas - gastos", warn:d.result<0},
    ]);
    if(d.gCat.length) R.table([{l:"Tipo de gasto",w:.6},{l:"Monto",w:.4,r:1}], d.gCat.map(([n,v]) => [n, money(v)]));
  }
  R.section("Hallazgos");
  R.bullets(d.notes.length ? d.notes : ["Sin datos suficientes en el periodo."]);
  R.section("Servicios");
  R.table([{l:"Servicio",w:.5},{l:"Unidades",w:.2,r:1},{l:"Ingresos",w:.3,r:1}], d.prodArr.map(([n,p]) => [n, p.qty, money(p.rev)]));
  R.section("Tiempo por etapa");
  R.table([{l:"Etapa",w:.4},{l:"Pedidos",w:.2,r:1},{l:"Promedio",w:.2,r:1},{l:"Máximo",w:.2,r:1}], d.ss.map(s => [s.l, s.n, fmtDur(s.avg), fmtDur(s.max)]));
  if(d.limited) return R.finish();
  R.section("Personal");
  R.table([{l:"Persona",w:.4},{l:"Recibidos",w:.2,r:1},{l:"Etapas",w:.2,r:1},{l:"Entregas",w:.2,r:1}], d.staff.map(s => [userName(s.u), s.recibidos, s.etapas, s.entregas]));
  return R.finish();
}
function execMsg(d){
  return `📊 *Resumen ejecutivo · ${settings.business}*\n${d.l}\n\n💰 Ventas: *${money(d.sales)}* (${d.n} pedidos)${d.prevSales?` · ${pctTxt(d.sales,d.prevSales)}`:""}\n🧾 Ticket promedio: ${money(d.avg)}\n💵 Cobrado: *${money(d.cobr)}* (efectivo ${money(d.efe)} · transferencia ${money(d.tra)})\n📌 Por cobrar: ${money(d.porCobrar)}${d.limited?"":`\n💸 Gastos: ${money(d.gastos)} · resultado: *${money(d.result)}*`}\n\n👥 Clientes: ${d.clients} (${d.newC} nuevos)\n✅ Entregados: ${d.deliv} · a tiempo: ${d.otPct==null?"—":d.otPct.toFixed(0)+"%"}\n⏱️ Ingreso a listo: ${fmtDur(d.lead)}\n🏭 En taller: ${d.taller} · listos: ${d.listos}${d.late?` · ⚠️ ${d.late} atrasados`:""}\n\n${d.notes.slice(0,4).map(n=>"• "+n).join("\n")}`;
}
function cierrePDF(d, x){
  const R = reportPDF("Cierre de caja y resumen de operación", fmtDate(d.a,{day:"numeric",month:"long",year:"numeric"}));
  R.para(fmtDay(d.a).replace(/^./, c => c.toUpperCase()) + " · Responsable: " + (me ? (me.name||me.u) : "-"), {color:"#5b7184"});
  R.section("Caja");
  const diff = x.contado==null ? null : r2(x.contado - d.efeCaja);
  R.kpis([
    {l:"Total cobrado", v:money(d.cobr), s:`${d.pays.length} cobros`},
    {l:"Cobros en efectivo", v:money(d.efe), s:`abonos ${money(d.abonos)} · saldos ${money(d.saldos)}`},
    {l:"Transferencias", v:money(d.tra), s:"verificar en el banco"},
    {l:"Gastos en efectivo", v:money(d.gEfe), s:d.gVisible?`${d.gastos.length} gastos del día`:"solo los ve el administrador"},
    {l:"Efectivo que debe haber", v:money(d.efeCaja), s:"cobros en efectivo - gastos"},
    {l:"Efectivo contado", v:x.contado==null?"-":money(x.contado), s:diff==null?"no registrado":diff===0?"cuadra":(diff>0?"sobrante ":"faltante ")+money(Math.abs(diff)), warn:diff!=null&&diff!==0},
  ]);
  R.section("Operación del día");
  R.kpis([
    {l:"Pedidos recibidos", v:String(d.rec), s:`ventas ${money(d.ventas)}`},
    {l:"Pedidos entregados", v:String(d.del), s:"retirados por clientes"},
    {l:"Listos sin retirar", v:String(d.listos), s:`${money(d.porCobrarListos)} por cobrar`, warn:d.porCobrarListos>0},
    {l:"En taller", v:String(d.taller), s:d.late?`${d.late} atrasados`:"ninguno atrasado", warn:d.late>0},
  ]);
  R.section("Detalle de cobros");
  R.table([{l:"Hora",w:.11},{l:"N°",w:.13},{l:"Cliente",w:.32},{l:"Concepto",w:.16},{l:"Medio",w:.14},{l:"Monto",w:.14,r:1}],
    d.pays.map(p => [new Date(p.at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit",hour12:false}), p.o.num, p.o.name, p.kind==="abono"?"Abono":"Saldo", p.method, money(p.amt)]).concat(d.pays.length ? [Object.assign(["","","","","TOTAL",money(d.cobr)],{bold:true})] : []));
  if(d.gVisible){
    R.section("Gastos del día");
    R.table([{l:"Hora",w:.11},{l:"Tipo",w:.17},{l:"Descripción",w:.4},{l:"Pago",w:.16},{l:"Monto",w:.16,r:1}],
      d.gastos.map(e => [e.at ? new Date(e.at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit",hour12:false}) : "", catInfo(e.cat)[2], e.desc, e.method, money(e.amount)]).concat(d.gastos.length ? [Object.assign(["","","","TOTAL",money(d.gTot)],{bold:true})] : []));
  }
  if(x.obs){ R.section("Observaciones"); R.para(x.obs); }
  R.signature(["Entrega: " + (me ? (me.name||me.u) : ""), "Recibe / revisa"]);
  return R.finish();
}
function cierreMsg(d, x){
  const diff = x.contado==null ? null : r2(x.contado - d.efeCaja);
  return `🧾 *Cierre de caja · ${settings.business}*\n${fmtDay(d.a)}\nResponsable: ${me?(me.name||me.u):""}\n\n💵 Total cobrado: *${money(d.cobr)}* (${d.pays.length} cobros)\n• Efectivo: ${money(d.efe)}\n• Transferencia: ${money(d.tra)}\n• Abonos: ${money(d.abonos)} · Saldos: ${money(d.saldos)}${d.gVisible?`\n💸 Gastos: ${money(d.gTot)} (efectivo ${money(d.gEfe)})`:""}\n💰 *Efectivo que debe haber: ${money(d.efeCaja)}*${x.contado!=null?`\n🔢 Efectivo contado: ${money(x.contado)} → ${diff===0?"✅ cuadra":(diff>0?"sobrante ":"⚠️ faltante ")+money(Math.abs(diff))}`:""}\n\n📥 Recibidos: ${d.rec} (ventas ${money(d.ventas)})\n🤝 Entregados: ${d.del}\n✅ Listos sin retirar: ${d.listos} (${money(d.porCobrarListos)} por cobrar)\n🏭 En taller: ${d.taller}${d.late?` · ⚠️ ${d.late} atrasados`:""}${x.obs?`\n\n📝 ${x.obs}`:""}`;
}
const reportWa = msg => "https://wa.me/" + (digits(settings.reportPhone) ? waNumber(settings.reportPhone) : "") + "?text=" + encodeURIComponent(msg);
async function sharePDF(bytes, filename, text){
  const file = new File([bytes], filename, {type:"application/pdf"});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:filename, text}); return; }
  }catch(e){ if(e && e.name==="AbortError") return; }
  await saveFile(filename, bytes, "application/pdf");
  toast("PDF descargado. Adjúntalo en WhatsApp desde Descargas.");
}

/* ---------- Reportes: hojas ---------- */
let execPeriod = "hoy";
function execSheet(){
  const d = execData(execPeriod, !isAdmin());
  openSheet(`<h2>Resumen ejecutivo</h2>
    <div class="chips" role="group" aria-label="Periodo" style="margin:10px 0 12px">${REPORT_PERIODS.map(([k,l]) => `<button class="chip" data-rp="${k}" aria-pressed="${execPeriod===k}">${l}</button>`).join("")}</div>
    <p class="small muted" style="margin:0 0 10px">${esc(d.l)}</p>
    <div class="kpis"><div class="kpi"><span>Ventas</span><b>${money(d.sales)}</b><small>${d.n} pedidos${d.prevSales?" · "+pctTxt(d.sales,d.prevSales):""}</small></div>
      <div class="kpi"><span>Cobrado</span><b>${money(d.cobr)}</b><small>Efectivo ${money(d.efe)} · Transf. ${money(d.tra)}</small></div>
      <div class="kpi"><span>A tiempo</span><b>${d.otPct==null?"—":d.otPct.toFixed(0)+"%"}</b><small>${d.deliv} entregados</small></div>
      ${d.limited ? "" : `<div class="kpi ${d.result<0?"warn":""}"><span>Resultado</span><b>${money(d.result)}</b><small>gastos ${money(d.gastos)}</small></div>`}</div>
    <div class="stack">
      <button class="btn wa block" id="rpShare">${svgWA} Compartir PDF por WhatsApp</button>
      <a class="btn ghost block" id="rpText" href="${esc(reportWa(execMsg(d)))}" target="_blank" rel="noopener">Enviar resumen en texto</a>
      <button class="btn ghost block" id="rpDown">Descargar PDF</button>
      <button class="btn ghost block" data-close>Cerrar</button></div>`);
  $("#scrim").querySelectorAll("[data-rp]").forEach(b => b.onclick = () => { execPeriod = b.dataset.rp; execSheet(); });
  const fn = `resumen-ejecutivo-${execPeriod}-${todayStr()}.pdf`;
  $("#rpShare").onclick = () => sharePDF(execPDF(d), fn, `Resumen ejecutivo · ${settings.business} · ${d.l}`);
  $("#rpDown").onclick = () => saveFile(fn, execPDF(d), "application/pdf");
}
const cierreX = {day:null, contado:null, obs:""};
function cierreSheet(){
  if(!cierreX.day) cierreX.day = todayStr();
  const d = cierreData(cierreX.day);
  openSheet(`<h2>Cierre de caja</h2>
    <div class="field" style="margin-top:10px"><label for="cj_d">Día</label><input class="input" type="date" id="cj_d" value="${cierreX.day}" max="${todayStr()}"></div>
    <div class="kpis"><div class="kpi hero"><span>Total cobrado</span><b>${money(d.cobr)}</b><small>${d.pays.length} cobros</small></div>
      <div class="kpi"><span>Efectivo en caja</span><b>${money(d.efeCaja)}</b><small>cobros ${money(d.efe)} − gastos ${money(d.gEfe)}</small></div>
      <div class="kpi"><span>Transferencia</span><b>${money(d.tra)}</b><small>verificar en el banco</small></div></div>
    <p class="small muted" style="margin:-4px 0 6px">Recibidos ${d.rec} · Entregados ${d.del} · Listos sin retirar ${d.listos} · En taller ${d.taller}</p>
    ${d.efeCaja < 0 ? `<p class="small" style="margin:0 0 6px;color:var(--danger)">Los gastos en efectivo superan lo cobrado en efectivo: se pagaron con el fondo de caja u otro dinero. Anótalo en observaciones.</p>` : ""}
    <p class="small muted" style="margin:0 0 12px">${d.gVisible ? `Gastos del día: <b>${d.gastos.length}</b> · ${money(d.gTot)} (efectivo ${money(d.gEfe)}).` : "Los gastos de días anteriores solo los ve el administrador."}</p>
    <div class="field"><label for="cj_c">Efectivo contado en caja (opcional)</label><input class="input" id="cj_c" inputmode="decimal" placeholder="Ej. ${fmt2(Math.max(0, d.efeCaja))}" value="${cierreX.contado==null?"":fmt2(cierreX.contado)}"><small class="small" id="cj_diff"></small></div>
    <div class="field"><label for="cj_o">Observaciones (opcional)</label><textarea class="input" id="cj_o" rows="2" placeholder="Ej. se cambió un billete de $20">${esc(cierreX.obs)}</textarea></div>
    <div class="stack">
      <button class="btn wa block" id="cjShare">${svgWA} Compartir PDF por WhatsApp</button>
      <a class="btn ghost block" id="cjText" target="_blank" rel="noopener">Enviar resumen en texto</a>
      <button class="btn ghost block" id="cjDown">Descargar PDF</button>
      <button class="btn ghost block" data-close>Cerrar</button></div>`);
  const sync = () => {
    const raw = $("#cj_c").value.trim(); cierreX.contado = raw==="" ? null : r2(parseNum(raw)); cierreX.obs = $("#cj_o").value.trim();
    const diff = cierreX.contado==null ? null : r2(cierreX.contado - d.efeCaja), el = $("#cj_diff");
    el.textContent = diff==null ? "" : diff===0 ? "✅ Cuadra con el sistema" : (diff>0 ? "Sobrante " : "⚠️ Faltante ") + money(Math.abs(diff));
    el.style.color = diff ? "var(--danger)" : "";
    $("#cjText").href = reportWa(cierreMsg(d, cierreX));
  };
  $("#cj_c").oninput = sync; $("#cj_o").oninput = sync; sync();
  $("#cj_d").onchange = e => { if(e.target.value){ cierreX.day = e.target.value; cierreX.contado = null; cierreSheet(); } };
  const fn = () => `cierre-caja-${cierreX.day}.pdf`;
  $("#cjShare").onclick = () => { sync(); sharePDF(cierrePDF(d, cierreX), fn(), `Cierre de caja · ${settings.business} · ${cierreX.day}`); };
  $("#cjDown").onclick = () => { sync(); saveFile(fn(), cierrePDF(d, cierreX), "application/pdf"); };
}
const reportBtns = (exec) => exec ? `<div class="two" style="margin:0 0 14px"><button class="btn ghost block" data-report="exec">📊 Resumen ejecutivo</button><button class="btn ghost block" data-report="cierre">🧾 Cierre de caja</button></div>`
  : `<button class="btn ghost block" data-report="cierre" style="margin-bottom:14px">🧾 Cierre de caja del día</button>`;

/* ---------- Gastos e inventario de insumos ---------- */
// Gastos: insumos, obligaciones (arriendo, servicios, impuestos, sueldos), almuerzos y otros.
// Administrador y recepción registran; solo el administrador corrige, borra y ve el mes.
// Los gastos en efectivo se restan del efectivo que debe haber en caja.
// Inventario: las compras de insumos suman stock; el uso diario y los conteos lo ajustan.
const EXP_CATS = [["insumos","🧴","Insumos"],["obligaciones","🏛️","Obligaciones"],["almuerzos","🍽️","Almuerzos"],["transporte","🛵","Transporte"],["mantenimiento","🔧","Mantenimiento"],["otros","📦","Otros"]];
const EXP_HINT = {insumos:"Ej. jabón neutro y cepillos", obligaciones:"Ej. arriendo de noviembre, luz, IESS, SRI", almuerzos:"Ej. almuerzo del personal", transporte:"Ej. entrega a domicilio", mantenimiento:"Ej. arreglo de la secadora", otros:"Describe el gasto"};
const catInfo = k => EXP_CATS.find(c => c[0]===k) || EXP_CATS[EXP_CATS.length-1];
const r3 = n => Math.round(((+n)||0)*1000)/1000;
const fmtQ = n => String(r3(n)).replace(".", ",");
let expenses = [], supplies = [], expMonth = "mes", expDraft = null;
function normExpense(e){
  const x = (e && typeof e === "object") ? e : {};
  return {id:STR(x.id,40).replace(/[^A-Za-z0-9_-]/g,""), day:DATE(x.day) || todayStr(), at:TS(x.at), cat:catInfo(x.cat)[0], desc:STR(x.desc,200), provider:STR(x.provider,100),
    amount:NUM(x.amount,100000), method:x.method==="Transferencia" ? "Transferencia" : "Efectivo", by:STR(x.by,60),
    lines:Array.isArray(x.lines) ? x.lines.slice(0,10).filter(l => l && typeof l === "object").map(l => ({sid:STR(l.sid,40), name:STR(l.name,80), qty:NUM(l.qty,1e6), unit:STR(l.unit,20)})) : []};
}
function normSupply(x){
  x = (x && typeof x === "object") ? x : {};
  return {id:STR(x.id,40).replace(/[^A-Za-z0-9_-]/g,""), name:STR(x.name,80), unit:STR(x.unit,20) || "unidades", stock:r3(NUM(x.stock,1e6)), min:r3(NUM(x.min,1e6)), updatedAt:TS(x.updatedAt)};
}
function saveLocalExp(){ if(cloud) return; try{ localStorage.setItem("sc_expenses", JSON.stringify(expenses.slice(0,3000))); localStorage.setItem("sc_supplies", JSON.stringify(supplies)); }catch(e){} }
function loadLocalExp(){ if(cloud) return; try{ expenses = (JSON.parse(localStorage.getItem("sc_expenses")||"[]")||[]).map(normExpense); supplies = (JSON.parse(localStorage.getItem("sc_supplies")||"[]")||[]).map(normSupply); }catch(e){} }
function localMoves(){ try{ return JSON.parse(localStorage.getItem("sc_moves")||"[]"); }catch(e){ return []; } }
function pushLocalMove(m){ try{ const a = localMoves(); a.push(m); localStorage.setItem("sc_moves", JSON.stringify(a.slice(-800))); }catch(e){} }
const fbInc = n => firebase.firestore.FieldValue.increment(n);
const expDayTs = e => dayStart(e.day) + 12*3600000;
function monthRange(k){
  const d = new Date(), m0 = new Date(d.getFullYear(), d.getMonth() - (k==="mesant"?1:0), 1), m1 = new Date(m0.getFullYear(), m0.getMonth()+1, 1);
  const name = m0.toLocaleDateString("es-EC",{month:"long",year:"numeric"});
  return {a:m0.getTime(), b:m1.getTime(), l:name.charAt(0).toUpperCase()+name.slice(1)};
}
const expIn = (a, b) => expenses.filter(e => { const t = expDayTs(e); return t>=a && t<b; });
const sumExp = L => r2(L.reduce((t,e) => t + e.amount, 0));
const lowSupplies = () => supplies.filter(x => x.min>0 && x.stock<=x.min);

async function addExpense(e){
  if(cloud && fb){
    const b = fb.batch();
    b.set(fb.collection("expenses").doc(e.id), e);
    for(const l of e.lines){ const mid = uid();
      b.set(fb.collection("supplyMoves").doc(mid), {id:mid, sid:l.sid, type:"compra", qty:l.qty, at:Date.now(), by:me.u, note:e.desc.slice(0,200), expenseId:e.id});
      b.update(fb.collection("supplies").doc(l.sid), {stock:fbInc(l.qty), updatedAt:Date.now(), lastMove:mid}); }
    await cloudWrite(b.commit(), "El gasto"); return;
  }
  expenses.unshift(e);
  e.lines.forEach(l => { const x = supplies.find(y => y.id===l.sid); if(x){ x.stock = r3(x.stock + l.qty); pushLocalMove({id:uid(), sid:x.id, type:"compra", qty:l.qty, at:Date.now(), by:me.u, note:e.desc}); } });
  saveLocalExp();
}
async function removeExpense(id){
  if(cloud && fb){ await cloudWrite(fb.collection("expenses").doc(id).delete(), "El borrado del gasto"); return; }
  expenses = expenses.filter(e => e.id!==id); saveLocalExp();
}
async function moveSupply(sid, type, qty, note){
  const x = supplies.find(y => y.id===sid); if(!x) throw new Error("insumo");
  const mid = uid(), mv = {id:mid, sid, type, qty:r3(qty), at:Date.now(), by:me.u};
  if(note) mv.note = String(note).slice(0,200);
  if(cloud && fb){
    const ref = fb.collection("supplies").doc(sid);
    if(type==="ajuste" && !navigator.onLine){ mv.qty = r3(qty - x.stock); } // sin internet: diferencia con lo que ve este equipo
    else if(type==="ajuste"){ // conteo: el stock queda en lo contado aunque otro equipo lo haya cambiado
      await fb.runTransaction(async t => { const d = await t.get(ref); const cur = d.exists ? Number(d.data().stock)||0 : 0; mv.qty = r3(qty - cur);
        t.set(fb.collection("supplyMoves").doc(mid), mv); t.update(ref, {stock:r3(qty), updatedAt:Date.now(), lastMove:mid}); });
      return;
    }
    const b = fb.batch(); b.set(fb.collection("supplyMoves").doc(mid), mv); b.update(ref, {stock:fbInc(mv.qty), updatedAt:Date.now(), lastMove:mid}); await cloudWrite(b.commit(), "El movimiento de inventario"); return;
  }
  if(type==="ajuste"){ mv.qty = r3(qty - x.stock); x.stock = r3(qty); } else x.stock = r3(x.stock + mv.qty);
  pushLocalMove(mv); saveLocalExp();
}
async function saveSupply(x, isNew){
  if(cloud && fb){
    const ref = fb.collection("supplies").doc(x.id);
    if(isNew) await cloudWrite(ref.set({id:x.id, name:x.name, unit:x.unit, stock:x.stock, min:x.min, createdAt:Date.now(), updatedAt:Date.now()}), "El insumo");
    else await cloudWrite(ref.update({name:x.name, unit:x.unit, min:x.min, updatedAt:Date.now()}), "El insumo");
    return;
  }
  const i = supplies.findIndex(y => y.id===x.id); if(i>=0) supplies[i] = Object.assign(supplies[i], x); else supplies.push(x);
  saveLocalExp();
}
async function loadMoves(sid){
  if(cloud && fb){ const sn = await fb.collection("supplyMoves").where("sid","==",sid).limit(200).get(); return sn.docs.map(d => d.data()).sort((a,b) => b.at-a.at).slice(0,15); }
  return localMoves().filter(m => m.sid===sid).sort((a,b) => b.at-a.at).slice(0,15);
}

function expRow(e){
  const [, ic, l] = catInfo(e.cat);
  return `<button class="attn" data-exp="${esc(e.id)}"><span>${ic} <b>${esc(e.desc)}</b><br><span class="small muted">${esc(l)} · ${fmtDate(expDayTs(e))}${e.at && e.day===todayStr() ? " " + fmtHour(e.at) : ""} · ${esc(e.method)}${e.provider ? " · " + esc(e.provider) : ""} · @${esc(e.by)}</span></span><b>${money(e.amount)}</b></button>`;
}
function inventarioHTML(){
  const low = lowSupplies(), admin = isAdmin();
  let h = `<h3 class="sec">Inventario de insumos</h3>`;
  if(low.length) h += `<div class="alertbar">⚠️ <span><b>${low.length} insumo${low.length===1?"":"s"} por acabarse:</b> ${low.map(x => esc(x.name)).join(", ")}</span></div>`;
  if(!supplies.length) h += `<div class="empty"><strong>Sin insumos registrados</strong>${admin ? "Crea los insumos que compras (jabón, cepillos, bolsas…) para llevar su stock." : "El administrador aún no ha creado los insumos."}</div>`;
  else h += `<div class="panel">${supplies.slice().sort((a,b) => a.name.localeCompare(b.name)).map(x => `<div class="sup ${x.min>0 && x.stock<=x.min ? "low" : ""}">
      <button class="supn" data-sup="${esc(x.id)}"><b>${esc(x.name)}</b><br><span class="small muted">${x.min>0 ? "Mínimo " + fmtQ(x.min) + " " + esc(x.unit) : "Ver movimientos"}</span></button>
      <span class="supq"><b>${fmtQ(x.stock)}</b> <small>${esc(x.unit)}</small></span>
      <button class="btn ghost" data-use="${esc(x.id)}">Usar</button>${admin ? `<button class="btn ghost" data-count="${esc(x.id)}">Contar</button>` : ""}</div>`).join("")}</div>`;
  if(admin) h += `<button class="btn ghost block" data-supnew style="margin-top:8px">＋ Nuevo insumo</button>`;
  return h;
}
function viewGastos(){
  const admin = isAdmin();
  let h = `<div class="listhead"><h2>Gastos</h2><button class="btn" data-expnew style="min-height:42px;padding:8px 14px">＋ Registrar gasto</button></div>`;
  if(admin){
    const R = monthRange(expMonth), L = expIn(R.a, R.b).sort((x,y) => (y.at||0)-(x.at||0));
    const tot = sumExp(L), efe = sumExp(L.filter(e => e.method==="Efectivo"));
    const ventas = r2(orders.filter(o => o.createdAt>=R.a && o.createdAt<R.b).reduce((t,o) => t+(o.total||0), 0)), res = r2(ventas - tot);
    const byCat = EXP_CATS.map(([k,ic,l]) => ({l:ic+" "+l, v:sumExp(L.filter(e => e.cat===k))})).filter(x => x.v>0).sort((a,b) => b.v-a.v);
    h += `<div class="chips" role="group" aria-label="Mes">${[["mes","Este mes"],["mesant","Mes anterior"]].map(([k,l]) => `<button class="chip" data-em="${k}" aria-pressed="${expMonth===k}">${l}</button>`).join("")}</div>
    <p class="small muted" style="margin:-6px 0 10px">${esc(R.l)}</p>
    <div class="kpis"><div class="kpi hero"><span>Gastos del mes</span><b>${money(tot)}</b><small>${L.length} registro${L.length===1?"":"s"} · efectivo ${money(efe)}</small></div>
      <div class="kpi"><span>Ventas del mes</span><b>${money(ventas)}</b><small>pedidos registrados</small></div>
      <div class="kpi ${res<0?"warn":""}"><span>Resultado estimado</span><b>${money(res)}</b><small>ventas − gastos</small></div></div>
    ${byCat.length ? `<h3 class="sec">En qué se gasta</h3><div class="panel pad">${barRows(byCat, money)}</div>` : ""}
    <h3 class="sec">Registros del mes</h3>
    ${L.length ? `<div class="panel pad">${L.map(expRow).join("")}</div><button class="btn ghost block" data-expcsv style="margin-top:8px">Exportar gastos a Excel (CSV)</button>` : `<div class="empty"><strong>Sin gastos este mes</strong>Registra compras de insumos, pagos de obligaciones y almuerzos.</div>`}`;
  } else {
    const L = expenses.filter(e => e.day===todayStr()).sort((x,y) => (y.at||0)-(x.at||0));
    h += `<div class="kpis"><div class="kpi hero"><span>Gastos de hoy</span><b>${money(sumExp(L))}</b><small>${L.length} registro${L.length===1?"":"s"}</small></div>
      <div class="kpi"><span>Pagado en efectivo</span><b>${money(sumExp(L.filter(e => e.method==="Efectivo")))}</b><small>se resta de la caja</small></div></div>
    ${L.length ? `<div class="panel pad">${L.map(expRow).join("")}</div>` : `<div class="empty"><strong>Sin gastos hoy</strong>Registra aquí las compras de insumos, almuerzos y pagos que hagas con dinero del local.</div>`}
    <p class="small muted">Si te equivocas, avisa al administrador: él puede corregir o borrar el gasto.</p>`;
  }
  return h + inventarioHTML();
}
function viewInsumos(){
  return `<div class="listhead"><h2>Insumos</h2></div><p class="small muted" style="margin:-6px 0 6px">Registra lo que usas del inventario. Así se sabe cuándo comprar.</p>` + inventarioHTML();
}
function expenseSheet(){
  const admin = isAdmin();
  if(!expDraft) expDraft = {cat:"insumos", desc:"", provider:"", amount:"", method:"Efectivo", day:todayStr(), lines:[]};
  const d = expDraft;
  if(d.cat==="insumos" && !d.lines.length && supplies.length) d.lines.push({sid:supplies[0].id, qty:""});
  const opts = sel => supplies.slice().sort((a,b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(x.id)}" ${x.id===sel?"selected":""}>${esc(x.name)} (${esc(x.unit)})</option>`).join("");
  const m0 = new Date(); const minDay = new Date(m0.getFullYear(), m0.getMonth()-1, 1);
  openSheet(`<h2>Registrar gasto</h2>
    <span class="lbl" style="margin-top:12px">Tipo de gasto</span>
    <div class="catpick" id="ex_cat">${EXP_CATS.map(([k,ic,l]) => `<button type="button" class="chip" data-c="${k}" aria-pressed="${d.cat===k}">${ic} ${l}</button>`).join("")}</div>
    <div class="field"><label for="ex_d">Descripción</label><input class="input" id="ex_d" maxlength="200" placeholder="${esc(EXP_HINT[d.cat])}" value="${esc(d.desc)}"></div>
    ${d.cat==="insumos" ? `<div class="panel pad" style="margin-bottom:12px"><b class="small">¿Qué compraste? Se suma al inventario</b>
      ${supplies.length ? d.lines.map((l,i) => `<div class="exline"><select class="input" data-ls="${i}" aria-label="Insumo ${i+1}">${opts(l.sid)}</select><input class="input" data-lq="${i}" inputmode="decimal" placeholder="Cant." aria-label="Cantidad ${i+1}" value="${esc(l.qty)}"><button type="button" class="btn ghost" data-lr="${i}" aria-label="Quitar insumo ${i+1}">×</button></div>`).join("")
        + `<button type="button" class="btn ghost block" id="ex_addl" style="margin-top:8px">＋ Otro insumo</button>`
        : `<p class="small muted" style="margin:6px 0 0">${admin ? "Aún no hay insumos. Créalos abajo, en Inventario de insumos." : "Aún no hay insumos en el inventario. Pide al administrador que los cree."}</p>`}</div>` : ""}
    <div class="field"><label for="ex_p">Proveedor (opcional)</label><input class="input" id="ex_p" maxlength="100" value="${esc(d.provider)}"></div>
    <div class="two"><div class="field"><label for="ex_a">Monto total</label><input class="input" id="ex_a" inputmode="decimal" placeholder="0,00" value="${esc(d.amount)}"></div>
      <div class="field"><label for="ex_m">Pagado con</label><select class="input" id="ex_m"><option ${d.method==="Efectivo"?"selected":""}>Efectivo</option><option ${d.method==="Transferencia"?"selected":""}>Transferencia</option></select></div></div>
    ${admin ? `<div class="field"><label for="ex_day">Fecha</label><input class="input" type="date" id="ex_day" min="${todayStr(-Math.round((Date.now()-minDay.getTime())/DAY))}" max="${todayStr()}" value="${esc(d.day)}"></div>` : ""}
    <p class="small muted" style="margin:0 0 8px">Lo pagado en efectivo se resta del efectivo que debe haber en caja.</p>
    <div class="stack"><button class="btn block" id="ex_save">Guardar gasto</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  const sync = () => {
    d.desc = $("#ex_d").value; d.provider = $("#ex_p").value; d.amount = $("#ex_a").value; d.method = $("#ex_m").value;
    if($("#ex_day")) d.day = $("#ex_day").value || todayStr();
    document.querySelectorAll("[data-ls]").forEach(x => { d.lines[+x.dataset.ls].sid = x.value; });
    document.querySelectorAll("[data-lq]").forEach(x => { d.lines[+x.dataset.lq].qty = x.value; });
  };
  $("#ex_cat").querySelectorAll("[data-c]").forEach(b => b.onclick = () => { sync(); d.cat = b.dataset.c; if(d.cat!=="insumos") d.lines = []; expenseSheet(); });
  const al = $("#ex_addl"); if(al) al.onclick = () => { sync(); if(d.lines.length < 10) d.lines.push({sid:supplies[0].id, qty:""}); expenseSheet(); };
  document.querySelectorAll("[data-lr]").forEach(b => b.onclick = () => { sync(); d.lines.splice(+b.dataset.lr, 1); expenseSheet(); });
  $("#ex_save").onclick = async ev => {
    sync();
    const amount = r2(parseNum(d.amount)), desc = d.desc.trim();
    if(!desc){ toast("Escribe qué se pagó"); $("#ex_d").focus(); return; }
    if(!(amount > 0)){ toast("Escribe el monto"); $("#ex_a").focus(); return; }
    const merged = {};
    for(const l of d.lines){ const q = r3(parseNum(l.qty)); if(!l.sid) continue; if(!(q > 0)){ toast("Escribe la cantidad de cada insumo comprado"); return; } merged[l.sid] = r3((merged[l.sid]||0) + q); }
    const lines = Object.entries(merged).map(([sid, qty]) => { const x = supplies.find(y => y.id===sid); return {sid, name:x ? x.name : "", qty, unit:x ? x.unit : ""}; });
    const day = admin ? (DATE(d.day) || todayStr()) : todayStr();
    const e = {id:uid(), day, at: day===todayStr() ? Date.now() : dayStart(day) + 12*3600000, cat:d.cat, desc, provider:d.provider.trim(), amount, method:d.method==="Transferencia"?"Transferencia":"Efectivo", by:me.u, lines};
    if(!e.provider) delete e.provider;
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = "Guardando…";
    try{ await addExpense(e); expDraft = null; closeSheet(); render(); toast(`Gasto de ${money(amount)} registrado${lines.length ? " · inventario actualizado" : ""}`); }
    catch(err){ btn.disabled = false; btn.textContent = "Guardar gasto"; toast(cloud ? fbErr(err) : "No se pudo guardar el gasto"); }
  };
}
function expDetailSheet(id){
  const e = expenses.find(x => x.id===id); if(!e) return;
  const [, ic, l] = catInfo(e.cat);
  openSheet(`<h2>${ic} ${esc(e.desc)}</h2>
    <div class="panel pad" style="margin-top:12px"><div class="totals">
      <div class="big"><span>Monto</span><span>${money(e.amount)}</span></div>
      <div><span>Tipo</span><span>${esc(l)}</span></div><div><span>Pagado con</span><span>${esc(e.method)}</span></div>
      <div><span>Fecha</span><span>${fmtDate(expDayTs(e),{day:"numeric",month:"long",year:"numeric"})}</span></div>
      ${e.provider ? `<div><span>Proveedor</span><span>${esc(e.provider)}</span></div>` : ""}<div><span>Registró</span><span>@${esc(e.by)}</span></div>
      ${e.lines.map(x => `<div><span>📦 ${esc(x.name)}</span><span>+${fmtQ(x.qty)} ${esc(x.unit)}</span></div>`).join("")}</div></div>
    <div class="stack">${isAdmin() ? `<button class="btn danger block" id="exDel">Borrar gasto</button>` : ""}<button class="btn ghost block" data-close>Cerrar</button></div>`);
  const del = $("#exDel");
  if(del) del.onclick = async () => {
    if(!confirm(`¿Borrar el gasto "${e.desc}" de ${money(e.amount)}?${e.lines.length ? "\n\nEl inventario no se descuenta solo: si hace falta, usa Contar en el insumo." : ""}`)) return;
    try{ await removeExpense(e.id); closeSheet(); render(); toast("Gasto borrado"); }catch(err){ toast(cloud ? fbErr(err) : "No se pudo borrar"); }
  };
}
function supplySheet(id){
  const admin = isAdmin(), x = id ? supplies.find(y => y.id===id) : null;
  if(id && !x) return;
  const isNew = !x;
  openSheet(`<h2>${isNew ? "Nuevo insumo" : esc(x.name)}</h2>
    ${admin ? `<div class="field" style="margin-top:12px"><label for="su_n">Nombre</label><input class="input" id="su_n" maxlength="80" placeholder="Ej. Jabón neutro" value="${esc(x ? x.name : "")}"></div>
      <div class="two"><div class="field"><label for="su_u">Unidad</label><input class="input" id="su_u" maxlength="20" placeholder="Ej. litros, frascos, unidades" value="${esc(x ? x.unit : "")}"></div>
        <div class="field"><label for="su_m">Avisar cuando quede</label><input class="input" id="su_m" inputmode="decimal" placeholder="Ej. 2" value="${x ? fmtQ(x.min) : ""}"></div></div>
      ${isNew ? `<div class="field"><label for="su_s">Cantidad que hay ahora</label><input class="input" id="su_s" inputmode="decimal" placeholder="0"></div>` : ""}`
      : `<p class="muted" style="margin:6px 0 0">Hay <b>${fmtQ(x.stock)} ${esc(x.unit)}</b>${x.min>0 ? ` · aviso con ${fmtQ(x.min)}` : ""}</p>`}
    ${isNew ? "" : `<span class="lbl" style="margin-top:14px">Últimos movimientos</span><div id="mvbox" class="small muted">Cargando…</div>`}
    <div class="stack">${admin ? `<button class="btn block" id="su_save">${isNew ? "Crear insumo" : "Guardar cambios"}</button>` : ""}
      ${admin && !isNew ? `<button class="btn danger block" id="su_del">Quitar insumo</button>` : ""}<button class="btn ghost block" data-close>Cerrar</button></div>`);
  if(!isNew) loadMoves(x.id).then(list => { const b = $("#mvbox"); if(!b) return;
    const T = {compra:"🛒 Compra", uso:"🧴 Uso", ajuste:"🔢 Conteo"};
    b.className = ""; b.innerHTML = list.length ? `<div class="panel pad"><div class="totals">${list.map(m => `<div><span>${T[m.type]||esc(m.type)} · ${fmtDate(m.at)} ${fmtHour(m.at)} · @${esc(m.by)}${m.note ? `<br><span class="small muted">${esc(m.note)}</span>` : ""}</span><span>${m.qty>0?"+":""}${fmtQ(m.qty)}</span></div>`).join("")}</div></div>` : `<span class="small muted">Sin movimientos todavía.</span>`;
  }).catch(() => { const b = $("#mvbox"); if(b) b.textContent = "No se pudieron cargar los movimientos."; });
  const sv = $("#su_save");
  if(sv) sv.onclick = async () => {
    const name = $("#su_n").value.trim(), unit = $("#su_u").value.trim() || "unidades", min = r3(parseNum($("#su_m").value)), stock = isNew ? r3(parseNum(($("#su_s")||{}).value)) : x.stock;
    if(!name){ toast("Escribe el nombre del insumo"); return; }
    if(isNew && supplies.some(y => y.name.toLowerCase()===name.toLowerCase())){ toast("Ya existe un insumo con ese nombre"); return; }
    if(min < 0 || stock < 0){ toast("Las cantidades no pueden ser negativas"); return; }
    sv.disabled = true;
    try{ await saveSupply({id: isNew ? uid() : x.id, name, unit, min, stock}, isNew); closeSheet(); render(); toast(isNew ? "Insumo creado" : "Insumo actualizado"); }
    catch(err){ sv.disabled = false; toast(cloud ? fbErr(err) : "No se pudo guardar"); }
  };
  const dl = $("#su_del");
  if(dl) dl.onclick = async () => {
    if(!confirm(`¿Quitar "${x.name}" del inventario? Los gastos ya registrados no cambian.`)) return;
    try{ if(cloud && fb) await fb.collection("supplies").doc(x.id).delete(); else { supplies = supplies.filter(y => y.id!==x.id); saveLocalExp(); } closeSheet(); render(); toast("Insumo quitado"); }
    catch(err){ toast(cloud ? fbErr(err) : "No se pudo quitar"); }
  };
}
function useSheet(id){
  const x = supplies.find(y => y.id===id); if(!x) return;
  openSheet(`<h2>Usar ${esc(x.name)}</h2><p class="muted" style="margin:0">Hay <b>${fmtQ(x.stock)} ${esc(x.unit)}</b></p>
    <div class="field" style="margin-top:12px"><label for="us_q">Cantidad usada (${esc(x.unit)})</label><input class="input" id="us_q" inputmode="decimal" placeholder="Ej. 1"></div>
    <div class="field"><label for="us_n">Nota (opcional)</label><input class="input" id="us_n" maxlength="200" placeholder="Ej. lavado del pedido 000123"></div>
    <div class="stack"><button class="btn block" id="us_ok">Registrar uso</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  $("#us_ok").onclick = async ev => {
    const q = r3(parseNum($("#us_q").value));
    if(!(q > 0)){ toast("Escribe cuánto usaste"); return; }
    if(q > x.stock){ toast(`Solo hay ${fmtQ(x.stock)} ${x.unit}. Si el stock está mal, pide al administrador que haga un conteo.`); return; }
    ev.currentTarget.disabled = true;
    try{ await moveSupply(x.id, "uso", -q, $("#us_n").value.trim()); closeSheet(); render(); toast(`Uso registrado: −${fmtQ(q)} ${x.unit}`); }
    catch(err){ toast(cloud ? fbErr(err) : "No se pudo registrar"); const b = $("#us_ok"); if(b) b.disabled = false; }
  };
}
function countSheet(id){
  const x = supplies.find(y => y.id===id); if(!x) return;
  openSheet(`<h2>Contar ${esc(x.name)}</h2><p class="muted" style="margin:0">El sistema dice <b>${fmtQ(x.stock)} ${esc(x.unit)}</b>. Escribe lo que hay de verdad en bodega.</p>
    <div class="field" style="margin-top:12px"><label for="ct_q">Cantidad contada (${esc(x.unit)})</label><input class="input" id="ct_q" inputmode="decimal" placeholder="${fmtQ(x.stock)}"></div>
    <div class="field"><label for="ct_n">Nota (opcional)</label><input class="input" id="ct_n" maxlength="200" placeholder="Ej. conteo de fin de mes"></div>
    <div class="stack"><button class="btn block" id="ct_ok">Guardar conteo</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  $("#ct_ok").onclick = async ev => {
    const raw = $("#ct_q").value.trim(), q = r3(parseNum(raw));
    if(raw==="" || q < 0){ toast("Escribe la cantidad contada"); return; }
    ev.currentTarget.disabled = true;
    try{ await moveSupply(x.id, "ajuste", q, $("#ct_n").value.trim() || "Conteo físico"); closeSheet(); render(); toast("Conteo guardado"); }
    catch(err){ toast(cloud ? fbErr(err) : "No se pudo guardar"); const b = $("#ct_ok"); if(b) b.disabled = false; }
  };
}
async function exportExpCSV(){
  const R = monthRange(expMonth), dc = n => fmt2(n||0).replace(".",",");
  const head = ["Fecha","Tipo","Descripcion","Proveedor","Monto","Pagado con","Registro","Insumos"];
  const rows = expIn(R.a, R.b).sort((a,b) => a.day.localeCompare(b.day)).map(e => [e.day, catInfo(e.cat)[2], e.desc, e.provider||"", dc(e.amount), e.method, e.by, e.lines.map(l => `${l.name} +${fmtQ(l.qty)} ${l.unit}`).join(" | ")]);
  const cell = v => { let t = String(v); if(/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g,'""') + '"'; }; // evita fórmulas al abrir en Excel
  const csv = "\ufeff" + [head, ...rows].map(r => r.map(cell).join(";")).join("\n");
  await saveFile(`gastos-shoe-cleaning-${R.l.toLowerCase().replace(/\s+/g,"-")}.csv`, csv, "text/csv;charset=utf-8");
}

/* ---------- Análisis extra ---------- */
function extraAnalytics(P, start){
  const now = Date.now();
  const pays = payments().filter(p => p.at>=start);
  const cobr = sumAmt(pays), tra = sumAmt(pays.filter(p => p.method==="Transferencia")), efe = cobr - tra;
  const pendientes = orders.filter(o => o.status!=="entregado" && saldo(o)>0);
  const porCobrar = pendientes.reduce((t,o) => t+saldo(o), 0);
  const days = []; for(let i=13;i>=0;i--){ const d = new Date(now - i*DAY); d.setHours(0,0,0,0); const a = d.getTime(), b = a + DAY; days.push({l: i===0?"Hoy":String(d.getDate()), s: sumAmt(payments().filter(p => p.at>=a && p.at<b))}); }
  const mx = Math.max(...days.map(d => d.s), 1);
  const ss = stageStats(P);
  const ot = P.map(onTime).filter(x => x!=null); const otPct = ot.length ? ot.filter(Boolean).length/ot.length*100 : null;
  const lead = P.filter(o => o.deliveredAt).map(o => o.deliveredAt-o.createdAt);
  const staff = staffStats(P).sort((a,b) => (b.recibidos+b.etapas+b.entregas)-(a.recibidos+a.etapas+a.entregas));
  const week = loginsData.filter(e => e.at >= now-7*DAY);
  const byDay = {}; week.forEach(e => { const k = e.day+"|"+e.u; const r = byDay[k] || (byDay[k] = {day:e.day, u:e.u, name:e.name, role:e.role, first:e.at, last:e.at, n:0}); r.first = Math.min(r.first, e.at); r.last = Math.max(r.last, e.at); r.n++; });
  const att = Object.values(byDay).sort((a,b) => b.day.localeCompare(a.day) || a.first-b.first);
  return `
  <h3 class="sec">Caja</h3>
  <div class="kpis">
    <div class="kpi"><span>Cobrado en el periodo</span><b>${money(cobr)}</b><small>${pays.length} cobros</small></div>
    <div class="kpi"><span>Efectivo</span><b>${money(efe)}</b><small>${cobr?(efe/cobr*100).toFixed(0)+"% del total":"—"}</small></div>
    <div class="kpi"><span>Transferencia</span><b>${money(tra)}</b><small>${cobr?(tra/cobr*100).toFixed(0)+"% del total":"—"}</small></div>
    <div class="kpi ${porCobrar>0?"warn":""}"><span>Falta por cobrar (hoy)</span><b>${money(porCobrar)}</b><small>${pendientes.length} pedido${pendientes.length===1?"":"s"} con saldo</small></div>
  </div>
  <div class="panel pad"><b class="small">Cobrado por día · últimos 14 días</b><div class="cols">${days.map(d => `<div class="c ${d.s===mx&&d.s>0?"top":""}" title="${d.l}: ${money(d.s)}"><span>${d.s?"$"+Math.round(d.s):""}</span><i style="height:${d.s/mx*100}%"></i><span>${d.l}</span></div>`).join("")}</div></div>
  ${pendientes.length?`<div class="panel pad scroll"><b class="small">Saldos por cobrar</b><table class="t"><tbody>${pendientes.sort((a,b)=>saldo(b)-saldo(a)).slice(0,10).map(o => `<tr><td><button class="chip" style="border:0;padding:0;background:none" data-client="${esc(o.phoneKey)}"><span class="num">${esc(o.num)}</span> ${esc(o.name)}</button></td><td class="small muted">${ST[o.status].l}</td><td class="r"><b>${money(saldo(o))}</b></td></tr>`).join("")}</tbody></table></div>`:""}

  <h3 class="sec">Tiempo de cada etapa</h3>
  <div class="panel pad scroll"><table class="t"><thead><tr><th>Etapa</th><th class="r">Promedio</th><th class="r">Típico</th><th class="r">Máximo</th></tr></thead><tbody>
    ${ss.map(x => `<tr><td>${x.l}<br><span class="small muted">${x.n} pedido${x.n===1?"":"s"}</span></td><td class="r" style="white-space:nowrap"><b>${fmtDur(x.avg)}</b></td><td class="r" style="white-space:nowrap">${fmtDur(x.med)}</td><td class="r" style="white-space:nowrap">${fmtDur(x.max)}</td></tr>`).join("")}
  </tbody></table>
  <p class="small muted" style="margin:8px 0 0">"Típico" es la mediana: la mitad de los pedidos tarda menos que eso. Del ingreso a la entrega: <b>${fmtDur(lead.length?lead.reduce((t,x)=>t+x,0)/lead.length:0)}</b> en promedio.</p></div>
  <div class="kpis">
    <div class="kpi"><span>Listos a tiempo</span><b>${otPct==null?"—":otPct.toFixed(0)+"%"}</b><small>${ot.length} pedidos medidos</small></div>
    <div class="kpi"><span>Atrasados ahora</span><b>${orders.filter(o=>dueLevel(o)==="late").length}</b><small>pasaron su fecha</small></div>
  </div>

  <h3 class="sec">Productividad del personal</h3>
  <div class="panel pad scroll">${staff.length?`<table class="t"><thead><tr><th>Persona</th><th class="r">Recibió</th><th class="r">Etapas</th><th class="r">Entregó</th></tr></thead><tbody>${staff.map(x => `<tr><td>${esc(userName(x.u))}</td><td class="r">${x.recibidos}</td><td class="r">${x.etapas}</td><td class="r">${x.entregas}</td></tr>`).join("")}</tbody></table>`:'<p class="small muted" style="margin:0">Aún no hay registros por persona en este periodo.</p>'}</div>

  <h3 class="sec">Asistencia · últimos 7 días</h3>
  <div class="panel pad scroll">${att.length?`<table class="t"><thead><tr><th>Día</th><th>Persona</th><th>Entrada</th><th>Último ingreso</th></tr></thead><tbody>${att.map(r => `<tr><td>${fmtDue(r.day)}</td><td>${esc(r.name||r.u)} <span class="rolepill r-${r.role}">${ROLE[r.role]||r.role}</span></td><td><b>${fmtHour(r.first)}</b></td><td>${r.n>1?fmtHour(r.last):"—"}</td></tr>`).join("")}</tbody></table>`:'<p class="small muted" style="margin:0">Los ingresos aparecen aquí cuando el personal inicia sesión.</p>'}</div>`;
}

/* ---------- Nube (Firebase) ---------- */
const FB_V = "10.12.2", FB_DOMAIN = "shoecleaning.app";
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v||"").trim());
// Con correo real se entra con ese correo; con usuario se usa el correo interno usuario@shoecleaning.app
const toEmail = u => { const v = String(u).trim().toLowerCase(); return v.includes("@") ? v : v.replace(/[^a-z0-9._-]/g,"") + "@" + FB_DOMAIN; };
// Usuario interno (para firmar pedidos) a partir del correo: parte antes de la @, sin repetir
function handleFromEmail(email){
  const base = (String(email).split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g,"") || "admin").slice(0, 30);
  let h = base, i = 2; while(users().some(x => x.u===h)) h = base + (i++);
  return h;
}
const randomPw = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2,"0")).join("");
const cloneJ = o => JSON.parse(JSON.stringify(o));
function fbErr(err){
  const c = (err && err.code) || "";
  if(c.includes("email-already-in-use")) return "Ese usuario o correo ya existe";
  if(c.includes("invalid-email")) return "Revisa el correo";
  if(c.includes("weak-password")) return "La contraseña debe tener al menos 8 caracteres";
  if(c.includes("network")||c.includes("unavailable")) return "Sin conexión a internet";
  if(c.includes("permission-denied")) return "Permiso denegado. Revisa las reglas de Firestore.";
  if(c.includes("wrong-password")||c.includes("invalid-credential")||c.includes("invalid-login")) return "Contraseña incorrecta";
  if(c.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
  if(c.includes("operation-not-allowed")) return "Activa Correo/contraseña en Firebase Authentication";
  return "Error: " + (err && (err.message||err.code) || "desconocido");
}
// Numeración sin internet: cada equipo reserva bloques de 20 números cuando tiene conexión.
// Así sigue numerando sin internet y dos equipos nunca repiten un número. Si se acaba el bloque
// sin internet, se usa un número provisional único (P + fecha y hora).
const NUM_BLOCK = 20;
const fmtNum = n => (settings.prefix||"") + String(n).padStart(6,"0");
const blockKey = () => "sc_numblock_" + ((me && (me.uid||me.u)) || "x");
function getBlock(){
  try{
    const b = JSON.parse(localStorage.getItem(blockKey())||"null");
    if(!b || b.ep !== (settings.numEpoch||0)) return null;
    if(b.next >= b.end && b.q){ b.next = b.q[0]; b.end = b.q[1]; delete b.q; setBlock(b); }
    return b.next < b.end ? b : null;
  }catch(e){ return null; }
}
function setBlock(b){ try{ localStorage.setItem(blockKey(), JSON.stringify(b)); }catch(e){} }
async function reserveRange(){
  const ref = fb.doc("config/settings");
  return await withTimeout(fb.runTransaction(async t => { const d = await t.get(ref); const cur = (d.exists && d.data().nextNumber) || settings.nextNumber; t.update(ref, {nextNumber: cur + NUM_BLOCK}); return cur; }), 8000);
}
let reserving = false;
async function topUpBlock(){
  if(reserving || !navigator.onLine || !(cloud && fb)) return;
  const b = getBlock(); if(b && (b.end - b.next > 3 || b.q)) return;
  reserving = true;
  try{ const st = await reserveRange(); const cur = getBlock();
    if(cur) { cur.q = [st, st + NUM_BLOCK]; setBlock(cur); } else setBlock({next:st, end:st + NUM_BLOCK, ep:settings.numEpoch||0}); }
  catch(e){} finally { reserving = false; }
}
async function takeNumber(){
  if(cloud && fb){
    let b = getBlock();
    if(!b && navigator.onLine){ await topUpBlock(); b = getBlock(); }
    if(b){ const n = b.next++; setBlock(b); topUpBlock(); return fmtNum(n); }
    const d = new Date(), z = v => String(v).padStart(2,"0");
    return (settings.prefix||"") + "P" + z(d.getMonth()+1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + Math.random().toString(36).slice(2,4).toUpperCase();
  }
  const n = settings.nextNumber; settings.nextNumber++;
  return fmtNum(n);
}
const nextNumPreview = () => { const b = cloud && me ? getBlock() : null; return b ? fmtNum(b.next) : fmtNum(settings.nextNumber); };
// Integridad (SRI) de Firebase 10.12.2: si alguien altera estos archivos en el camino, el navegador no los ejecuta
const FB_SRI = {"firebase-app-compat.js":"sha384-AQ3POAMqIhwS81FrUH95ekxqBZHeP5tG2JfEL3+7GuTtfRLWnrRh32UxwzM+//A9",
  "firebase-auth-compat.js":"sha384-TnlRYaR4JYz/lpaGuaiU61PjNberSA4vjLjtF+oRC/IkohkJqnWxw5EmDSOt1vA1",
  "firebase-firestore-compat.js":"sha384-qn4Jh88HhJA8dplNQyGjOh9OGI4izVhrfj/qIFgaKcdgOE06pXqIKGlsCILZcLAC"};
function loadScript(src){ return new Promise((res, rej) => { const el = document.createElement("script"); const sri = FB_SRI[src.split("/").pop()]; if(sri){ el.integrity = sri; el.crossOrigin = "anonymous"; } el.src = src; el.onload = res; el.onerror = () => rej(new Error("No cargó " + src)); document.head.appendChild(el); }); }
function stopCloud(){ clearInterval(hbTimer); unsub.forEach(f => { try{ f(); }catch(e){} }); unsub = []; }
const pristineDraft = () => !draft || (!draft.name && !draft.phone && !Object.values(draft.qty).some(x=>x>0));
async function startSession(u){
  stopCloud();
  if(!u){ me = null; mode = "local"; orders = []; cloudUsers = []; expenses = []; supplies = []; ready = true; gateShown = null; draft = null; closeSheet(); render(); setSync("Nube"); return; }
  let ud = null, saved = null;
  try{ saved = JSON.parse(localStorage.getItem("sc_me_" + u.uid) || "null"); }catch(e){}
  try{ ud = await withTimeout(fb.doc("users/" + u.uid).get(), 9000); }catch(e){}
  let d = null;
  if(ud && ud.exists){ d = ud.data(); try{ localStorage.setItem("sc_me_" + u.uid, JSON.stringify({username:d.username, name:d.name, role:d.role, email:d.email||""})); }catch(e){} }
  else if(!ud && saved) d = saved; // sin internet: se usa el perfil guardado en este equipo
  if(!d){ try{ await fbAuth.signOut(); }catch(e){} toast("Tu usuario no está activo. Habla con el administrador."); return; }
  if(!ROLES_ACTIVE.includes(d.role)){ try{ await fbAuth.signOut(); }catch(e){} toast("El rol Operaciones ya no existe. Pide al administrador que te asigne Recepción."); return; }
  me = {uid:u.uid, u:d.username, name:d.name, role:d.role};
  recordLogin(pendingLoginType || "apertura"); pendingLoginType = null; startPresence();
  mode = "db"; db = fb; ordersCol = fb.collection("orders"); settingsDoc = fb.doc("config/settings");
  orders = []; ready = true; view = HOME[me.role]; draft = null; gateShown = null; render();
  setSync("Conectando…");
  let firstSnap = true;
  unsub.push(ordersCol.orderBy("createdAt","desc").limit(2000).onSnapshot({includeMetadataChanges:true}, snap => {
    const m = snap.metadata || {};
    syncState = m.hasPendingWrites ? "pend" : (m.fromCache || !navigator.onLine) ? "off" : "ok"; showSync();
    if(firstSnap || snap.docChanges().length){ firstSnap = false; orders = snap.docs.map(x => x.data()).filter(Boolean).map(norm); onData(); }
  }, () => setSync("Sin conexión")));
  topUpBlock();
  unsub.push(settingsDoc.onSnapshot(sn => {
    const sd = sn.exists ? sn.data() : null;
    if(sd){ settings = normSettings(sd); delete settings.users; }
    else if(isAdmin()) saveSettings();
    if(view==="nuevo" && pristineDraft()){ draft = null; render(); }
    else if(view!=="ajustes" && view!=="nuevo") render();
  }, () => {}));
  unsub.push(fb.collection("users").onSnapshot(snap => {
    cloudUsers = snap.docs.map(x => { const ud2 = x.data(); return {uid:x.id, u:ud2.username, name:ud2.name, role:ud2.role, email:ud2.email||""}; });
    const mine = cloudUsers.find(x => x.uid===me.uid);
    if(!mine){ toast("Tu usuario fue desactivado"); fbAuth.signOut().catch(()=>{}); return; }
    if(!ROLES_ACTIVE.includes(mine.role)){ toast("Tu rol ya no tiene acceso. Habla con el administrador."); fbAuth.signOut().catch(()=>{}); return; }
    if(mine.role!==me.role || mine.name!==me.name){ me = Object.assign({}, me, {role:mine.role, name:mine.name}); try{ localStorage.setItem("sc_me_" + me.uid, JSON.stringify({username:me.u, name:me.name, role:me.role})); }catch(e){} render(); }
    else if(view==="ajustes") render();
  }, () => {}));
  if(me.role!=="operaciones"){
    const n0 = new Date(), since = isAdmin() ? new Date(n0.getFullYear(), n0.getMonth()-1, 1).getTime() : Date.now() - 36*3600000;
    unsub.push(fb.collection("expenses").where("at",">=",since).orderBy("at","desc").limit(2000).onSnapshot(sn => {
      expenses = sn.docs.map(x => normExpense(x.data())); if(["gastos","tablero"].includes(view)) softRender();
    }, () => {}));
  }
  unsub.push(fb.collection("supplies").onSnapshot(sn => {
    supplies = sn.docs.map(x => normSupply(x.data())); if(["gastos","insumos","tablero"].includes(view)) softRender();
  }, () => {}));
  if(isAdmin()){
    let privFirst = true;
    unsub.push(fb.doc("config/privacy").onSnapshot(sn => {
      if(sn.exists) privacy = normPrivacy(sn.data());
      try{ localStorage.setItem("sc_privacy", JSON.stringify(privacy)); }catch(e){}
      if(privFirst && view==="ajustes") render(); // solo la primera vez, para no borrar lo que se está escribiendo
      privFirst = false;
    }, () => {}));
    unsub.push(fb.collection("presence").onSnapshot(sn => { presence = {}; sn.docs.forEach(x => presence[x.id] = x.data()); if(view==="tablero") softRender(); }, () => {}));
    unsub.push(fb.collection("logins").where("at",">=",Date.now()-8*DAY).onSnapshot(sn => { loginsData = sn.docs.map(x => x.data()); if(view==="tablero"||view==="analisis") softRender(); }, () => {}));
  }
}
async function cloudSetup(u, n, p){
  if(p.length<8){ toast("La contraseña debe tener al menos 8 caracteres"); return; }
  bootstrapping = true;
  try{
    let cred;
    try{ cred = await fbAuth.createUserWithEmailAndPassword(toEmail(u), p); }
    catch(err){ if((err.code||"").includes("email-already-in-use")) cred = await fbAuth.signInWithEmailAndPassword(toEmail(u), p); else throw err; }
    const batch = fb.batch();
    const handle = u.includes("@") ? handleFromEmail(u) : u;
    batch.set(fb.doc("users/" + cred.user.uid), Object.assign({username:handle, name:n, role:"admin", createdAt:Date.now()}, u.includes("@") ? {email:u} : {}));
    batch.set(fb.doc("config/bootstrap"), {at:Date.now(), by:handle});
    await batch.commit();
    const st = cloneJ(settings); delete st.users;
    await fb.doc("config/settings").set(st);
    bootstrapped = true; bootstrapping = false;
    await startSession(cred.user);
    toast("Administrador creado");
  }catch(err){
    bootstrapping = false;
    try{ await fbAuth.signOut(); }catch(e){}
    toast(fbErr(err));
  }
}
async function cloudCreateUser(u, n, role, p){
  try{
    const sec = firebase.apps.find(a => a.name==="sec") || firebase.initializeApp(window.FIREBASE_CONFIG, "sec");
    const sa = sec.auth();
    try{ await sa.setPersistence(firebase.auth.Auth.Persistence.NONE); }catch(e){}
    const cred = await sa.createUserWithEmailAndPassword(toEmail(u), p);
    await fb.doc("users/" + cred.user.uid).set({username:u, name:n, role, createdAt:Date.now(), createdBy:me.u});
    await sa.signOut();
    return true;
  }catch(err){ toast(fbErr(err)); return false; }
}
// Administrador por correo: se crea la cuenta con una clave al azar que nadie conoce
// y Firebase le envía el enlace para que ponga la suya.
async function cloudInviteAdmin(email, n){
  try{
    const sec = firebase.apps.find(a => a.name==="sec") || firebase.initializeApp(window.FIREBASE_CONFIG, "sec");
    const sa = sec.auth();
    try{ await sa.setPersistence(firebase.auth.Auth.Persistence.NONE); }catch(e){}
    try{ sa.languageCode = "es"; }catch(e){}
    const cred = await sa.createUserWithEmailAndPassword(email, randomPw());
    await fb.doc("users/" + cred.user.uid).set({username:handleFromEmail(email), name:n, role:"admin", email, createdAt:Date.now(), createdBy:me.u});
    await sa.signOut();
    await sa.sendPasswordResetEmail(email);
    return true;
  }catch(err){ toast(fbErr(err)); return false; }
}
async function sendReset(email){
  try{ fbAuth.languageCode = "es"; }catch(e){}
  try{ await fbAuth.sendPasswordResetEmail(email); }catch(e){ if(/network/.test(e.code||"")){ toast("Sin conexión a internet"); return; } }
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados
  toast("Si ese correo tiene cuenta, te llegará un enlace para crear una nueva contraseña. Revisa también el spam.", 7000);
}
function myPwSheet(){
  openSheet(`<h2>Cambiar mi contraseña</h2>
    <div class="field" style="margin-top:12px"><label for="mp0">Contraseña actual</label><input class="input" id="mp0" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="mp1">Nueva contraseña</label><input class="input" id="mp1" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></div>
    <div class="stack"><button class="btn block" id="mpSave">Guardar</button><button class="btn ghost block" data-close>Cancelar</button></div>`);
  $("#mpSave").onclick = async () => {
    const cur = $("#mp0").value, nw = $("#mp1").value;
    if(nw.length<8){ toast("Mínimo 8 caracteres"); return; }
    try{
      const user = fbAuth.currentUser;
      await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, cur));
      await user.updatePassword(nw);
      closeSheet(); toast("Contraseña actualizada");
    }catch(err){ toast(fbErr(err)); }
  };
}
async function initCloud(){
  setSync("Conectando…");
  try{
    const base = `https://www.gstatic.com/firebasejs/${FB_V}/`;
    await loadScript(base + "firebase-app-compat.js");
    await Promise.all([loadScript(base + "firebase-auth-compat.js"), loadScript(base + "firebase-firestore-compat.js")]);
    firebase.initializeApp(window.FIREBASE_CONFIG);
    fb = firebase.firestore();
    try{ fb.settings({cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, merge:true}); }catch(e){}
    try{ await fb.enablePersistence({synchronizeTabs:true}); }catch(e){}
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){} // que Android no borre los datos guardados
    fbAuth = firebase.auth();
    try{ bootstrapped = (await fb.doc("config/bootstrap").get()).exists; }catch(e){ bootstrapped = true; }
    fbAuth.onAuthStateChanged(u => { if(bootstrapping) return; startSession(u); });
  }catch(e){ cloudError = true; ready = true; gateShown = null; render(); }
}

loadLocal();
loadLocalExp();
if(cloud) initCloud();
if(ready) restoreSession();
if(me && !cloud){ recordLogin("apertura"); startPresence(); }
render();
setSync("En este dispositivo");
setTimeout(() => { if(!ready){ if(cloud) cloudError = true; ready = true; restoreSession(); gateShown = null; render(); } }, cloud ? 20000 : 6000);

(async () => {
  try{
    if(!window.claude || !window.claude.use) return;
    downloads = await window.claude.use("downloads");
    db = await window.claude.use("db");
    if(!db){ if(!ready){ ready = true; restoreSession(); } render(); return; }
    mode = "db";
    ordersCol = db.collection("orders");
    settingsDoc = db.doc("config/settings");
    const localOrders = orders.slice();
    let first = true;
    ordersCol.orderBy("createdAt","desc").limit(1000).onSnapshot(snap => {
      mode = "db";
      orders = snap.docs.map(d => d.data()).filter(Boolean).map(norm);
      if(first){
        first = false;
        // Migrar pedidos guardados localmente que aún no estén en la nube
        const ids = new Set(orders.map(o=>o.id));
        localOrders.filter(o=>!ids.has(o.id)).forEach(o => { orders.push(o); ordersCol.doc(o.id).set(clean(o)).catch(()=>{}); });
        if(localOrders.length){ try{ localStorage.removeItem("sc_orders"); }catch(e){} }
      }
      setSync("Sincronizado ✓");
      onData();
    }, err => { setSync("Sin conexión"); });
    settingsDoc.onSnapshot(s => {
      const d = s.exists ? s.data() : null;
      if(d){ settings = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), JSON.parse(JSON.stringify(d))); if(!Array.isArray(settings.services) || !settings.services.length) settings.services = JSON.parse(JSON.stringify(DEFAULT_SERVICES)); }
      else { saveSettings(); }
      if(!ready){ ready = true; restoreSession(); gateShown = null; render(); return; }
      refreshMe();
      if(!me) return;
      if(view!=="ajustes" && view!=="nuevo") render();
      else if(view==="nuevo" && !draft) render();
    }, () => {});
  }catch(e){ setSync("En este dispositivo"); if(!ready){ ready = true; restoreSession(); render(); } }
})();
})();
if("serviceWorker" in navigator){ window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{})); }
