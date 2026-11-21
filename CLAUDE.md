# CLAUDE.md — Shoe Cleaning

Contexto para Claude Code. Colocar este archivo en la raíz del repo `omogollon2222/Shoecleaning` (rama `seguro`).

## Qué es
App web (PWA, HTML + JS puro, sin framework ni build) para **Shoe Cleaning**, lavandería de zapatos y accesorios en Ecuador. Registra pedidos y cobros, clientes, tarjeta de fidelidad, análisis de ventas y trabajo en equipo entre recepción y operaciones.

Principio de diseño: **muy sencilla e intuitiva**, pensada para tablet/celular (Safari y Chrome), con todas las funciones necesarias para mejorar las ventas. Interfaz en español.

## Dónde vive
| Qué | Dónde |
|---|---|
| Código | GitHub `omogollon2222/Shoecleaning` |
| Rama de producción | **`seguro`** → Hostinger (Avanzado → GIT → volver a implementar) |
| Producción | https://shoecleaning.consultecapps.com (`public_html/shoecleaning`) |
| Rama antigua | GitHub Pages: https://omogollon2222.github.io/Shoecleaning/ |
| Backend | Firebase proyecto **`shoe-cleaning-2ed47`** (plan Spark): Auth correo/contraseña + Firestore |

Flujo de despliegue: commit/push a `seguro` → en Hostinger, GIT → *Implementar*. No hay paso de build.

## Archivos
| Archivo | Función |
|---|---|
| `index.html` | Estructura de la app (sin scripts en línea, por la CSP) |
| `app.js` | Toda la lógica |
| `firebase-config.js` | `window.FIREBASE_CONFIG` (no es secreto; la seguridad está en las reglas) |
| `firestore.rules` | Reglas de seguridad — publicar a mano en la consola de Firebase tras cambiarlas |
| `.htaccess` | CSP, HTTPS forzado, HSTS, X-Frame-Options DENY, nosniff; bloquea descarga de `.htaccess` y `firestore.rules` |
| `manifest.json`, `sw.js`, `icon.svg` | Instalación como app y funcionamiento sin internet |

Si se agrega un script o dominio externo, actualizar la CSP de `.htaccess` o el navegador lo bloqueará. Al cambiar archivos cacheados, subir la versión de caché en `sw.js`.

## Cuentas
- **Administradores:** entran con su **correo real**. El primer administrador se registra con correo y crea su contraseña. Los siguientes se invitan en Ajustes → Agregar usuario → Administrador: se crea la cuenta con una clave al azar y Firebase envía el enlace para que creen la suya (`cloudInviteAdmin`). «¿Olvidaste tu contraseña?» en el inicio de sesión envía el enlace de recuperación (mismo mensaje exista o no el correo).
- **Recepción y operaciones:** usuario + contraseña (correo interno `usuario@shoecleaning.app`, sin recuperación por correo).
- El perfil (`users/{uid}`) guarda `username` (para firmar pedidos; en administradores con correo es la parte antes de la @) y `email` opcional, validado en las reglas.

## Roles
- **Administrador:** Tablero en vivo (caja, por cobrar, etapas, cuello de botella, personal en línea, tiempos por etapa), pedidos, clientes, análisis (incl. asistencia y productividad), precios, usuarios (máx. 5 operadores), respaldo/restauración.
- **Recepción:** registrar pedidos y cobrar, fotos de recepción y entrega, entregas, buscar por N°, celular o nombre.
- **Operaciones:** cola de trabajo por lavar → lavado → secado → esterilización → listo. 🚩 un día antes de la fecha de entrega. Solo puede avanzar etapas y subir fotos.

## Firestore
Colecciones: `users`, `config`, `orders`, `photos`, `presence`, `logins`.
- Fotos comprimidas en el cliente (~60 KB, ≤200 KB por regla, máx. 3 por etapa), guardadas en Firestore.
- N° de recibo asignado de forma atómica en la nube (dos estaciones nunca repiten).
- Ingresos (`logins`) visibles solo para el admin; presencia: cada uno escribe la suya.
- Funciona sin conexión y sincroniza al volver.

### Reglas (revisión 8 nov 2026, rama `revision-seguridad`) — no debilitar
- Cierran por defecto; regla final niega cualquier colección no prevista.
- `orders`: `id` del campo == id del documento; tipos y tamaños validados; Operaciones solo cambia etapa/fotos; solo admin cambia fecha y autor de creación.
- `photos`: se validan `id`, `orderId` y etapa.
- `users`: rol ∈ {admin, recepcion, operaciones}; solo admin gestiona usuarios.
- `logins`: el rol no se puede falsificar.
- Revisión 8 nov: cada campo se valida por tipo (`orderTypesOk`); Operaciones solo toca etapas (no entrega ni cobra); Recepción no cambia montos ni deshace entregas; fotos solo `data:image`, <160 KB, sin campos extra, de un pedido existente.
- Pruebas en `pruebas/` (emulador, requiere Java). Correrlas antes de publicar reglas.

