# Pruebas de las reglas de Firestore

Comprueban que cada rol solo puede hacer lo que le corresponde (`../firestore.rules`).
No se publican con la app (el `.htaccess` bloquea esta carpeta).

Requisitos: Node 18+ y Java 11+ (el emulador de Firebase lo necesita).

```
cd pruebas
npm install
npm test
```

Todas deben pasar **antes** de copiar las reglas a la consola de Firebase.

Además hay una prueba de la app completa en tres navegadores: ver `e2e/README.md`.
