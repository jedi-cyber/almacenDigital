# Almacén Digital 3D

Proyecto académico en TypeScript para simular un almacén digital 3D. El sistema combina lógica de empaquetado espacial con visualización en navegador para validar si un producto cabe dentro de un estante, colocarlo sin colisiones y ubicarlo por SKU dentro de la escena. El estado del almacén (estantes y productos) persiste en una base de datos MySQL a través de una API PHP.

## Qué hace este proyecto

Este repositorio cubre el Proyecto 1: `Motor Volumétrico y Asignación Espacial 3D`.

Funciones principales:

- Calcula volumen total, ocupado y libre de un estante.
- Determina si un nuevo producto puede colocarse en un estante usando colisiones AABB con soporte para rotación de ítems en 6 orientaciones.
- Renderiza estantes 3D desde un archivo JSON con luces, sombras y paredes.
- Permite agregar productos en la escena sin superposición con animación de aparición.
- Permite buscar un producto por SKU, enfocar la cámara con tween y resaltarlo visualmente.
- Permite mover estantes arrastrándolos por el plano del suelo.
- Permite rotar estantes 90° sobre el eje vertical.
- Permite eliminar productos de la escena y la base de datos.
- Permite transferir un producto de un estante a otro.
- Permite editar las dimensiones de un producto colocado.
- Permite mover un producto a una nueva posición dentro del mismo estante.
- Permite agregar y eliminar pisos intermedios (boards) dentro de un estante.
- Permite redimensionar estantes en modo edición.
- Persiste la posición, rotación y configuración de estantes en MySQL.
- Persiste todos los productos colocados en MySQL y los restaura al recargar.

## Tecnologías

- `TypeScript`
- `Node.js`
- `Vitest`
- `Vite`
- `Three.js`
- `GSAP`
- `PHP 8`
- `MySQL` (vía XAMPP)

## Estructura principal

### Frontend (`src/`)

- [src/types.ts](src/types.ts): tipos base del dominio.
- [src/volume.ts](src/volume.ts): cálculo de volumen.
- [src/shelfStatus.ts](src/shelfStatus.ts): estado volumétrico del estante.
- [src/canPlace.ts](src/canPlace.ts): algoritmo de colocación con AABB y secciones.
- [src/scene.ts](src/scene.ts): helpers de Three.js (meshes, instancias, luces, suelo, paredes).
- [src/three-helpers.ts](src/three-helpers.ts): helpers de alto nivel (highlight, focus, boards, resize).
- [src/warehouse.ts](src/warehouse.ts): runtime del almacén, lógica de colocación y llamadas a la API.
- [src/warehouseScene.ts](src/warehouseScene.ts): punto de montaje de la escena, wiring de eventos.
- [src/hud.ts](src/hud.ts): barrel de exports de la UI.
- [src/ui-builder.ts](src/ui-builder.ts): construcción del HTML del HUD.
- [src/ui-copy.ts](src/ui-copy.ts): textos y mensajes de la interfaz.
- [src/ui-handlers.ts](src/ui-handlers.ts): manejadores de eventos de la UI.
- [src/ui.ts](src/ui.ts): formularios y controles de la escena.
- [src/main.ts](src/main.ts): punto de entrada de la app.

### Backend (`api/`)

- [api/config.php](api/config.php): `GET` devuelve la configuración de estantes; `POST` la persiste.
- [api/productos.php](api/productos.php): `GET` lista los productos; `POST` upsert; `DELETE ?sku=X` elimina.
- [api/database.php](api/database.php): conexión PDO y runner de migraciones.
- [api/migrations/](api/migrations/): migraciones SQL en orden cronológico.

### Otros

- [public/warehouse-config.json](public/warehouse-config.json): configuración inicial de estantes (fallback si la BD está vacía).
- [tests/shelfStatus.test.ts](tests/shelfStatus.test.ts): pruebas de fase 1.
- [tests/canPlace.test.ts](tests/canPlace.test.ts): pruebas de fase 2.

## Requisitos

- `Node.js` 20 o superior
- `npm`
- `XAMPP` (Apache + MySQL + PHP 8) corriendo en `http://127.0.0.1`

## Instalación

```bash
npm install
```

El backend no requiere instalación adicional. XAMPP debe tener este repositorio en `htdocs/almacenDigital/` y MySQL corriendo. Las migraciones se ejecutan automáticamente en la primera petición.

## Uso

Levantar entorno de desarrollo (requiere XAMPP con Apache y MySQL activos):

```bash
npm run dev
```

El proxy de Vite redirige `/api/*` a `http://127.0.0.1/almacenDigital/api/`.

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

1. Arranca XAMPP (Apache + MySQL).
2. Ejecuta `npm run dev`.
3. Abre `http://localhost:5173/`.

### Navegación de la cámara

| Acción | Resultado |
| --- | --- |
| Click izquierdo + arrastrar | Rotar la vista |
| Rueda del mouse | Acercar o alejar |
| Click derecho + arrastrar | Desplazamiento lateral |
| `W` / `A` / `S` / `D` | Mover la cámara en el plano horizontal |

### Gestión de estantes (modo edición)

