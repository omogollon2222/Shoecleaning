# Shoe Cleaning

App web para la lavandería de zapatos y accesorios **Shoe Cleaning**: registro de pedidos, clientes, tarjeta de fidelidad y análisis de ventas. Funciona en el celular y se puede instalar como app.

## Funciones

- **Pedidos**: número automático, artículos y precios, abono o pago total, fecha de entrega.
- **Estados**: Recibido → Lavado → Secado → Esterilización → Listo → Entregado.
- **WhatsApp**: comprobante, avance del pedido, aviso de "listo" y agradecimiento con un toque.
- **Fidelización**: 10 visitas en 6 meses = 30 % de descuento en la siguiente (configurable).
- **Clientes**: historial, clientes con premio, frecuentes e inactivos.
- **Análisis**: ventas, ticket promedio, mejor día y hora, producto estrella y recomendaciones.
- **Datos**: exportar a Excel (CSV), descargar y restaurar respaldo.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `shoe-cleaning`).
2. Sube todos los archivos de esta carpeta (**Add file → Upload files**).
3. Ve a **Settings → Pages**, en *Branch* elige `main` y carpeta `/ (root)`, y guarda.
4. En 1–2 minutos la app queda en `https://TU-USUARIO.github.io/shoe-cleaning/`.
5. En el celular, abre el enlace y elige **Agregar a pantalla de inicio**.

## Importante sobre los datos

En esta versión los datos se guardan **en el navegador del dispositivo** (localStorage). No se comparten entre celulares. Descarga un respaldo desde **Ajustes** cada semana.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa (HTML, CSS y JavaScript) |
| `manifest.json` | Permite instalarla como app |
| `sw.js` | Permite abrirla sin internet |
| `icon.svg` | Ícono de la app |
