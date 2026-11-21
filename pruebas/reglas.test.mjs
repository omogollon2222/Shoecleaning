// Pruebas de firestore.rules con el emulador de Firebase.
// Correr desde la carpeta pruebas:  npm install  y luego  npm test   (requiere Java 11+).
import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";

let env;
const USERS = { a1: ["admin", "admin"], r1: ["recepcion", "maria"], o1: ["operaciones", "pedro"] };
const now = () => Date.now();
const order = (o = {}) => Object.assign({
  id: "p1", num: "B000001", name: "Ana", phone: "0991234567", phoneKey: "0991234567",
  items: [{ key: "clasicos", label: "Zapatos", qty: 1, price: 4 }], subtotal: 4, discount: 0, discountPct: 0,
  total: 4, abono: 4, paidFull: true, method: "Efectivo", notes: "", status: "recibido", createdAt: now(),
  dueDate: "2026-11-12", loyaltyRedeemed: false, createdBy: "maria", photos: { recepcion: 0, entrega: 0 },
  avisoOk: true, promoOk: false
}, o);
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U";
const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-shoecleaning",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const f = c.firestore();
    for (const [uid, [role, username]] of Object.entries(USERS)) await f.doc(`users/${uid}`).set({ username, name: username, role, createdAt: 1 });
    await f.doc("config/bootstrap").set({ at: 1, by: "admin" });
    await f.doc("config/settings").set({ nextNumber: 10, business: "Shoe Cleaning" });
    await f.doc("orders/p1").set(order());
    await f.doc("orders/p2").set(order({ id: "p2", status: "entregado", deliveredAt: now(), cobradoEntrega: 0 }));
  });
});

// ---------- Acceso básico ----------
test("sin sesión no se lee nada", () => assertFails(db(null).doc("orders/p1").get()));
test("cuenta sin perfil no lee pedidos", () => assertFails(db("intruso").doc("orders/p1").get()));
test("nadie se vuelve admin creando su perfil", () => assertFails(db("intruso").doc("users/intruso").set({ username: "x", name: "x", role: "admin" })));
test("recepción no cambia su propio rol", () => assertFails(db("r1").doc("users/r1").update({ role: "admin" })));

// ---------- Inyección y caída (hallazgos del 8-nov) ----------
test("operaciones no puede meter HTML en el contador de fotos", () =>
  assertFails(db("o1").doc("orders/p1").update({ photos: { recepcion: "<img src=x onerror=alert(1)>", entrega: 0 } })));
test("operaciones no puede poner una fecha no válida (tumbaba la app)", () => assertFails(db("o1").doc("orders/p1").update({ dueDate: 12345 })));
test("recepción no puede crear artículos que no sean lista", () => assertFails(db("r1").doc("orders/p3").set(order({ id: "p3", items: "<b>x</b>" }))));
test("recepción no puede meter HTML en el % de descuento", () => assertFails(db("r1").doc("orders/p3").set(order({ id: "p3", discountPct: "<img>" }))));
test("no se aceptan campos desconocidos al crear", () => assertFails(db("r1").doc("orders/p3").set(order({ id: "p3", extra: "x" }))));

// ---------- Operaciones ----------
test("operaciones avanza etapa", () => assertSucceeds(db("o1").doc("orders/p1").update({ status: "lavado", lavadoAt: now(), lavadoBy: "pedro" })));
test("operaciones marca listo", () => assertSucceeds(db("o1").doc("orders/p1").update({ status: "listo", readyAt: now(), listoBy: "pedro" })));
test("operaciones NO entrega", () => assertFails(db("o1").doc("orders/p1").update({ status: "entregado", deliveredAt: now() })));
test("operaciones NO toca el cobro", () => assertFails(db("o1").doc("orders/p1").update({ cobradoEntrega: 0 })));
test("operaciones NO cambia la fecha de entrega", () => assertFails(db("o1").doc("orders/p1").update({ dueDate: "2030-01-01" })));
test("operaciones NO crea pedidos", () => assertFails(db("o1").doc("orders/p3").set(order({ id: "p3", createdBy: "pedro" }))));

