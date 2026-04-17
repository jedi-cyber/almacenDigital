# Reporte de Creacion del Proyecto

## 1. Objetivo del proyecto

El proyecto `almacenDigital` fue creado como una aplicacion academica para simular un almacen digital 3D. Su meta principal es combinar:

- logica de empaquetado espacial para decidir si un producto cabe en un estante,
- visualizacion 3D interactiva en navegador,
- y persistencia de datos mediante una API PHP conectada a MySQL.

Esta intencion aparece descrita en [README.md](/c:/xampp/htdocs/almacenDigital/README.md:1) y se confirma en la organizacion del codigo fuente dentro de `src/`, `api/` y `tests/`.

## 2. Tecnologias con las que se inicio

La base tecnica del proyecto se construyo con un stack web sencillo y orientado a desarrollo local:

- Frontend con `TypeScript` y `Vite`, definido en [package.json](/c:/xampp/htdocs/almacenDigital/package.json:1).
- Motor grafico con `Three.js` para la escena 3D y `GSAP` para animaciones, tambien declarados en [package.json](/c:/xampp/htdocs/almacenDigital/package.json:13).
- Backend con `PHP` y `MySQL`, visible en la carpeta [api](/c:/xampp/htdocs/almacenDigital/api).
- Pruebas automatizadas con `Vitest`, configuradas en [vitest.config.ts](/c:/xampp/htdocs/almacenDigital/vitest.config.ts:1) y `vitest.integration.config.ts`.
- Entorno local basado en `XAMPP`, evidenciado por la ruta de despliegue explicada en [README.md](/c:/xampp/htdocs/almacenDigital/README.md:87) y por el proxy de Vite en [vite.config.ts](/c:/xampp/htdocs/almacenDigital/vite.config.ts:15).

## 3. Forma en que se fue construyendo

La evidencia del repositorio muestra que el proyecto no se creo de una sola vez, sino por fases funcionales.

### Fase 1: logica base del dominio

Primero se construyo el nucleo del problema: representar estantes, productos y calculos volumetricos. Esto se observa en archivos como:

- [src/types.ts](/c:/xampp/htdocs/almacenDigital/src/types.ts)
- [src/volume.ts](/c:/xampp/htdocs/almacenDigital/src/volume.ts)
- [src/shelfStatus.ts](/c:/xampp/htdocs/almacenDigital/src/shelfStatus.ts)

Las pruebas [tests/shelfStatus.test.ts](/c:/xampp/htdocs/almacenDigital/tests/shelfStatus.test.ts) reflejan que esta primera etapa se enfoco en validar calculos de volumen total, ocupado y libre del estante.

### Fase 2: algoritmo de colocacion espacial

Despues se desarrollo la logica que decide si un item puede colocarse dentro de un estante sin colisionar con otros. El centro de esta fase es [src/canPlace.ts](/c:/xampp/htdocs/almacenDigital/src/canPlace.ts:1).

Este archivo muestra que el proyecto empezo con una logica de empaquetado basada en:

- cajas AABB,
- seis orientaciones posibles del producto,
- soporte para secciones y pisos,
- y una optimizacion posterior basada en compresion de coordenadas.

La existencia de [tests/canPlace.test.ts](/c:/xampp/htdocs/almacenDigital/tests/canPlace.test.ts) confirma que esta logica fue desarrollada con validacion automatizada.

### Fase 3: visualizacion 3D

Una vez resuelto el problema logico, se agrego la escena 3D. Esto se ve en:

- [src/scene.ts](/c:/xampp/htdocs/almacenDigital/src/scene.ts)
- [src/warehouseScene.ts](/c:/xampp/htdocs/almacenDigital/src/warehouseScene.ts)
- [src/main.ts](/c:/xampp/htdocs/almacenDigital/src/main.ts:1)

El arranque de la aplicacion desde `main.ts` demuestra que luego se conecto la logica con una interfaz visual. Tambien se incorporaron estilos, pantalla de carga y montaje sobre `#app`, lo que indica un paso desde prototipo logico a aplicacion usable en navegador.

### Fase 4: interfaz para interactuar con el almacen

Mas adelante se separo la UI en modulos especificos:

- [src/ui.ts](/c:/xampp/htdocs/almacenDigital/src/ui.ts)
- [src/ui-builder.ts](/c:/xampp/htdocs/almacenDigital/src/ui-builder.ts)
- [src/ui-handlers.ts](/c:/xampp/htdocs/almacenDigital/src/ui-handlers.ts)
- [src/ui-copy.ts](/c:/xampp/htdocs/almacenDigital/src/ui-copy.ts)

Esto sugiere una evolucion desde una interfaz mas simple a una estructura mas mantenible, donde la construccion visual, los textos y los eventos quedaron desacoplados.

### Fase 5: funcionalidades de operacion

Luego se agregaron funcionalidades mas cercanas al uso real del almacen:

- busqueda por SKU,
- enfoque de camara,
- resaltado visual de productos,
- movimiento y rotacion de estantes,
- transferencia y edicion de productos,
- y gestion de pisos intermedios.

Estas capacidades se describen en [README.md](/c:/xampp/htdocs/almacenDigital/README.md:282) como fases `F3`, `F4`, `F5`, `F5+` y `F6`.

## 4. Como se incorporo la persistencia

