# Almacén Digital 3D

Proyecto académico en TypeScript para simular un almacén digital 3D. El sistema combina lógica de empaquetado espacial con visualización en navegador para validar si un producto cabe dentro de un estante, colocarlo sin colisiones y ubicarlo por SKU o nombre dentro de la escena. El estado del almacén (estantes y productos) persiste en una base de datos MySQL a través de una API PHP.

## Qué hace este proyecto

Este repositorio cubre el Proyecto 1: `Motor Volumétrico y Asignación Espacial 3D`.

Funciones principales:

- Calcula volumen total, ocupado y libre de un estante.
- Determina si un nuevo producto puede colocarse en un estante usando colisiones AABB con soporte para rotación de ítems en 6 orientaciones.
- Renderiza estantes 3D desde un archivo JSON con luces, sombras y paredes.
- Permite agregar productos en la escena sin superposición con animación de aparición.
- Permite buscar un producto por SKU o nombre, enfocar la cámara con tween y resaltarlo visualmente. El SKU es el identificador unico de la unidad; el nombre puede repetirse como alias de busqueda.
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
- `MySQL` con servidor local como XAMPP, Laragon u otro stack Apache/PHP

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
- [api/database.php](api/database.php): conexión PDO, funciones de validación, CORS, logging y runner de migraciones.
- [api/migrations/](api/migrations/): migraciones SQL en orden cronológico (se aplican automáticamente).

### Pruebas (`tests/`)

- [tests/shelfStatus.test.ts](tests/shelfStatus.test.ts): pruebas unitarias de fase 1 (volumen).
- [tests/canPlace.test.ts](tests/canPlace.test.ts): pruebas unitarias de fase 2 (colocación y colisión AABB).
- [tests/api.integration.test.ts](tests/api.integration.test.ts): pruebas de integración que verifican la API REST y la persistencia MySQL. Requieren Apache/PHP y MySQL activos; se omiten automáticamente si la API no es alcanzable.

### Otros

- [public/warehouse-config.json](public/warehouse-config.json): configuración inicial de estantes (fallback si la BD está vacía).
- [.env.example](.env.example): plantilla de variables de entorno.

---

## Requisitos previos

| Herramienta | Versión mínima |
| --- | --- |
| Node.js | 20 |
| npm | incluido con Node.js |
| Servidor local | XAMPP, Laragon u otro entorno con Apache/PHP 8 y MySQL 5.7+ |

---

## Instalación y despliegue local

### 1. Clonar o copiar el repositorio en el servidor local

El backend PHP debe ejecutarse dentro de la carpeta pública de tu servidor local. Algunos ejemplos:

```text
XAMPP:   C:\xampp\htdocs\almacenDigital\
Laragon: C:\laragon\www\almacenDigital\
```

Si clonás con Git:

```bash
git clone https://github.com/jedi-cyber/almacenDigital.git
```
XAMPP: 
```bash
cd C:\xampp\htdocs\almacenDigital\
```
Laragon:
```bash
cd C:\laragon\www\almacenDigital\
```
En Laragon sería el mismo comando, pero dentro de `C:\laragon\www`. También podés copiar la carpeta manualmente. Si usás otro nombre de carpeta, actualizá el `target` del proxy en [vite.config.ts](vite.config.ts) para que apunte a la URL correcta de la API.

### 2. Iniciar Apache/PHP y MySQL

Desde XAMPP, Laragon u otro panel local, iniciá:

- **Apache** — sirve el backend PHP.
- **MySQL** — base de datos.

Verificá que ambos servicios estén activos. Si el proyecto está en una carpeta llamada `almacenDigital`, la API quedará disponible en `http://127.0.0.1/almacenDigital/api/` o `http://localhost/almacenDigital/api/`.

### 3. Crear el archivo `.env`

Copiá la plantilla incluida:

```bash
cp .env.example .env
```

El archivo `.env` queda en la raíz del proyecto y contiene:

```env
DB_HOST=localhost
DB_NAME=almacensekai
DB_USER=root
DB_PASSWORD=
DB_CHARSET=utf8mb4

# Origen permitido para CORS. En producción pon la URL exacta del frontend.
ALLOWED_ORIGIN=http://localhost:5173
```

