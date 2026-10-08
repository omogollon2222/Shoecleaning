# Shoe Cleaning

App web para la lavandería de zapatos y accesorios **Shoe Cleaning**: pedidos, clientes, tarjeta de fidelidad, análisis de ventas, usuarios con roles y trabajo en equipo entre **recepción** y **operaciones**.

## Roles

| Rol | Qué ve |
|---|---|
| **Administrador** | Tablero en tiempo real (caja, operación, personal, tiempos por etapa), pedidos, clientes, análisis, precios, usuarios (hasta 5 operadores) |
| **Recepción** | Registrar pedidos y cobrar, fotos de recepción y entrega, entregas, consultar estado por N°, celular o nombre |
| **Operaciones** | Cola de trabajo (por lavar → lavado → secado → esterilización → listo). 🚩 un día antes de la entrega |

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa |
| `firebase-config.js` | Conexión a la nube (se llena en el paso 4) |
| `firestore.rules` | Reglas de seguridad para Firebase (paso 3) |
| `manifest.json`, `sw.js`, `icon.svg` | Instalar como app y abrir sin internet |

---

## Conectar a la nube (Firebase) — 15 minutos

Sin este paso la app funciona, pero cada celular guarda sus propios datos. Con Firebase, recepción y operaciones ven los mismos pedidos en tiempo real, y las contraseñas quedan protegidas por Google. El plan gratuito (Spark) alcanza de sobra para un local.

### 1. Crear el proyecto
1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. **Crear un proyecto** → nombre: `shoe-cleaning` → puedes desactivar Google Analytics → **Crear proyecto**.

### 2. Activar el inicio de sesión
1. Menú izquierdo: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Correo electrónico/contraseña** → activa el primer interruptor → **Guardar**.
3. Pestaña **Configuración → Dominios autorizados → Agregar dominio** → escribe `omogollon2222.github.io` → **Agregar**.

### 3. Crear la base de datos
1. Menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: la más cercana (por ejemplo `southamerica-east1` o `nam5`). Modo: **producción**.
3. Pestaña **Reglas** → borra lo que hay → pega TODO el contenido de `firestore.rules` → **Publicar**.

### 4. Copiar la configuración
1. Engranaje ⚙️ (arriba a la izquierda) → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, toca el ícono **`</>`** (Web) → apodo `shoe-cleaning` → **Registrar app** (no marques Hosting).
3. Firebase muestra un bloque `const firebaseConfig = { apiKey: ..., ... }`. Copia lo que está entre las llaves `{ }`.
4. Abre `firebase-config.js`, cambia `window.FIREBASE_CONFIG = null;` por:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "…",
     projectId: "…",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…"
   };
   ```
   Estos datos no son secretos: la seguridad la dan las reglas del paso 3.

### 5. Subir y empezar
1. Sube todos los archivos a GitHub (**Add file → Upload files**).
2. Abre `https://omogollon2222.github.io/Shoecleaning/` → crea el **administrador** (contraseña de 6 caracteres o más).
3. **Ajustes → Usuarios y roles → Agregar usuario** para recepción y operaciones.

### 6. Pasar los pedidos que ya tienes
1. En la versión anterior: **Ajustes → Descargar respaldo**.
2. En la nueva, como administrador: **Ajustes → Restaurar respaldo** y elige ese archivo.

## Avisos por WhatsApp en cada etapa
Cada vez que un pedido pasa a **lavado, secado, esterilización o listo**, queda un aviso pendiente para el cliente. A recepción y al administrador les aparece un botón verde **"Avisos por enviar"** (en tiempo real, aunque el cambio lo haga operaciones). Al tocarlo se ve la lista: **Enviar** abre WhatsApp con el mensaje ya escrito y **Omitir** lo descarta. En **Ajustes → Avisar al cliente por WhatsApp** se elige entre avisar en cada etapa o solo cuando está listo.

## Reportes en PDF por WhatsApp
- **Administrador** (Tablero o Análisis): **📊 Resumen ejecutivo** de hoy, 7 días, 30 días, este mes o el mes anterior. Incluye ventas y caja comparadas con el periodo anterior, clientes, cumplimiento de entrega, tiempos por etapa, servicios, personal y hallazgos automáticos.
- **Recepción** (Entregas) y administrador: **🧾 Cierre de caja** del día: total cobrado, efectivo, transferencias, abonos y saldos, efectivo contado con sobrante o faltante, operación del día, detalle de cobros, observaciones y espacio para firmas.
- **Compartir PDF por WhatsApp** abre el menú de compartir del celular (elige WhatsApp y el PDF va adjunto). En computadora se descarga el PDF. **Enviar resumen en texto** manda el resumen como mensaje.
- En **Ajustes → WhatsApp para recibir reportes** pon el número del dueño o gerente. Si lo dejas vacío, WhatsApp te deja elegir el contacto.

## Notas
- **Contraseñas:** cada usuario cambia la suya tocando su nombre (arriba a la derecha). Si alguien la olvida, el administrador lo desactiva y le crea un usuario nuevo (por ejemplo `maria2`).
- **Sin internet:** la app sigue funcionando y sincroniza al volver la conexión.
- **Números de recibo:** se asignan en la nube, así dos estaciones nunca repiten número.
- Para ver los datos crudos o exportar: Firebase → Firestore Database → Datos.
