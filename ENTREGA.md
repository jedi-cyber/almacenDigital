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

Secuencia recomendada para el video:

1. Abrir la aplicación (con XAMPP activo).
2. Mostrar que los estantes y productos del estado anterior se restauran automáticamente.
3. Agregar uno o dos productos nuevos.
4. Buscar un SKU existente y mostrar la animación de cámara y el highlight.
5. Eliminar un producto y verificar que desaparece de la escena.
6. Transferir un producto a otro estante.
7. Buscar un SKU inexistente y mostrar el mensaje de error.
8. Activar modo edición: mover un estante arrastrándolo, rotarlo con `R`.
9. Agregar un piso intermedio a un estante y guardar.
10. Recargar la página y mostrar que el estado persiste.

## F6 — Persistencia

Arrancar XAMPP (Apache + MySQL activos) y ejecutar `npm run dev`.

Las migraciones se ejecutan automáticamente en la primera petición a la API.

Resultado esperado:

- Al recargar la página, los estantes conservan posición, rotación, secciones y pisos.
- Al recargar la página, todos los productos colocados se restauran en sus posiciones exactas.
- Endpoints verificables en `http://127.0.0.1/almacenDigital/api/config.php` y `.../api/productos.php`.