Editá los valores si tu instalación de MySQL usa una contraseña o un usuario diferente. El archivo `.env` está en `.gitignore` y nunca se sube al repositorio.

### 4. Permisos de escritura para logs (Linux/macOS)

En Windows con XAMPP o Laragon los permisos de archivo no suelen ser un problema. En Linux o macOS, el proceso de Apache necesita poder escribir en `api/logs/`. Otorgá permisos al directorio:

```bash
chmod 775 api/logs/
chown www-data:www-data api/logs/   # ajustá el usuario según tu distro
```

Si el directorio no existe todavía, PHP lo crea automáticamente en la primera petición con error. Si querés crearlo manualmente:

```bash
mkdir -p api/logs
chmod 775 api/logs
```

### 5. Migraciones de la base de datos

**No hay pasos manuales.** La primera petición a la API (`/api/config.php` o `/api/productos.php`) ejecuta automáticamente todas las migraciones pendientes en `api/migrations/`. El flujo es:

1. `db_connect()` crea la base de datos `almacensekai` si no existe.
2. `db_run_migrations()` crea la tabla `migrations` si no existe.
3. Cada archivo en `api/migrations/*.php` se aplica en orden cronológico (por nombre de archivo) solo si su `id` aún no está en la tabla `migrations`.
4. Cada migración corre dentro de una transacción; si falla, hace rollback y lanza una excepción.

Las migraciones incluidas crean las siguientes tablas:

| Migración | Tabla / cambio |
| --- | --- |
| `202603270001_create_estantes_table` | Tabla `estantes` con id, label, dimensiones, posición y rotación |
| `202603270002_create_productos_table` | Tabla `productos` con sku, shelf_id, nombre, dimensiones y posición local |
| `202603270003_add_sections_to_estantes` | Columna `sections` en `estantes` (idempotente: verifica antes de agregar) |
| `202603280004_add_board_offsets_to_estantes` | Columna `board_offsets` en `estantes` para pisos intermedios |
| `202604080005_widen_id_columns` | Amplia IDs de estantes/productos a `VARCHAR(100)` |
| `202604270006_add_section_labels_to_estantes` | Columna `section_labels` para nombres personalizados de pisos |
| `202605020007_seed_default_warehouse` | Semilla inicial si `estantes` o `productos` están vacíos |

### Semilla predeterminada

La migración `202605020007_seed_default_warehouse` carga una semilla inicial para cualquier instalación nueva:

- 5 estantes base (`S01` a `S05`).
- 4 productos demo (`DEMO-001` a `DEMO-004`).

La semilla es idempotente y conservadora: solo inserta estantes si la tabla `estantes` está vacía, y solo inserta productos si la tabla `productos` está vacía. Así un usuario con datos propios no pierde cambios al actualizar.

En Docker, si ya tenés un volumen MySQL creado y querés volver a probar la semilla desde cero:

```bash
docker compose down -v
docker compose up --build -d
```

SQL equivalente para crear la base manualmente en phpMyAdmin:

```sql
CREATE DATABASE IF NOT EXISTS almacensekai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE almacensekai;

CREATE TABLE IF NOT EXISTS estantes (
  id VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  sections INT NOT NULL DEFAULT 1,
  board_offsets TEXT DEFAULT NULL,
  section_labels TEXT DEFAULT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  depth FLOAT NOT NULL,
  pos_x FLOAT NOT NULL DEFAULT 0,
  pos_y FLOAT NOT NULL DEFAULT 0,
  pos_z FLOAT NOT NULL DEFAULT 0,
  rotation_y FLOAT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos (
  sku VARCHAR(100) NOT NULL,
  shelf_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  depth FLOAT NOT NULL,
  local_x FLOAT NOT NULL DEFAULT 0,
  local_y FLOAT NOT NULL DEFAULT 0,
  local_z FLOAT NOT NULL DEFAULT 0,
  PRIMARY KEY (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS migrations (
  id VARCHAR(191) NOT NULL,
  batch INT NOT NULL,
  migrated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Si preferís revisar la estructura antes de arrancar la app, podés abrir **phpMyAdmin** en `http://127.0.0.1/phpmyadmin` y examinar la base `almacensekai` después de la primera petición.

