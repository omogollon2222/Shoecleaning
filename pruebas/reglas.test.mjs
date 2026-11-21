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
test("contador de fotos admite una por par (hasta 30)", () => assertSucceeds(db("r1").doc("orders/p1").update({ photos: { recepcion: 12, entrega: 0 } })));
test("contador de fotos no pasa de 30", () => assertFails(db("r1").doc("orders/p1").update({ photos: { recepcion: 31, entrega: 0 } })));
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

// ---------- Fotos por par con miniatura ----------
const THUMB = "data:image/webp;base64,UklGRhIAAABXRUJQVlA4";
const photoDoc = (id, o = {}) => Object.assign({ id, orderId: "p1", num: "B000001", stage: "recepcion", data: IMG, at: now(), by: "maria", slot: "clasicos:1", label: "Zapatos 1" }, o);
test("recepción guarda foto y miniatura de un par", async () => {
  const f = db("r1"); const b = f.batch();
  b.set(f.doc("photos/f1"), photoDoc("f1"));
  b.set(f.doc("thumbs/f1"), { id: "f1", orderId: "p1", stage: "recepcion", slot: "clasicos:1", label: "Zapatos 1", data: THUMB, at: now() });
  await assertSucceeds(b.commit());
});
test("miniatura sin su foto se rechaza", () =>
  assertFails(db("r1").doc("thumbs/f9").set({ id: "f9", orderId: "p1", stage: "recepcion", slot: "", label: "", data: THUMB, at: now() })));
test("miniatura de otro pedido que su foto se rechaza", async () => {
  await env.withSecurityRulesDisabled(async c => { await c.firestore().doc("photos/f2").set(photoDoc("f2")); });
  await assertFails(db("r1").doc("thumbs/f2").set({ id: "f2", orderId: "p2", stage: "recepcion", slot: "", label: "", data: THUMB, at: now() }));
});
test("miniatura grande (más de 20 KB) se rechaza", async () => {
  const f = db("r1"); const b = f.batch();
  b.set(f.doc("photos/f3"), photoDoc("f3"));
  b.set(f.doc("thumbs/f3"), { id: "f3", orderId: "p1", stage: "recepcion", slot: "", label: "", data: "data:image/webp;base64," + "A".repeat(21000), at: now() });
  await assertFails(b.commit());
});
test("foto con slot inválido se rechaza", () => assertFails(db("r1").doc("photos/f4").set(photoDoc("f4", { slot: "<b>" }))));
test("operaciones ve miniaturas", async () => {
  await env.withSecurityRulesDisabled(async c => { await c.firestore().doc("thumbs/f5").set({ id: "f5", orderId: "p1", stage: "recepcion", slot: "", label: "", data: THUMB, at: now() }); });
  await assertSucceeds(db("o1").doc("thumbs/f5").get());
});

// ---------- Gastos ----------
const gasto = (id, o = {}) => Object.assign({ id, day: "2026-11-21", at: now(), cat: "almuerzos", desc: "Almuerzo del personal", amount: 9, method: "Efectivo", by: "maria" }, o);
test("recepción registra un gasto", () => assertSucceeds(db("r1").doc("expenses/g1").set(gasto("g1"))));
test("recepción NO registra gastos con fecha pasada", () => assertFails(db("r1").doc("expenses/g2").set(gasto("g2", { at: now() - 5 * 86400000 }))));
test("recepción NO registra a nombre de otro", () => assertFails(db("r1").doc("expenses/g3").set(gasto("g3", { by: "admin" }))));
test("operaciones NO registra gastos", () => assertFails(db("o1").doc("expenses/g4").set(gasto("g4", { by: "pedro" }))));
test("gasto con categoría inventada o monto 0 se rechaza", async () => {
  await assertFails(db("r1").doc("expenses/g5").set(gasto("g5", { cat: "fiesta" })));
  await assertFails(db("r1").doc("expenses/g6").set(gasto("g6", { amount: 0 })));
});
test("recepción ve gastos recientes y NO los antiguos", async () => {
  await env.withSecurityRulesDisabled(async c => {
    const fs = c.firestore();
    await fs.doc("expenses/n1").set(gasto("n1"));
    await fs.doc("expenses/v1").set(gasto("v1", { at: now() - 10 * 86400000 }));
  });
  const f = db("r1");
  const step = async (n, p) => { try { await p; } catch (e) { throw new Error(n + ": " + e.message); } };
  await step("lee reciente", assertSucceeds(f.doc("expenses/n1").get()));
  await step("no lee antiguo", assertFails(f.doc("expenses/v1").get()));
  await step("consulta reciente", assertSucceeds(f.collection("expenses").where("at", ">=", now() - 36 * 3600000).get()));
  await step("consulta todo", assertFails(f.collection("expenses").get()));
});
test("operaciones NO ve gastos", async () => {
  await env.withSecurityRulesDisabled(async c => { await c.firestore().doc("expenses/n2").set(gasto("n2")); });
  await assertFails(db("o1").doc("expenses/n2").get());
});
test("solo el administrador borra o corrige gastos", async () => {
  await env.withSecurityRulesDisabled(async c => { await c.firestore().doc("expenses/n3").set(gasto("n3")); });
  await assertFails(db("r1").doc("expenses/n3").delete());
  await assertFails(db("r1").doc("expenses/n3").update({ amount: 1 }));
  await assertSucceeds(db("a1").doc("expenses/n3").update({ amount: 10 }));
  await assertSucceeds(db("a1").doc("expenses/n3").delete());
});

