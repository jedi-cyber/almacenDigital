# Almacén Digital 3D

Proyecto académico en TypeScript para simular un almacén digital 3D. El sistema combina lógica de empaquetado espacial con visualización en navegador para validar si un producto cabe dentro de un estante, colocarlo sin colisiones y ubicarlo por SKU dentro de la escena.

## Qué hace este proyecto

Este repositorio cubre el Proyecto 1: `Motor Volumétrico y Asignación Espacial 3D`.

Funciones principales:
- Calcula volumen total, ocupado y libre de un estante.
- Determina si un nuevo producto puede colocarse en un estante usando colisiones AABB.
- Renderiza estantes 3D desde un archivo JSON.
- Permite agregar productos en la escena sin superposición.
- Permite buscar un producto por SKU, enfocar la cámara y resaltarlo visualmente.

## Tecnologías

- `TypeScript`
- `Node.js`
- `Vitest`
- `Vite`
- `Three.js`
- `GSAP`

## Estructura principal

- [src/types.ts](/c:/xampp/htdocs/almacenDigital/src/types.ts): tipos base del dominio.
- [src/volume.ts](/c:/xampp/htdocs/almacenDigital/src/volume.ts): cálculo de volumen.
- [src/shelfStatus.ts](/c:/xampp/htdocs/almacenDigital/src/shelfStatus.ts): estado volumétrico del estante.
- [src/canPlace.ts](/c:/xampp/htdocs/almacenDigital/src/canPlace.ts): algoritmo de colocación con AABB.
- [src/warehouseScene.ts](/c:/xampp/htdocs/almacenDigital/src/warehouseScene.ts): escena principal 3D y flujo visual.
- [src/main.ts](/c:/xampp/htdocs/almacenDigital/src/main.ts): punto de entrada de la app.
- [public/warehouse-config.json](/c:/xampp/htdocs/almacenDigital/public/warehouse-config.json): configuración de estantes.
- [tests/shelfStatus.test.ts](/c:/xampp/htdocs/almacenDigital/tests/shelfStatus.test.ts): pruebas de fase 1.
- [tests/canPlace.test.ts](/c:/xampp/htdocs/almacenDigital/tests/canPlace.test.ts): pruebas de fase 2.

## Requisitos

- `Node.js` 20 o superior
- `npm`

## Instalación

```bash
npm install
```

## Uso

Levantar entorno de desarrollo:

```bash
npm run dev
```

Build de producción:

```bash
npm run build
```

Vista previa de la build:

```bash
npm run preview
```

Ejecutar pruebas:

```bash
npm test
```

## Cómo probar la aplicación

1. Ejecuta `npm run dev`.
2. Abre `http://localhost:5173/`.
3. Navega la escena con el mouse:
   - click izquierdo + arrastrar: rotar
   - rueda: acercar o alejar
   - click derecho + arrastrar: desplazamiento lateral
4. Selecciona un estante.
5. Ingresa `SKU`, `ancho`, `alto` y `profundidad`.
6. Agrega el producto.
7. Usa el buscador por SKU para enfocar y resaltar un producto existente.

## Lógica de empaquetado

La colocación de productos usa una búsqueda por grid con paso de 1 unidad y validación por colisiones `AABB`:

- se recorre el espacio disponible del estante
- se evalúa una posición candidata
- se comprueba si colisiona con productos ya colocados
- si no colisiona, se devuelve la primera posición válida

Esto prioriza simplicidad y claridad sobre optimización extrema.

## Configuración del almacén

Los estantes no están hardcodeados en la escena. Se cargan desde [warehouse-config.json](warehouse-config.json#L1), donde cada estante define:

- `id`
- `label`
- `width`
- `height`
- `depth`
- `position`

## Estado de las fases

- `F1`: implementada y probada con Vitest.
- `F2`: implementada con pruebas unitarias de colocación y colisión.
- `F3`: implementada en escena Three.js con JSON, luces y controles.
- `F4`: implementada con formulario y creación de mallas de productos.
- `F5`: implementada con búsqueda por SKU, tween de cámara y highlight.

## Entrega

La guía breve de evidencias está en [ENTREGA.md](ENTREGA.md#L1).