### 6. Instalar dependencias del frontend

```bash
npm install
```

### 7. Levantar el entorno de desarrollo

```bash
npm run dev
```

Vite inicia en `http://localhost:5173/`. El proxy redirige `/api/*` al backend PHP configurado en [vite.config.ts](vite.config.ts), por lo que Apache/PHP y MySQL deben estar corriendo.

---

## Ejecutar con Docker

El proyecto incluye un `Dockerfile` multi-stage y `docker-compose.yml` para levantar frontend, API PHP/Apache y MySQL.

```bash
docker compose up --build -d
```

Después de iniciar:

- App: `http://localhost:8080/`
- API: `http://localhost:8080/api/config.php`
- MySQL expuesto en el host: `localhost:3307`

Para ver el estado:

```bash
docker compose ps
```

Para detenerlo:

```bash
docker compose down
```

Los datos de MySQL quedan persistidos en el volumen `mysql_data`. Si necesitás reiniciar la base desde cero:

```bash
docker compose down -v
```

---

## Comandos disponibles

```bash
npm run dev          # servidor de desarrollo con HMR
npm run build        # build de producción (salida en dist/)
npm run preview      # vista previa de la build de producción
npm test             # pruebas unitarias (no requiere servidor local)
npm run test:integration  # pruebas de integración (requiere Apache/PHP y MySQL activos)
```

---

## Aplicativo móvil

El proyecto Android usa la versión compilada del frontend dentro de `app/src/main/assets/`. Para actualizarlo con los cambios del proyecto original, ejecuta `npm run build` y copia el contenido de `dist/` a los assets del aplicativo antes de generar el APK.

---

## Cómo probar la aplicación

1. Arranca Apache/PHP y MySQL en XAMPP, Laragon u otro entorno local.
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
| Buscar por SKU o nombre | Enfoca la cámara y resalta el producto en cian; si varios SKU comparten nombre, muestra la primera coincidencia e informa cuantas existen |
| Click sobre un producto en escena | Abre el panel de información del producto |
| **Eliminar** (panel de búsqueda/click) | Elimina el producto de la escena y la BD |
| **Mover** | Arma el producto en el cursor para recolocarlo |
| **Transferir** | Mueve el producto a otro estante |
| **Editar** | Modifica las dimensiones del producto colocado |

---

## Lógica de empaquetado

El motor de colocación en [src/canPlace.ts](src/canPlace.ts) usa **compresión de coordenadas** (*event-point snapping*) con validación por colisiones AABB:

1. **Extracción de coordenadas evento**: en lugar de iterar cada posición del grid, se recopilan únicamente los valores X, Y, Z donde ya termina algún producto colocado (cara posterior de cada ítem). A estas coordenadas se añaden los extremos `0` del estante. El conjunto de candidatos crece como O(n) en cada eje, no como O(dimensión).

2. **Producto cartesiano filtrado**: se prueban solo las combinaciones (xc, yc, zc) que quedan dentro del rango válido para el ítem (piso actual, límites del estante). Esto reduce el espacio de búsqueda de O(W×H×D) a O(n³) candidatos en el peor caso.

3. **AABB precomputadas**: las cajas de los productos ya colocados se calculan una sola vez por llamada (en lugar de recomputarse en cada candidato), lo que elimina trabajo redundante en el bucle interno.

4. **Corrección garantizada**: para coordenadas enteras, cualquier posición válida x₀ tiene un punto evento x₁ ≤ x₀ (la cara posterior del ítem más cercano a la izquierda). El algoritmo siempre encuentra la primera posición válida si existe.

5. **6 orientaciones**: el ítem se prueba en las 6 rotaciones ortogonales posibles antes de reportar que no hay espacio.

---

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

---

## Estado de las fases

