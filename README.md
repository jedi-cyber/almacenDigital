# Almacén Digital 3D

Proyecto académico en TypeScript para simular un almacén digital 3D. El sistema combina lógica de empaquetado espacial con visualización en navegador para validar si un producto cabe dentro de un estante, colocarlo sin colisiones y ubicarlo por SKU dentro de la escena.

## Qué hace este proyecto

Este repositorio cubre el Proyecto 1: `Motor Volumétrico y Asignación Espacial 3D`.

Funciones principales:
- Calcula volumen total, ocupado y libre de un estante.
- Determina si un nuevo producto puede colocarse en un estante usando colisiones AABB con soporte para rotación de ítems en 6 orientaciones.
- Renderiza estantes 3D desde un archivo JSON.
- Permite agregar productos en la escena sin superposición.
- Permite buscar un producto por SKU, enfocar la cámara y resaltarlo visualmente.
- Permite mover estantes arrastrándolos por el plano del suelo.
- Permite rotar estantes 90° sobre el eje vertical.

## Tecnologías

- `TypeScript`
- `Node.js`
- `Vitest`
- `Vite`
- `Three.js`
- `GSAP`

## Estructura principal

- [src/types.ts](src/types.ts): tipos base del dominio.
- [src/volume.ts](src/volume.ts): cálculo de volumen.
- [src/shelfStatus.ts](src/shelfStatus.ts): estado volumétrico del estante.
- [src/canPlace.ts](src/canPlace.ts): algoritmo de colocación con AABB.
- [src/warehouseScene.ts](src/warehouseScene.ts): escena principal 3D y flujo visual.
- [src/main.ts](src/main.ts): punto de entrada de la app.
- [public/warehouse-config.json](public/warehouse-config.json): configuración de estantes.
- [tests/shelfStatus.test.ts](tests/shelfStatus.test.ts): pruebas de fase 1.
- [tests/canPlace.test.ts](tests/canPlace.test.ts): pruebas de fase 2.

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

### Navegación de la cámara

| Acción | Resultado |
|---|---|
| Click izquierdo + arrastrar | Rotar la vista |
| Rueda del mouse | Acercar o alejar |
| Click derecho + arrastrar | Desplazamiento lateral |

### Gestión de estantes

| Acción | Resultado |
|---|---|
| Click sobre un estante | Selecciona el estante (brillo amarillo) |
| Click en espacio vacío | Deselecciona el estante |
| Click + arrastrar sobre estante **seleccionado** | Mueve el estante por el suelo |
| Tecla `R` con estante seleccionado | Rota el estante 90° (repetible) |

> Mientras no hay estante seleccionado, arrastrar con el mouse rota la cámara normalmente.

### Agregar y buscar productos

3. Selecciona un estante en el panel izquierdo.
4. Ingresa `SKU`, `ancho`, `alto` y `profundidad`.
5. Haz clic en **Agregar producto**.
6. Usa el buscador por SKU para enfocar la cámara y resaltar el producto en cian.

## Lógica de empaquetado

La colocación de productos usa una búsqueda por grid con paso de 1 unidad y validación por colisiones `AABB`:

- se recorre el espacio disponible del estante
- se evalúa una posición candidata
- se comprueba si colisiona con productos ya colocados
- si no colisiona, se devuelve la primera posición válida

Esto prioriza simplicidad y claridad sobre optimización extrema.

## Configuración del almacén

Los estantes no están hardcodeados en la escena. Se cargan desde [warehouse-config.json](public/warehouse-config.json), donde cada estante define:

- `id`
- `label`
- `width`
- `height`
- `depth`
- `position`
- `rotationY` *(opcional)* — rotación inicial sobre el eje Y en radianes

## Estado de las fases

- `F1`: implementada y probada con Vitest.
- `F2`: implementada con pruebas unitarias de colocación y colisión. Soporta rotación del ítem en 6 orientaciones y productos que superan la altura del estante.
- `F3`: implementada en escena Three.js con JSON, luces y controles.
- `F4`: implementada con formulario y creación de mallas de productos.
- `F5`: implementada con búsqueda por SKU, tween de cámara y highlight.
- `F5+`: arrastre de estantes con mouse, rotación con tecla `R`, selección visual.

## Entrega

La guía breve de evidencias está en [ENTREGA.md](ENTREGA.md#L1).
