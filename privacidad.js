// Completa el aviso de privacidad con los datos que el administrador guarda en Ajustes.
// Lee config/privacy de Firestore (lectura pública, solo esos campos) sin cargar todo Firebase.
(function(){
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  function fill(p){
    if(!p) return;
    const anios = Math.round(Number(p.anios));
    const val = {
      titular: p.titular, ruc: p.ruc, direccion: p.direccion, correo: p.correo, whatsapp: p.whatsapp,
      vigencia: /^\d{4}-\d{2}-\d{2}$/.test(p.vigencia || "") ? (() => { const [y,m,d] = p.vigencia.split("-").map(Number); return d + " de " + MESES[m-1] + " de " + y; })() : "",
      anios: anios >= 1 && anios <= 10 ? anios + (anios === 1 ? " año" : " años") : "",
      fotosDias: Number(p.fotosDias) >= 1 ? String(Math.round(Number(p.fotosDias))) : ""
    };
    // textContent: lo que escribió el administrador nunca se interpreta como HTML
    document.querySelectorAll("[data-p]").forEach(el => { const v = val[el.dataset.p]; if(v) el.textContent = String(v).slice(0, 200); });
    document.querySelectorAll("[data-show]").forEach(el => { el.hidden = !val[el.dataset.show]; });
  }
  // Mientras carga (o si no hay internet) se ocultan los datos que faltan
  document.querySelectorAll("[data-show]").forEach(el => { el.hidden = true; });
  try{ fill(JSON.parse(localStorage.getItem("sc_privacy") || "null")); }catch(e){}
  const c = window.FIREBASE_CONFIG;
  if(!c || !c.projectId || !c.apiKey) return;
  const url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(c.projectId) +
    "/databases/(default)/documents/config/privacy?key=" + encodeURIComponent(c.apiKey);
  fetch(url).then(r => r.ok ? r.json() : null).then(d => {
    if(!d || !d.fields) return;
    const p = {};
    for(const [k, v] of Object.entries(d.fields)) p[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? "";
    fill(p);
  }).catch(() => {});
})();