## Seguridad (auditoría 5 nov 2026)
- Todo lo que se pinta en HTML se escapa (nombres, notas, `id`). Mantener esa regla en cualquier código nuevo: nunca `innerHTML` con datos sin escapar.
- Fotos se validan antes de mostrarse.
- `norm()` y `normSettings()` en app.js limpian todo dato que llega (nube, respaldo, local): defensa aunque las reglas fallen.

## Datos personales (LOPDP)
- Al registrar: casilla obligatoria "Informé al cliente" (`avisoOk`) y opcional de promociones (`promoOk`). Solo se escribe "Te extrañamos" a quien aceptó.
- `privacidad.html` + `privacidad.js`: aviso de privacidad. Los datos del titular (razón social, RUC, dirección, correo, WhatsApp, vigencia, años de conservación) se editan en **Ajustes → Aviso de privacidad** y se guardan en `config/privacy` (lectura pública, escritura solo admin, campos validados). La página los lee por la API REST de Firestore y los pinta con `textContent`. Conservación recomendada: 2 años desde la última visita.
- Admin → Cliente → "Borrar datos personales": quita nombre, celular, notas y fotos; deja montos.
- Fotos: máx. 3 por etapa, se borran solas a los 60 días de entregado (`photoDays`), y al eliminar el pedido.
- Al cerrar sesión se borra la copia local (tablets compartidas).

## Pendientes
1. Probar con cada rol: crear pedido, avanzar etapa, entregar, subir foto.
2. Google Cloud → Credenciales → restringir la API key a `shoecleaning.consultecapps.com` (y `github.io` mientras se use).
3. Firebase Auth → política de contraseñas mínimo 8.
4. App Check cuando haya varios clientes; alerta de presupuesto si se pasa a Blaze.
5. La versión antigua (artefacto en Claude) no tiene las funciones nuevas; la oficial es este repo.
6. Variante pedida: versión HTML **sin contraseñas** para tablet, con Operaciones simplificada a solo "recibido" y "listo para entrega" (sin etapas) y fotos por cada par en recepción y entrega.

## Hacia multi-cliente (SaaS con pago mensual)
Decisiones (8 nov 2026): una sola página y cada negocio entra con su **código de negocio** (no subdominios); **seguir en Spark** (fotos en Firestore, sin Storage); por ahora **2 clientes**.

Hoy la app es de **un solo negocio**: un segundo cliente en el mismo Firebase vería los datos del primero.

Arquitectura objetivo:
- Un solo código en Hostinger y un solo proyecto Firebase.
- Datos por negocio: `tenants/{negocio}/orders`, `/photos`, `/settings`…; `users/{uid}` con `tenantId` y `role`.
- `tenants/{negocio}`: nombre, plan, `paidUntil`, máx. usuarios, estado.
- Reglas: cada usuario solo lee/escribe su tenant; si `paidUntil` venció → solo lectura.
- Rol **dueño de la plataforma** con panel: crear negocio, ver vencimientos, "+1 mes", suspender.
- Registro: página de venta → "Prueba 14 días" → crea negocio + administrador.
- Migración: script que mueva los datos actuales a `tenants/shoecleaning/...`.

Cobro (Ecuador): Fase 1 link PayPhone o transferencia + botón "+1 mes" manual. Fase 2 Kushki (suscripciones + webhook a PHP en Hostinger o Cloud Functions que actualiza `paidUntil`). Stripe no acepta directamente empresas ecuatorianas.

Costos: Spark es compartido (50 000 lecturas / 20 000 escrituras al día, 1 GB). Para multi-cliente: cargar solo pedidos activos, mover fotos a Storage, pasar a Blaze con alerta.

Legal: factura electrónica SRI, términos y condiciones, política de privacidad (LOPDP).

El modo local (sin Firebase) no se vende.

## Cómo trabajar aquí
- Mantener HTML/JS sin dependencias ni build salvo que se pida.
- Textos de la interfaz en español, botones grandes, pocos pasos.
- Cambios en `firestore.rules` → avisar que hay que publicarlas en la consola de Firebase.
- Antes de dar algo por terminado, probar el flujo con los tres roles.