Una etapa posterior del proyecto fue agregar almacenamiento permanente en base de datos. Esto se comprueba por la carpeta [api](/c:/xampp/htdocs/almacenDigital/api) y por el flujo de inicializacion del backend en:

- [api/database.php](/c:/xampp/htdocs/almacenDigital/api/database.php:101)
- [api/config.php](/c:/xampp/htdocs/almacenDigital/api/config.php:15)
- [api/productos.php](/c:/xampp/htdocs/almacenDigital/api/productos.php:12)

El backend fue creado con estas decisiones:

- `config.php` administra los estantes.
- `productos.php` administra los productos.
- `database.php` centraliza conexion, CORS, validacion, logging y migraciones.

Esto muestra que la persistencia se agrego como una capa separada y no mezclada directamente con el frontend.

## 5. Evidencia cronologica de la base de datos

Las migraciones permiten reconstruir con bastante precision el orden de crecimiento del modelo de datos:

1. [202603270001_create_estantes_table.php](/c:/xampp/htdocs/almacenDigital/api/migrations/202603270001_create_estantes_table.php:1) crea la tabla `estantes`.
2. [202603270002_create_productos_table.php](/c:/xampp/htdocs/almacenDigital/api/migrations/202603270002_create_productos_table.php:1) agrega la tabla `productos`.
3. [202603270003_add_sections_to_estantes.php](/c:/xampp/htdocs/almacenDigital/api/migrations/202603270003_add_sections_to_estantes.php:1) incorpora `sections`.
4. [202603280004_add_board_offsets_to_estantes.php](/c:/xampp/htdocs/almacenDigital/api/migrations/202603280004_add_board_offsets_to_estantes.php:1) agrega `board_offsets` para pisos intermedios.
5. [202604080005_widen_id_columns.php](/c:/xampp/htdocs/almacenDigital/api/migrations/202604080005_widen_id_columns.php:1) amplia el largo de los identificadores.

Esta secuencia sugiere que el proyecto nacio primero con estantes y productos basicos, y luego fue ampliado para soportar secciones internas, pisos intermedios y IDs mas flexibles.

## 6. Como se conecto frontend y backend

El proyecto fue preparado para ejecutarse localmente con dos procesos:

- Vite para el frontend.
- XAMPP para Apache y MySQL.

La conexion entre ambos se resolvio mediante proxy en [vite.config.ts](/c:/xampp/htdocs/almacenDigital/vite.config.ts:15), donde `/api` apunta a `http://127.0.0.1/almacenDigital`. Esto indica que el proyecto fue pensado para un flujo de desarrollo local sencillo, sin necesidad de desplegar un backend Node.

Ademas, el archivo [public/warehouse-config.json](/c:/xampp/htdocs/almacenDigital/public/warehouse-config.json) funciona como configuracion inicial o respaldo, lo que muestra una estrategia gradual: primero cargar configuracion local y despues persistirla en MySQL.

## 7. Como se aseguro la calidad

El proyecto fue construido con una estrategia de pruebas por capas:

- pruebas unitarias para logica volumetrica y de colocacion,
- y pruebas de integracion para la API y la persistencia.

Esto se ve en:

- [tests/shelfStatus.test.ts](/c:/xampp/htdocs/almacenDigital/tests/shelfStatus.test.ts)
- [tests/canPlace.test.ts](/c:/xampp/htdocs/almacenDigital/tests/canPlace.test.ts)
- [tests/api.integration.test.ts](/c:/xampp/htdocs/almacenDigital/tests/api.integration.test.ts)

La configuracion en [vitest.config.ts](/c:/xampp/htdocs/almacenDigital/vitest.config.ts:1) excluye las pruebas de integracion del flujo normal, y el script `test:integration` en [package.json](/c:/xampp/htdocs/almacenDigital/package.json:6) deja claro que esas pruebas se agregaron despues para validar el backend cuando XAMPP esta activo.

## 8. Evidencia del historial reciente

El historial de Git refuerza la idea de una construccion iterativa. En los commits mas recientes aparecen mensajes como:

- `Implementando fases`
- `doc y arreglos de bugs`
- `mejorando los formularios`
- `mejorando los problemas criticos`
- `agregan puerta 3D`

Esto indica que el proyecto paso por:

- una etapa inicial de implementacion por fases,
- una etapa de correccion,
- una etapa de documentacion,
- y una etapa final de mejoras visuales y de experiencia.

## 9. Conclusiones

Con base en la estructura del repositorio, la documentacion, las migraciones y el historial reciente, se puede concluir que este proyecto fue creado de la siguiente manera:

1. Primero se implemento la logica del dominio y el calculo espacial.
2. Luego se construyo el algoritmo de colocacion de productos sin colisiones.
3. Despues se agrego la escena 3D con Three.js para visualizar el almacen.
4. En una etapa siguiente se incorporo una interfaz modular para operar estantes y productos.
5. Mas adelante se anadio persistencia con PHP, MySQL y migraciones automaticas.
6. Finalmente se reforzo el proyecto con pruebas, validaciones, mejoras de seguridad, documentacion y ajustes visuales.

En resumen, `almacenDigital` fue creado como un proyecto incremental, orientado por fases academicas, donde primero se resolvio el problema logico y luego se fueron sumando visualizacion, interaccion, persistencia y calidad del software.
