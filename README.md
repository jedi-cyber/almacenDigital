# Almacén Digital 3D

Aplicación académica en TypeScript para simular un almacén 3D. Permite administrar estantes y productos dentro de una escena Three.js, validar si un producto cabe en un estante, colocarlo sin colisiones y persistir el estado en MySQL mediante una API PHP.

## Contenido

- [Características](#características)
- [Tecnologías](#tecnologías)
- [Estructura](#estructura)
- [Requisitos](#requisitos)
- [Instalación local](#instalación-local)
- [Comandos](#comandos)
- [Aplicativo móvil](#aplicativo-móvil)
- [Base de datos](#base-de-datos)
- [Docker](#docker)
- [Uso de la aplicación](#uso-de-la-aplicación)
- [Pruebas](#pruebas)
- [Detalles técnicos](#detalles-técnicos)
- [Entrega](#entrega)

## Características

- Renderizado 3D de estantes, productos, luces, sombras, suelo y paredes.
- Cálculo de volumen total, ocupado y libre por estante.
- Colocación automática con validación de colisiones AABB.
- Soporte para 6 orientaciones del producto antes de descartar espacio.
- Búsqueda por SKU o nombre, con enfoque de cámara y resaltado visual.
- Edición de estantes: mover, rotar, redimensionar y administrar pisos intermedios.
- Gestión de productos: agregar, eliminar, mover, transferir y editar dimensiones.
- Persistencia de estantes, productos, posiciones, rotaciones y configuración en MySQL.
- Restauración automática de la escena al recargar.

## Tecnologías

- `TypeScript`
- `Vite`
- `Three.js`
- `GSAP`
- `Vitest`
- `PHP 8`
- `MySQL`
- XAMPP, Laragon u otro entorno local con Apache/PHP y MySQL

## Estructura

```text
api/                    API PHP, conexión PDO y migraciones
api/migrations/         Migraciones automáticas de MySQL
public/                 Assets públicos y warehouse-config.json
scripts/                Scripts auxiliares del proyecto
src/                    Código TypeScript de la aplicación 3D
tests/                  Pruebas unitarias e integración
dist/                   Build generado por Vite
```

Archivos principales:

- [src/warehouse.ts](src/warehouse.ts): lógica central del almacén y llamadas a la API.
- [src/warehouseScene.ts](src/warehouseScene.ts): montaje de escena y eventos.
- [src/canPlace.ts](src/canPlace.ts): motor de colocación y colisiones.
- [src/scene.ts](src/scene.ts): helpers de Three.js.
- [src/ui-builder.ts](src/ui-builder.ts): construcción del HUD.
- [api/database.php](api/database.php): conexión, validación, CORS, logs y migraciones.
- [api/config.php](api/config.php): lectura y persistencia de estantes.
- [api/productos.php](api/productos.php): lectura, guardado y eliminación de productos.

## Requisitos

| Herramienta | Versión mínima |
| --- | --- |
| Node.js | 20 |
| npm | incluido con Node.js |
| PHP | 8 |
| MySQL | 5.7+ |
| Servidor local | XAMPP, Laragon u otro stack Apache/PHP |

## Instalación local

### 1. Ubicar el proyecto en el servidor local

El backend PHP debe estar dentro de la carpeta pública del servidor:

```text
XAMPP:   C:\xampp\htdocs\almacenDigital\
Laragon: C:\laragon\www\almacenDigital\
```

Si usas Git:

```bash
git clone https://github.com/jedi-cyber/almacenDigital.git
cd C:\xampp\htdocs\almacenDigital
```

Si cambias el nombre de la carpeta, actualiza el `target` del proxy en [vite.config.ts](vite.config.ts).

### 2. Iniciar Apache y MySQL

Desde XAMPP, Laragon u otro panel local, inicia:

- Apache, para servir la API PHP.
- MySQL, para la base de datos.

Con la carpeta `almacenDigital`, la API queda disponible en:

```text
http://127.0.0.1/almacenDigital/api/
```

### 3. Crear `.env`

Copia la plantilla:

```bash
cp .env.example .env
```

Contenido esperado:

```env
DB_HOST=localhost
DB_NAME=almacensekai
DB_USER=root
DB_PASSWORD=
DB_CHARSET=utf8mb4
ALLOWED_ORIGIN=http://localhost:5173
```

Ajusta usuario, contraseña o nombre de base de datos si tu instalación lo necesita. El archivo `.env` está ignorado por Git.

### 4. Instalar dependencias

```bash
npm install
```

### 5. Levantar la app

```bash
npm run dev
```

Abre:

```text
http://localhost:5173/
```

Vite redirige `/api/*` al backend PHP configurado en [vite.config.ts](vite.config.ts), por eso Apache y MySQL deben estar activos.

## Comandos

```bash
npm run dev               # servidor de desarrollo con HMR
npm run build             # build de producción en dist/
npm run preview           # vista previa del build
npm test                  # pruebas unitarias
npm run test:integration  # pruebas de integración con API y MySQL
npm run mobile:sync       # compila y copia dist/ al proyecto Android
npm run mobile:watch      # observa cambios y sincroniza Android automáticamente
```

## Aplicativo móvil

El proyecto Android está en:

```text
C:\Users\HP\AndroidStudioProjects\Almacen3D2
```

La app móvil usa el frontend compilado dentro de:

```text
C:\Users\HP\AndroidStudioProjects\Almacen3D2\app\src\main\assets
```

Para actualizar Android con la última versión web:

```bash
npm run mobile:sync
```

Ese comando:

1. Ejecuta `npm run build`.
2. Genera la versión nueva en `dist/`.
3. Copia el contenido de `dist/` a `app/src/main/assets`.
4. Limpia archivos viejos del build anterior para evitar assets con hash obsoletos.

Para trabajar sin copiar manualmente cada vez:

```bash
npm run mobile:watch
```

Ese modo observa cambios en `src/` y `public/`, recompila y sincroniza los assets del proyecto Android automáticamente. Detenlo con `Ctrl+C`.

El script responsable es [scripts/sync-android-assets.ps1](scripts/sync-android-assets.ps1).

Si otro desarrollador no tiene Android Studio o no tiene el proyecto Android, no necesita ejecutar estos comandos. Puede trabajar normalmente con:

```bash
npm run dev
npm run build
```

Cuando una PC tenga el proyecto Android en otra ruta, debe definir `ANDROID_PROJECT_PATH` antes de sincronizar:

```powershell
$env:ANDROID_PROJECT_PATH="C:\Users\TU_USUARIO\AndroidStudioProjects\Almacen3D2"
npm run mobile:sync
```

Si la ruta no existe, el script muestra un mensaje amable con instrucciones en vez de terminar con un error confuso.

## Base de datos

No hay un paso manual obligatorio para crear tablas. La primera petición a la API ejecuta automáticamente las migraciones pendientes de [api/migrations/](api/migrations/).

Flujo interno:

1. `db_connect()` crea la base `almacensekai` si no existe.
2. `db_run_migrations()` crea la tabla `migrations` si no existe.
3. Cada migración se aplica una sola vez y en orden cronológico.
4. Cada migración corre dentro de una transacción.

Migraciones incluidas:

| Migración | Cambio |
| --- | --- |
| `202603270001_create_estantes_table` | Crea `estantes` |
| `202603270002_create_productos_table` | Crea `productos` |
| `202603270003_add_sections_to_estantes` | Agrega `sections` |
| `202603280004_add_board_offsets_to_estantes` | Agrega `board_offsets` |
| `202604080005_widen_id_columns` | Amplía IDs a `VARCHAR(100)` |
| `202604270006_add_section_labels_to_estantes` | Agrega `section_labels` |
| `202605020007_seed_default_warehouse` | Carga semilla inicial si las tablas están vacías |

La semilla predeterminada agrega 5 estantes (`S01` a `S05`) y 4 productos demo (`DEMO-001` a `DEMO-004`) solo cuando las tablas están vacías.

Puedes revisar la base desde phpMyAdmin:

```text
http://127.0.0.1/phpmyadmin
```

En Linux/macOS, si Apache necesita permisos para logs:

```bash
mkdir -p api/logs
chmod 775 api/logs
```

## Docker

El proyecto incluye `Dockerfile` y `docker-compose.yml`.

```bash
docker compose up --build -d
```

URLs:

- App: `http://localhost:8080/`
- API: `http://localhost:8080/api/config.php`
- MySQL host: `localhost:3307`

Comandos útiles:

```bash
docker compose ps
docker compose down
docker compose down -v   # elimina también el volumen MySQL
```

## Uso de la aplicación

### Cámara

| Acción | Resultado |
| --- | --- |
| Click izquierdo + arrastrar | Rotar vista |
| Rueda del mouse | Acercar o alejar |
| Click derecho + arrastrar | Desplazamiento lateral |
| `W` / `A` / `S` / `D` | Mover cámara en el plano horizontal |

### Estantes

| Acción | Resultado |
| --- | --- |
| Click en **Editar estantes** | Activa modo edición |
| Click sobre un estante | Selecciona el estante |
| Click en espacio vacío | Deselecciona |
| Arrastrar estante seleccionado | Mueve el estante |
| `R` con estante seleccionado | Rota 90 grados |
| **Agregar piso** | Inserta un piso intermedio |
| **Eliminar piso** | Elimina el último piso añadido |
| **Redimensionar** | Cambia dimensiones |

Los cambios de posición, rotación, pisos y dimensiones se guardan automáticamente.

### Productos

| Acción | Resultado |
| --- | --- |
| Seleccionar estante | Muestra resumen volumétrico |
| Completar SKU, nombre y dimensiones | Prepara el producto |
| **Agregar producto** | Coloca, anima y persiste |
| Buscar por SKU o nombre | Enfoca y resalta |
| Click sobre producto | Abre panel de información |
| **Eliminar** | Elimina de escena y BD |
| **Mover** | Permite recolocar |
| **Transferir** | Mueve a otro estante |
| **Editar** | Modifica dimensiones |

## Pruebas

Pruebas unitarias:

```bash
npm test
```

Pruebas de integración:

```bash
npm run test:integration
```

Las pruebas de integración requieren Apache/PHP y MySQL activos. Si la API no está disponible, se omiten automáticamente.

Cobertura principal:

- Cálculo de volumen.
- Colocación y colisión AABB.
- Forma de respuestas `GET`.
- Validación de `POST`.
- Persistencia crear, listar y verificar.
- Eliminación de productos.
- Restauración del estado de estantes al finalizar.

## Detalles técnicos

### Motor de colocación

El motor en [src/canPlace.ts](src/canPlace.ts) usa compresión de coordenadas y validación AABB:

1. Extrae coordenadas candidatas desde caras de productos ya colocados.
2. Filtra combinaciones dentro de los límites del estante y del piso actual.
3. Precalcula las cajas AABB existentes para evitar trabajo repetido.
4. Prueba las 6 orientaciones ortogonales del producto.
5. Devuelve la primera posición válida o informa que no hay espacio.

### Configuración de estantes

Los estantes se cargan desde MySQL. Si la base está vacía o incompleta, se usa [public/warehouse-config.json](public/warehouse-config.json) como fallback y luego se persiste.

Campos principales:

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único |
| `label` | Nombre visible |
| `width` / `height` / `depth` | Dimensiones |
| `position` | Coordenada `{x, y, z}` |
| `rotationY` | Rotación sobre eje Y |
| `sections` | Número de secciones uniformes |
| `boardOffsets` | Posiciones de pisos como fracción `[0..1]` |

### Seguridad y errores

- Las credenciales se leen desde `.env`.
- CORS usa `ALLOWED_ORIGIN`.
- Las entradas se validan antes de persistir.
- Las consultas SQL usan PDO con sentencias preparadas.
- Los errores se registran en `api/logs/error.log`.
- Las respuestas de error incluyen `code` para facilitar depuración desde el frontend.

## Entrega

La guía breve de evidencias está en [ENTREGA.md](ENTREGA.md).
