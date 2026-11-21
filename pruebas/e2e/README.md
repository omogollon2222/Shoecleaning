# Prueba de punta a punta (Chrome, Edge y Firefox)

Recorre la app completa contra los emuladores de Firebase: registro del administrador con correo,
usuarios, insumos, pedido con una foto por par (WebP y miniaturas), gastos, cierre de caja,
resumen ejecutivo, operaciones (miniaturas, foto grande, etapas, uso de insumos), recepción
(entrega con foto por par) y reglas de seguridad. También simula Safari (sin WebP → JPEG).

1. Copia la app a una carpeta de pruebas con los emuladores activados: `sync_copy.sh`
   (ajusta las rutas `N` y `R` del script). Agrega `window.__ev` solo en esa copia.
2. Arranca los emuladores (`firebase emulators:start --only auth,firestore`, con `firestore.rules`)
   y sirve la copia en `http://127.0.0.1:8097` (`python -m http.server 8097`).
3. `node e2e.mjs chrome`, `node e2e.mjs edge`, `node e2e.mjs firefox`.

Resultado del 21 nov 2026: 30/30 en Chrome 157, Edge 157 y Firefox.
