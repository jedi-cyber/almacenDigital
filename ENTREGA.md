# Entrega Proyecto 1

## F1

Ejecutar `npm test`.

Resultado esperado: pruebas de `types.ts`, `calcShelfStatus()` y `canPlace()` pasando al 100%.

## F2

Ejecutar `npm run demo:f2`.

Resultado esperado: 10 cajas colocadas en consola sin intersección.

## F3

Arrancar XAMPP y ejecutar `npm run dev`.

Resultado esperado: estantes visibles, luces, sombras, paredes y `OrbitControls` funcionando.

## F4

Agregar productos desde el formulario.

Resultado esperado: las cajas aparecen en escena sin superponerse, con animación de aparición.

## F5

Buscar un SKU existente con el buscador. La cámara hace tween hacia el producto y éste se resalta en cian. Buscar un SKU inexistente muestra un mensaje de error.

Video: `https://youtu.be/Vzc7hMxE7jk`

## F6 — Persistencia

Arrancar XAMPP (Apache + MySQL activos) y ejecutar `npm run dev`.

Las migraciones se ejecutan automáticamente en la primera petición a la API.

Resultado esperado:

- Al recargar la página, los estantes conservan posición, rotación, secciones y pisos.
- Al recargar la página, todos los productos colocados se restauran en sus posiciones exactas.
- Endpoints verificables en `http://127.0.0.1/almacenDigital/api/config.php` y `.../api/productos.php`.