- `F1`: implementada y probada con Vitest.
- `F2`: implementada con pruebas unitarias de colocación y colisión. Soporta rotación del ítem en 6 orientaciones y productos que superan la altura del estante.
- `F3`: implementada en escena Three.js con JSON, luces, paredes y controles.
- `F4`: implementada con formulario, creación de mallas instanciadas y animación de aparición.
- `F5`: implementada con búsqueda por SKU o nombre, tween de cámara y highlight.
- `F5+`: arrastre de estantes, rotación con `R`, selección visual, movimiento WASD.
- `F6 (persistencia)`: API PHP + MySQL, migraciones automáticas, restauración de escena al recargar, eliminación y transferencia de productos, edición de dimensiones, gestión de pisos intermedios y redimensionado de estantes.

---

## Entrega

La guía breve de evidencias está en [ENTREGA.md](ENTREGA.md#L1).

## Mejoras implementadas

Los siguientes puntos de mejora identificados en la evaluación han sido abordados:

### Variables de entorno para credenciales (`api/database.php`, `.env`)

Las credenciales de base de datos y el origen CORS ya no están hardcodeadas en el código. Se leen desde un archivo `.env` en la raíz del proyecto mediante `db_load_env()`. El archivo `.env` está excluido del repositorio por `.gitignore`. Se incluye `.env.example` con la plantilla comentada.

### Seguridad: CORS, validación y sanitización (`api/database.php`, `api/config.php`, `api/productos.php`)

- **CORS restringido**: `cors_headers()` lee `ALLOWED_ORIGIN` del entorno. Si no coincide con el origen de la petición, no envía el header y el navegador bloquea la petición.
- **Validación de entradas**: funciones `valid_positive_float()` y `valid_string()` validan y sanitizan cada campo antes de usarlo. Las peticiones con datos inválidos reciben `422 Unprocessable Entity` con la lista de campos fallidos.
- **Consultas parametrizadas**: todas las operaciones SQL usan `PDO` con *prepared statements*.

### Log de errores y respuestas descriptivas (`api/database.php`, `api/logs/error.log`)

- `api_log_error(Throwable $e, string $context)` escribe entradas estructuradas en `api/logs/error.log` con timestamp, método HTTP, URI, contexto, tipo de excepción y ubicación.
- Todas las respuestas de error incluyen un campo `code` (ej. `"MISSING_SKU"`, `"PRODUCT_SAVE_ERROR"`) para facilitar el debugging desde el cliente.
- El directorio `api/logs/` está en `.gitignore`.

### Pruebas de integración (`tests/api.integration.test.ts`, `vitest.integration.config.ts`)

Veinte pruebas que cubren:

- Forma del `GET` de config y productos.
- `POST` válido e inválido (verifica código `422` y campo `code`).
- Round-trip de persistencia (crear → listar → verificar).
- `DELETE` de producto.
- Restauración del estado original de estantes en `afterAll`.

Las pruebas se omiten automáticamente si la API no es alcanzable, por lo que `npm test` (pruebas unitarias) nunca falla por falta de servidor local.

```bash
npm run test:integration   # requiere Apache/PHP y MySQL activos
```

### Optimización del motor de colocación (`src/canPlace.ts`)

Reemplazo de la búsqueda exhaustiva por grid (paso 1 en cada eje) con **compresión de coordenadas**: solo se evalúan las posiciones candidatas relevantes derivadas de las caras de los ítems ya colocados. Ver sección [Lógica de empaquetado](#lógica-de-empaquetado).

### Experiencia de usuario (`index.html`, `src/styles.css`, `src/main.ts`, `src/warehouse.ts`, `public/favicon.svg`)

- **Pantalla de carga**: spinner animado con mensajes de progreso ("Cargando configuración del almacén...", "Restaurando productos guardados...") que desaparece con transición suave al terminar la inicialización.
- **Mensajes de error en UI**: los errores de la API ahora se muestran en el panel de estado de la interfaz (no solo en la consola). `warehouse.ts` expone `setApiErrorHandler()` para registrar el callback sin depender del DOM.
- **Favicon**: icono SVG en `public/favicon.svg` referenciado desde `index.html`. Elimina el 404 que se generaba en cada carga de página.
