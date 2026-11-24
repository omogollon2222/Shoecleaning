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
  ok(JSON.stringify(roles) === '["admin","recepcion","pruebas"]', "al crear usuario se elige Administrador, Recepción o Pruebas (ya no Operaciones)", JSON.stringify(roles));
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
    const slots = document.querySelectorAll("#pp_recepcion .slot").length;
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
  ok(nOrder.num === "B000574", `el primer pedido toma el consecutivo ${nOrder.num} (sin PEND ni saltos)`);

  // 5b. Cámara y galería, express, fecha y hora de entrega
  const ex2 = await ev(`(async () => {
    go("nuevo"); await __w(400);
    __set("#f_phone", "0995550000"); __set("#f_name", "Cliente Express");
    document.querySelectorAll("[data-inc]")[0].click(); await __w(300);
    const cam = [...document.querySelectorAll("#pp_recepcion input[capture]")].length, gal = document.querySelectorAll("#pp_recepcion label.gal").length;
    const tot = () => Math.round(parseFloat(document.querySelector("#totals .big span:last-child").textContent.replace("$","")) * 100) / 100;
    const before = tot();
    document.querySelector("#f_express").click(); await __w(300);
    const after = tot();
    const hasExpressRow = /Servicio express/.test(document.querySelector("#totals").innerText);
    const a = document.querySelector("#f_aviso"); if (!a.checked) a.click();
    __set("#f_time", ""); document.querySelector("#save").click(); await __w(400);
    const toasts = [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" | "); const needTime = /hora/i.test(toasts);
    const d = new Date(Date.now() + 2 * 86400000); const ds = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    __set("#f_due", ds); __set("#f_time", "16:30");
    const nb = orders.length; document.querySelector("#save").click(); await __until(() => orders.length > nb && document.querySelector("#scrim"), 15000);
    const wa = (document.querySelector("#scrim a.wa") || {}).href || ""; closeSheet();
    const o = orders.find(x => x.name === "Cliente Express");
    return { cam, gal, before, after, hasExpressRow, needTime, num: o.num, expressFee: o.expressFee, dueTime: o.dueTime, total: o.total, txt: dueTxt(o), wa: decodeURIComponent(wa) };
  })()`);
  ok(ex2.cam >= 1 && ex2.gal >= 1, `cada par tiene botón de Cámara (capture) y de Galería: ${ex2.cam} cámaras, ${ex2.gal} galerías`);
  ok(Math.round((ex2.after - ex2.before) * 100) === 100 && ex2.hasExpressRow && ex2.expressFee === 1, `servicio express suma $1: $${ex2.before} → $${ex2.after}`, JSON.stringify(ex2));
  ok(ex2.needTime && ex2.dueTime === "16:30" && /4:30 p\. m\./.test(ex2.txt), `pide la hora de entrega y la muestra: «${ex2.txt}»`, JSON.stringify(ex2));
  ok(ex2.num === "B000575" && /Servicio express/.test(ex2.wa) && /B000575/.test(ex2.wa), "el consecutivo sigue en orden (B000575) y el mensaje de WhatsApp lleva express y el N°", JSON.stringify(ex2));

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
    const pre = await ev(`(async () => { await navigator.serviceWorker.ready; const ks = await caches.keys(); const c = await caches.open(ks.find(k => k.startsWith("shoe-cleaning"))); const urls = (await c.keys()).map(r => r.url);
      return { fbLibs: urls.filter(u => u.includes("firebasejs")).length, app: urls.some(u => u.endsWith("/app.js")), next: await fb.doc("config/settings").get().then(d => d.data().nextNumber) }; })()`);
    ok(pre.fbLibs === 3 && pre.app, `la app y Firebase quedan guardados en el equipo; próximo consecutivo en la nube: ${pre.next}`, JSON.stringify(pre));
    for (let k = 0; k < 3; k++) { await nav(APP); await waitApp(); await help(); await ev(`(async () => !!(await __until(() => me && orders.length, 15000)))()`); await w(1500); }
    const nx = await ev(`fb.doc("config/settings").get().then(d => d.data().nextNumber)`);
    ok(nx === pre.next, `abrir la app 3 veces no gasta números (siguen en ${nx})`, `antes ${pre.next}, después ${nx}`);
    stopWeb(); await cdp("Network.enable"); await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp("Page.reload", {}); await w(3000); const back = await waitApp(); await help();
    const off = await ev(`(async () => { await __until(() => me && orders.length, 20000);
      const out = { online: navigator.onLine, me: me && me.u, orders: orders.length };
      const reg = async (name, color) => { go("nuevo"); await __w(300); __set("#f_phone", "0987654321"); __set("#f_name", name);
        document.querySelectorAll("[data-inc]")[0].click(); await __w(200);
        await __attach(document.querySelector("#pp_recepcion [data-slot]"), color); await __until(() => document.querySelectorAll("#pp_recepcion .th").length === 1, 15000);
        const a = document.querySelector("#f_aviso"); if (!a.checked) a.click();
        const before = orders.length; document.querySelector("#save").click();
        await __until(() => orders.length > before && document.querySelector("#scrim"), 15000); const msg = document.querySelector("#scrim").innerText; closeSheet();
        const o = orders.find(x => x.name === name); return { id: o.id, num: o.num, msg }; };
      const t0 = Date.now(); out.a = await reg("Sin Internet Uno", "#34495e"); out.ms = Date.now() - t0; out.b = await reg("Sin Internet Dos", "#16a085");
      go("gastos"); await __w(300); document.querySelector("[data-expnew]").click(); await __until(() => document.querySelector("#ex_cat"));
      document.querySelector("#ex_cat [data-c='otros']").click(); await __w(200); __set("#ex_d", "Gasto sin internet"); __set("#ex_a", "2"); document.querySelector("#ex_save").click();
      await __until(() => expenses.some(e => e.desc === "Gasto sin internet"), 10000); out.exp = true;
      out.sync = document.querySelector("#sync").textContent;
      await logout(); out.stillIn = !!me;
      return out; })()`);
    ok(back && off.me === "maria" && off.orders > 0 && off.online === false, "sin internet la app vuelve a abrir con la sesión y los pedidos guardados en el equipo", JSON.stringify(off));
    ok(off.a.id && off.ms < 10000 && /PEND-/.test(off.a.num) && /PEND-/.test(off.b.num) && /por asignar/.test(off.a.msg), `sin internet registra pedidos con foto (${off.ms} ms) y quedan «por asignar» (${off.a.num})`, JSON.stringify(off.a));
    ok(off.exp && /Sin internet/.test(off.sync || ""), `sin internet registra gastos; arriba dice «${off.sync}»`);
    ok(off.stillIn, "no deja cerrar sesión mientras haya datos sin subir");
    await startWeb(); await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const on = await ev(`(async () => { window.dispatchEvent(new Event("online")); const r = await __until(() => syncState === "ok" && /Sincronizado/.test(document.querySelector("#sync").textContent) && !orders.some(isPend), 60000); return { ok: !!r, sync: document.querySelector("#sync").textContent, nums: orders.filter(o => /Sin Internet/.test(o.name)).sort((x,y) => x.createdAt - y.createdAt).map(o => o.num) }; })()`);
    const H = { Authorization: "Bearer owner" }, B = "http://127.0.0.1:8080/v1/projects/demo-shoecleaning/databases/(default)/documents/";
    const od = await (await fetch(B + "orders/" + off.a.id, { headers: H })).json(), od2 = await (await fetch(B + "orders/" + off.b.id, { headers: H })).json();
    const th = await (await fetch(B + "thumbs?pageSize=300", { headers: H })).json(), ex = await (await fetch(B + "expenses?pageSize=300", { headers: H })).json();
    const thN = (th.documents || []).filter(d => [off.a.id, off.b.id].includes(d.fields.orderId.stringValue)).length, exOk = (ex.documents || []).some(d => d.fields.desc.stringValue === "Gasto sin internet");
    const nxt = await (await fetch(B + "config/settings", { headers: H })).json();
    ok(on.ok && od.fields.num.stringValue === "B000576" && od2.fields.num.stringValue === "B000577" && thN === 2 && exOk,
      `al volver internet los pedidos reciben su consecutivo en orden (${on.nums.join(", ")}), con sus fotos y el gasto («${on.sync}»)`, JSON.stringify({ on, a: od.fields.num, b: od2.fields.num, thN, exOk }));
    ok(nxt.fields.nextNumber.integerValue === "578", "el consecutivo de la nube queda en 578 (sin saltos)", JSON.stringify(nxt.fields.nextNumber));
  }

  // 10. Safari (iPhone/iPad) no comprime en WebP: usa JPEG
  const saf = await ev(`(async () => { const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(t, q){ return orig.call(this, t === "image/webp" ? "image/png" : t, q); };
    webpOk = null; const r = await compressImage(await __img("#16a085")); HTMLCanvasElement.prototype.toDataURL = orig; webpOk = null;
    return { f: r.data.slice(5, 15), fl: r.data.length, tl: r.thumb.length }; })()`);
  ok(saf.f === "image/jpeg" && saf.fl < 110000 && saf.tl < 19000, `sin WebP (como Safari) usa JPEG liviano: ${saf.fl} B`);
  // 11. Rol de pruebas: usa datos de ejemplo en el equipo y no toca los datos reales
  await logout(); await nav(APP); await waitApp(); await help();
  await ev(`(async () => { await __until(() => document.querySelector("#l_u")); __set("#l_u", "duena@prueba.test"); __set("#l_p", "Prueba12345"); document.querySelector("#gateForm").requestSubmit(); return !!(await __until(() => me && me.role === "admin", 20000)); })()`);
  await help();
  ok(await ev(`cloudCreateUser("tester", "Tester", "pruebas", "Prueba12345")`), "el administrador crea un usuario con rol Pruebas");
  const realBefore = await ev(`orders.map(o => o.num).sort().join(",")`);
  await logout(); await nav(APP); await waitApp(); await help();
  try { await ev(`(async () => { await __until(() => document.querySelector("#l_u")); __set("#l_u", "tester"); __set("#l_p", "Prueba12345"); document.querySelector("#gateForm").requestSubmit(); return true; })()`); } catch {}
  await w(5000); await waitApp(); await help();
  const sb = await ev(`(async () => { await __until(() => me && me.u, 20000);
    const out = { sandbox: SANDBOX, cloud, band: !!document.querySelector(".sbxband"), user: me && me.u, orders: orders.map(o => o.num) };
    go("nuevo"); await __w(300); __set("#f_phone", "0991112222"); __set("#f_name", "Pedido de Practica"); document.querySelectorAll("[data-inc]")[0].click(); await __w(200);
    const a = document.querySelector("#f_aviso"); if (!a.checked) a.click(); const nb = orders.length; document.querySelector("#save").click(); await __until(() => orders.length > nb && document.querySelector("#scrim"), 10000);
    out.wa = decodeURIComponent((document.querySelector("#scrim a.wa") || {}).href || ""); closeSheet();
    out.created = orders.some(o => o.name === "Pedido de Practica"); out.num = (orders.find(o => o.name === "Pedido de Practica") || {}).num;
    return out; })()`);
  ok(sb.sandbox && !sb.cloud && sb.band && sb.orders.length === 3 && /^T0000\d+$/.test(sb.orders[0]), `el rol Pruebas entra a un modo aparte con datos de ejemplo (${sb.orders.join(", ")}) y franja de aviso`, JSON.stringify(sb));
  ok(sb.created && /^T/.test(sb.num) && /\[PRUEBA\]/.test(sb.wa) && !/wa\.me\/\d/.test(sb.wa), `puede practicar: registra un pedido de prueba (${sb.num}) y WhatsApp sale marcado [PRUEBA] y sin número del cliente`, JSON.stringify(sb));
  const realAfter = await (async () => { const H = { Authorization: "Bearer owner" }; const d = await (await fetch("http://127.0.0.1:8080/v1/projects/demo-shoecleaning/databases/(default)/documents/orders?pageSize=300", { headers: H })).json(); return (d.documents || []).map(x => x.fields.num.stringValue).sort().join(","); })();
  ok(!/T0000/.test(realAfter) && realAfter === realBefore, "los datos reales no cambiaron: la práctica no creó nada en la nube", realAfter);
  try { await ev(`(async () => { exitSandbox(); return true; })()`); } catch {} await w(3500); await waitApp(); await help();
  ok(await ev(`!SANDBOX && !Object.keys(localStorage).some(k => k.startsWith("sbx_")) && !sessionStorage.getItem("sc_sandbox")`), "al salir de pruebas se borra todo lo de práctica");
  const errs = errors.filter(e => !/favicon|fonts\.g|ERR_INTERNET|ERR_ABORTED|ERR_CONNECTION_REFUSED|Failed to load resource|Could not reach Cloud Firestore|offline|net::/i.test(e));
  ok(errs.length === 0, "sin errores de JavaScript en la consola", errs.slice(0, 5).join(" | "));