// ---------- Recepción ----------
test("recepción crea un pedido válido", () => assertSucceeds(db("r1").doc("orders/p3").set(order({ id: "p3" }))));
test("recepción NO crea a nombre de otra persona", () => assertFails(db("r1").doc("orders/p3").set(order({ id: "p3", createdBy: "admin" }))));
test("recepción NO crea pedidos ya entregados", () => assertFails(db("r1").doc("orders/p3").set(order({ id: "p3", status: "entregado" }))));
test("recepción entrega y cobra", () => assertSucceeds(db("r1").doc("orders/p1").update({ status: "entregado", deliveredAt: now(), deliveredBy: "maria", paidFull: true, cobradoEntrega: 0, methodFinal: "Efectivo" })));
test("recepción NO cambia el total de un pedido", () => assertFails(db("r1").doc("orders/p1").update({ total: 1 })));
test("recepción NO deshace una entrega", () => assertFails(db("r1").doc("orders/p2").update({ status: "listo", deliveredAt: null })));
test("recepción agrega foto a pedido entregado", () => assertSucceeds(db("r1").doc("orders/p2").update({ photos: { recepcion: 0, entrega: 1 } })));
test("contador de fotos no pasa de 3", () => assertFails(db("r1").doc("orders/p1").update({ photos: { recepcion: 4, entrega: 0 } })));
test("recepción avanza el N° de recibo de uno en uno", () => assertSucceeds(db("r1").doc("config/settings").update({ nextNumber: 11 })));
test("recepción NO salta números de recibo", () => assertFails(db("r1").doc("config/settings").update({ nextNumber: 50 })));
test("operaciones NO toca el N° de recibo", () => assertFails(db("o1").doc("config/settings").update({ nextNumber: 11 })));
test("recepción NO borra pedidos", () => assertFails(db("r1").doc("orders/p1").delete()));

// ---------- Fotos ----------
const photo = (o = {}) => Object.assign({ id: "f1", orderId: "p1", num: "B000001", stage: "recepcion", data: IMG, at: now(), by: "maria" }, o);
test("foto válida", () => assertSucceeds(db("r1").doc("photos/f1").set(photo())));
test("foto con campo extra (relleno) se rechaza", () => assertFails(db("r1").doc("photos/f1").set(photo({ relleno: "x".repeat(500000) }))));
test("foto que no es imagen se rechaza", () => assertFails(db("r1").doc("photos/f1").set(photo({ data: "javascript:alert(1)" }))));
test("foto de más de 160 KB se rechaza", () => assertFails(db("r1").doc("photos/f1").set(photo({ data: "data:image/jpeg;base64," + "A".repeat(170000) }))));
test("foto de un pedido que no existe se rechaza", () => assertFails(db("r1").doc("photos/f1").set(photo({ orderId: "nope" }))));
test("recepción NO borra fotos", async () => {
  await env.withSecurityRulesDisabled(c => c.firestore().doc("photos/f1").set(photo()));
  await assertFails(db("r1").doc("photos/f1").delete());
});
test("administrador borra fotos (retención)", async () => {
  await env.withSecurityRulesDisabled(c => c.firestore().doc("photos/f1").set(photo()));
  await assertSucceeds(db("a1").doc("photos/f1").delete());
});

// ---------- Administrador ----------
test("administrador borra datos del cliente", () => assertSucceeds(db("a1").doc("orders/p1").update({ name: "Cliente eliminado", phone: "", phoneKey: "", notes: "", erasedAt: now() })));
test("administrador deshace una entrega", () => assertSucceeds(db("a1").doc("orders/p2").update({ status: "listo", deliveredAt: null })));
test("administrador no se borra a sí mismo", () => assertFails(db("a1").doc("users/a1").delete()));
test("solo el administrador ve los ingresos del personal", () => assertFails(db("r1").collection("logins").get()));
test("nadie registra un ingreso con rol falso", () => assertFails(db("o1").collection("logins").add({ uid: "o1", u: "pedro", name: "p", role: "admin", at: now(), day: "2026-11-08", type: "login", dev: "Android" })));
test("presencia con rol falso se rechaza", () => assertFails(db("o1").doc("presence/o1").set({ uid: "o1", u: "pedro", name: "p", role: "admin", lastSeen: now(), since: now(), offline: false })));