// ---------- Inventario de insumos ----------
const supply = (o = {}) => Object.assign({ id: "s1", name: "Jabón neutro", unit: "litros", stock: 5, min: 2, createdAt: now(), updatedAt: now() }, o);
const seedSupply = () => env.withSecurityRulesDisabled(async c => { await c.firestore().doc("supplies/s1").set(supply()); });
const moveBatch = (uid, by, mid, type, qty, newStock) => {
  const f = db(uid); const b = f.batch();
  b.set(f.doc("supplyMoves/" + mid), { id: mid, sid: "s1", type, qty, at: now(), by });
  b.update(f.doc("supplies/s1"), { stock: newStock, updatedAt: now(), lastMove: mid });
  return b.commit();
};
test("solo el administrador crea insumos", async () => {
  await assertFails(db("r1").doc("supplies/s1").set(supply()));
  await assertSucceeds(db("a1").doc("supplies/s1").set(supply()));
});
test("operaciones registra uso y baja el stock", async () => { await seedSupply(); await assertSucceeds(moveBatch("o1", "pedro", "m1", "uso", -1, 4)); });
test("uso con stock que no cuadra se rechaza", async () => { await seedSupply(); await assertFails(moveBatch("o1", "pedro", "m2", "uso", -1, 5)); });
test("cambiar el stock sin movimiento se rechaza", async () => {
  await seedSupply();
  await assertFails(db("o1").doc("supplies/s1").update({ stock: 50 }));
  await assertFails(db("a1").doc("supplies/s1").update({ stock: 50 }));
});
test("recepción registra compra (sube stock); operaciones NO", async () => {
  await seedSupply();
  await assertSucceeds(moveBatch("r1", "maria", "m3", "compra", 3, 8));
  await assertFails(moveBatch("o1", "pedro", "m4", "compra", 3, 11));
});
test("solo el administrador ajusta por conteo", async () => {
  await seedSupply();
  await assertFails(moveBatch("r1", "maria", "m5", "ajuste", 2, 7));
  await assertSucceeds(moveBatch("a1", "admin", "m6", "ajuste", 2, 7));
});
test("uso que deja stock negativo se rechaza", async () => { await seedSupply(); await assertFails(moveBatch("o1", "pedro", "m7", "uso", -9, -4)); });
test("movimiento suelto (sin actualizar stock) se rechaza", () =>
  assertFails(db("o1").doc("supplyMoves/m8").set({ id: "m8", sid: "s1", type: "uso", qty: -1, at: now(), by: "pedro" })));
test("nadie edita ni borra movimientos", async () => {
  await seedSupply(); await moveBatch("a1", "admin", "m9", "ajuste", 1, 6);
  await assertFails(db("a1").doc("supplyMoves/m9").update({ qty: 100 }));
  await assertFails(db("a1").doc("supplyMoves/m9").delete());
});
test("administrador edita nombre y mínimo sin tocar stock", async () => {
  await seedSupply();
  await assertSucceeds(db("a1").doc("supplies/s1").update({ name: "Jabón", min: 3, updatedAt: now() }));
  await assertFails(db("r1").doc("supplies/s1").update({ name: "X", updatedAt: now() }));
});
