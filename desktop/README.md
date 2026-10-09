# Shoe Cleaning para Windows

App de escritorio que abre Shoe Cleaning en su propia ventana, con ícono, acceso directo en el escritorio y en el menú Inicio. Usa los mismos usuarios y datos de Firebase que los celulares.

## Instalar
1. Ejecuta `Shoe-Cleaning-Setup-1.0.0.exe`.
2. Windows puede mostrar **"Windows protegió su PC"** porque el instalador no tiene firma digital: toca **Más información → Ejecutar de todas formas**.
3. Elige la carpeta (o deja la sugerida) → **Instalar**.
4. Abre **Shoe Cleaning** desde el escritorio e inicia sesión con tu usuario.

## Cómo funciona
- La ventana carga la versión publicada en `https://omogollon2222.github.io/Shoecleaning/`. Cada mejora que se una a `main` llega sola al computador: no hay que reinstalar.
- La primera vez necesita internet. Después sigue funcionando sin conexión y sincroniza al volver.
- Los botones de WhatsApp abren WhatsApp Desktop o el navegador.
- Los PDF (resumen ejecutivo, cierre de caja) y los respaldos se guardan con el cuadro "Guardar como" de Windows.
- **F5** recarga · **Ctrl +** / **Ctrl −** agrandan o achican el texto · clic derecho para copiar y pegar.

## Desinstalar
Configuración de Windows → Aplicaciones → **Shoe Cleaning** → Desinstalar. Los datos están en la nube, no se pierden.

## Volver a compilar el instalador
- **Automático:** cada cambio en esta carpeta compila el instalador en GitHub. Descárgalo en **Actions → Instalador Windows → la última ejecución → Artifacts**. También se puede lanzar a mano con **Run workflow**.
- **En un computador con Node.js 20:** `npm install` y luego `npm run dist`. El instalador queda en `desktop/dist/`.
- Para cambiar la versión, edita `"version"` en `package.json`.