// ---------- Aviso de privacidad (config/privacy) ----------
const PRIV = { titular: "Shoe Cleaning S.A.", ruc: "1790012345001", direccion: "Av. Siempre Viva 123, Quito", correo: "datos@ejemplo.com", whatsapp: "0980035702", vigencia: "2026-11-21", anios: 2, fotosDias: 60 };
test("cualquiera lee el aviso de privacidad (sin sesión)", async () => {
  await env.withSecurityRulesDisabled(async c => { await c.firestore().doc("config/privacy").set(PRIV); });
  await assertSucceeds(db(null).doc("config/privacy").get());
});
test("sin sesión NO se lee el resto de config", async () => {
  await assertFails(db(null).doc("config/settings").get());
});
test("administrador guarda el aviso de privacidad", async () => {
  await assertSucceeds(db("a1").doc("config/privacy").set(PRIV));
});
test("recepción y operaciones NO cambian el aviso", async () => {
  await assertFails(db("r1").doc("config/privacy").set(PRIV));
  await assertFails(db("o1").doc("config/privacy").set(PRIV));
  await assertFails(db(null).doc("config/privacy").set(PRIV));
});
test("aviso con campo extra se rechaza", async () => {
  await assertFails(db("a1").doc("config/privacy").set({ ...PRIV, script: "<script>" }));
});
test("aviso con años fuera de rango o RUC con letras se rechaza", async () => {
  await assertFails(db("a1").doc("config/privacy").set({ ...PRIV, anios: 50 }));
  await assertFails(db("a1").doc("config/privacy").set({ ...PRIV, anios: "2" }));
  await assertFails(db("a1").doc("config/privacy").set({ ...PRIV, ruc: "17900ABC" }));
  await assertFails(db("a1").doc("config/privacy").set({ ...PRIV, titular: "x".repeat(121) }));
});
test("nadie borra el aviso", async () => {
  await env.withSecurityRulesDisabled(async c => { await c.firestore().doc("config/privacy").set(PRIV); });
  await assertFails(db("a1").doc("config/privacy").delete());
});

// ---------- Administrador con correo ----------
test("administrador crea otro administrador con correo", () =>
  assertSucceeds(db("a1").doc("users/nuevo").set({ username: "dueno", name: "Dueño", role: "admin", email: "dueno@gmail.com", createdAt: now(), createdBy: "admin" })));
test("correo inválido en el perfil se rechaza", () =>
  assertFails(db("a1").doc("users/nuevo").set({ username: "dueno", name: "Dueño", role: "admin", email: "<script>", createdAt: now(), createdBy: "admin" })));
test("recepción NO crea administradores con correo", () =>
  assertFails(db("r1").doc("users/nuevo").set({ username: "dueno", name: "Dueño", role: "admin", email: "dueno@gmail.com", createdAt: now() })));

// ---------- Cambiar rol ----------
test("administrador cambia el rol de otro usuario", () => assertSucceeds(db("a1").doc("users/r1").update({ role: "operaciones" })));
test("administrador NO pone un rol inventado", () => assertFails(db("a1").doc("users/r1").update({ role: "superadmin" })));
test("administrador NO cambia el usuario al cambiar el rol", () => assertFails(db("a1").doc("users/r1").update({ role: "admin", username: "otra" })));
test("recepción NO cambia el rol de otro", () => assertFails(db("r1").doc("users/o1").update({ role: "admin" })));
test("operaciones NO se sube a administrador", () => assertFails(db("o1").doc("users/o1").update({ role: "admin" })));