| Acción | Resultado |
| --- | --- |
| Click en **Editar estantes** | Activa el modo edición |
| Click sobre un estante | Selecciona el estante (brillo amarillo) |
| Click en espacio vacío | Deselecciona el estante |
| Click + arrastrar sobre estante **seleccionado** | Mueve el estante por el suelo |
| Tecla `R` con estante seleccionado | Rota el estante 90° (repetible) |
| Panel lateral > **Agregar piso** | Inserta un piso intermedio en la sección indicada |
| Panel lateral > **Eliminar piso** | Elimina el último piso intermedio añadido |
| Panel lateral > **Redimensionar** | Cambia las dimensiones del estante seleccionado |

> Los cambios de posición, rotación, secciones y dimensiones se guardan automáticamente en la base de datos.

### Agregar y gestionar productos

| Acción | Resultado |
| --- | --- |
| Seleccionar un estante en el panel | Muestra su resumen volumétrico |
| Ingresar SKU, nombre, ancho, alto, profundidad | Rellena el formulario de producto |
| **Agregar producto** | Coloca el producto con animación y lo persiste |
| Buscar por SKU | Enfoca la cámara y resalta el producto en cian |
| Click sobre un producto en escena | Abre el panel de información del producto |
| **Eliminar** (panel de búsqueda/click) | Elimina el producto de la escena y la BD |
| **Mover** | Arma el producto en el cursor para recolocarlo |
| **Transferir** | Mueve el producto a otro estante |
| **Editar** | Modifica las dimensiones del producto colocado |

## Lógica de empaquetado

La colocación de productos usa una búsqueda por grid con paso de 1 unidad y validación por colisiones `AABB`:

- se recorre el espacio disponible del estante (sección por sección si hay boards)
- se evalúa una posición candidata
- se comprueba si colisiona con productos ya colocados
- si no colisiona, se devuelve la primera posición válida

Esto prioriza simplicidad y claridad sobre optimización extrema.

## Configuración del almacén

Los estantes se cargan desde la base de datos MySQL. Si la BD está vacía o tiene menos de 5 estantes, se usa el fallback [warehouse-config.json](public/warehouse-config.json), que se persiste automáticamente.

Cada estante define:

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único |
| `label` | Nombre visible |
| `width` / `height` / `depth` | Dimensiones |
| `position` | Coordenada `{x, y, z}` en la escena |
| `rotationY` | Rotación inicial sobre el eje Y (radianes) |
| `sections` | Número de secciones uniformes *(opcional)* |
| `boardOffsets` | Posiciones de pisos como fracción `[0..1]` de la altura *(sobreescribe `sections`)* |

## Estado de las fases

- `F1`: implementada y probada con Vitest.
- `F2`: implementada con pruebas unitarias de colocación y colisión. Soporta rotación del ítem en 6 orientaciones y productos que superan la altura del estante.
- `F3`: implementada en escena Three.js con JSON, luces, paredes y controles.
- `F4`: implementada con formulario, creación de mallas instanciadas y animación de aparición.
- `F5`: implementada con búsqueda por SKU, tween de cámara y highlight.
- `F5+`: arrastre de estantes, rotación con `R`, selección visual, movimiento WASD.
- `F6 (persistencia)`: API PHP + MySQL, migraciones automáticas, restauración de escena al recargar, eliminación y transferencia de productos, edición de dimensiones, gestión de pisos intermedios y redimensionado de estantes.

## Entrega

La guía breve de evidencias está en [ENTREGA.md](ENTREGA.md#L1).

---

## Calificación

- **Nota:** 18/20 — proyecto sólido que cubre las funcionalidades solicitadas y cuenta con pruebas unitarias para la lógica central.

## Puntos a mejorar

- **Documentación de despliegue:** Incluir pasos detallados para XAMPP/Apache (ruta en `htdocs`), ejemplo de importación de migraciones y configuración de permisos.
- **Manejo de configuración:** Mover credenciales y host de BD a variables de entorno en lugar de hardcodear en `api/database.php`.
- **Manejo de errores y logs:** Registrar errores del backend en un log y ofrecer respuestas JSON más descriptivas para facilitar debugging en producción.
- **Seguridad:** Restringir CORS en producción y evitar usar credenciales `root` sin contraseña; validar/sanitizar entradas API.
- **Pruebas de integración/E2E:** Añadir tests que cubran la interacción frontend ↔︎ API y casos de persistencia en MySQL.
- **Optimización del motor de colocación:** Evaluar heurísticas o espacio de búsqueda adaptativo para estantes grandes (evitar búsqueda exhaustiva por grid si el espacio es grande).
- **Experiencia de usuario:** Añadir indicadores de carga/errores en UI y un `favicon.ico` para evitar 404 en peticiones estáticas.

## Opinión crítica

El proyecto muestra diseño modular y buen enfoque en la separación de responsabilidades: la lógica volumétrica está cubierta por pruebas unitarias y la integración con Three.js ofrece una visualización clara. Estos son puntos fuertes que facilitan mantenimiento y extensión.

No obstante, la experiencia de despliegue está orientada a un entorno local (XAMPP, `htdocs`, credenciales root) lo que reduce la reproducibilidad en otros entornos o servidores CI. La capa de migraciones funciona, pero su manejo de errores y transacciones puede fortalecerse (por ejemplo con logs persistentes y control más explícito de transacciones). Para llevar el proyecto a un entorno real/producción es recomendable parametrizar la configuración, endurecer CORS y credenciales, y añadir pruebas de integración que validen la persistencia y las rutas de la API.

---
