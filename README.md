# Almacén Digital 3D

Aplicación web para representar un almacén en 3D, administrar estantes y ubicar productos mediante búsqueda y ruta guiada. El proyecto usa Three.js en frontend, API PHP y MySQL/MariaDB como persistencia.

## Características

- Escena 3D del almacén con estantes, productos, paredes, puerta, etiquetas y rutas guiadas.
- Búsqueda por SKU o nombre con enfoque automático al producto.
- Ruta visual tipo mapa para llegar al producto dentro del almacén.
- Configuración de entrada del almacén y pasillos transitables para rutas más realistas.
- Administración web de estantes: mover, rotar, redimensionar y gestionar pisos.
- Administración web de productos: crear, editar, mover, transferir y eliminar.
- API compartida para web y app móvil.
- Base normalizada: `productos` guarda ubicación y `producto_dimensiones` guarda medidas.
- Catálogos normalizados: `categorias` y `marcas` se relacionan con `productos`.
- Importación de catálogo desde `productos_sinTamano.sql` con tamaño estándar.

## Tecnologías

- TypeScript, Vite, Three.js, GSAP
- PHP 8 con PDO
- MySQL/MariaDB
- XAMPP para desarrollo local
- Docker para despliegue reproducible

## Estructura

```text
api/        API PHP, conexión, validación, logs y esquema de BD
docs/       Documentación técnica del proyecto
public/     Assets públicos y configuración base del almacén
scripts/    SQL y utilidades operativas
src/        Aplicación web 3D en TypeScript
tests/      Pruebas unitarias e integración
dist/       Build generado por Vite
```

Archivos clave:

- [api/database.php](api/database.php): conexión, CORS, validaciones y `db_ensure_schema()`.
- [api/productos.php](api/productos.php): API de productos con `JOIN` a dimensiones.
- [api/config.php](api/config.php): API de estantes, entrada del almacén y pasillos.
- [scripts/importar_catalogo_dimensiones.sql](scripts/importar_catalogo_dimensiones.sql): importa catálogo y crea estructura actual.
- [src/warehouseScene.ts](src/warehouseScene.ts): escena 3D, cámara y ruta guiada.
- [src/warehouse.ts](src/warehouse.ts): persistencia y runtime de productos.
- [src/canPlace.ts](src/canPlace.ts): colocación y colisiones.

Más detalle:

- [docs/arquitectura.md](docs/arquitectura.md)
- [docs/base-de-datos.md](docs/base-de-datos.md)
- [docs/fase-8-pulido-flujo-principal.md](docs/fase-8-pulido-flujo-principal.md)
- [docs/docker.md](docs/docker.md)
- [docs/xampp.md](docs/xampp.md)

## Instalación Local Con XAMPP

Ubica el proyecto en:

```text
C:\xampp\htdocs\almacenDigital
```

Activa Apache y MySQL desde XAMPP.

Crea `.env` desde `.env.example`:

```env
DB_HOST=localhost
DB_NAME=almacensekai
DB_USER=root
DB_PASSWORD=
DB_CHARSET=utf8mb4
ALLOWED_ORIGIN=http://localhost:5173,https://appassets.androidplatform.net
```

Instala dependencias y levanta Vite:

```bash
npm install
npm run dev
```

Web:

```text
http://localhost:5173/
```

API:

```text
http://127.0.0.1/almacenDigital/api/
```

## Base De Datos

La base por defecto es:

```text
almacensekai
```

El proyecto ya no usa tabla `migrations`. La API verifica y crea el esquema necesario con `db_ensure_schema()`.

Tablas principales:

```text
estantes
almacen_config
catalogo_productos
categorias
marcas
productos
producto_dimensiones
```

`productos` ya no contiene `width`, `height`, `depth`. Ahora contiene `dimension_id`, `categoria_id` y `marca_id`. Las dimensiones se leen desde `producto_dimensiones`; categoría y marca se leen desde `categorias` y `marcas`.

Para importar el catálogo con tamaño estándar:

```powershell
C:\xampp\mysql\bin\mysql.exe -u root almacensekai -e "DROP TABLE IF EXISTS catalogo_productos;"
C:\xampp\mysql\bin\mysql.exe -u root almacensekai -e "SOURCE C:/xampp/htdocs/almacenDigital/productos_sinTamano.sql;"
C:\xampp\mysql\bin\mysql.exe -u root almacensekai -e "SOURCE C:/xampp/htdocs/almacenDigital/scripts/importar_catalogo_dimensiones.sql;"
```

Tamaño estándar usado:

```text
0.24 x 0.18 x 0.22
```

La importación distribuye productos en 4 pisos por estante para que la vista 3D aproveche la altura del almacén.

Para confirmar:

```sql
SELECT COUNT(*) FROM catalogo_productos;
SELECT COUNT(*) FROM productos;
SELECT COUNT(*) FROM producto_dimensiones;
SHOW TABLES LIKE 'migrations';
```

## Docker

```bash
docker compose up --build -d
```

URLs:

- App: `http://localhost:8080/`
- API: `http://localhost:8080/api/config.php`
- Catálogos: `http://localhost:8080/api/catalogos.php`
- MariaDB: `localhost:3307`

La base de datos corre sobre **MariaDB** (coincide con el dump exportado y con XAMPP).
En el primer arranque importa automáticamente cualquier `*.sql` que coloques en
`db/init/` (ver `db/README.md`). Los dumps están en `.gitignore` porque contienen
credenciales, así que debes copiar el tuyo antes de levantar Docker.

`ALLOWED_ORIGIN` ya incluye `https://appassets.androidplatform.net` para que la vista
3D embebida en la app Android pase CORS.

El healthcheck usa `/api/config.php`; no usa migraciones.

Para reiniciar la base Docker desde cero:

```bash
docker compose down -v
docker compose up --build -d
```

## Comandos

```bash
npm run dev
npm run build
npm run build:android   # build + copia dist/ a la app Android (ver abajo)
npm run sync:android    # solo copia el último build a la app Android
npm run preview
npm test
npm run test:integration
```

## Web Y Móvil

Este repositorio contiene la web y la API. La app móvil (Android) vive en el repo
`almacenDigital-Android` (en este equipo está en
`C:\Users\HP\AndroidStudioProjects\Almacen3D2`). La app es **híbrida**: las pantallas
nativas (login, productos, búsqueda) llaman a la API PHP, y la vista de **ruta 3D**
carga el frontend web compilado dentro de un WebView.

Separación funcional:

- Web: administra estantes, elimina productos, edita estructura del almacén y opera la escena completa.
- Móvil: busca, crea y edita productos; no elimina productos ni edita estantes.
- Ambos consumen la API PHP/MariaDB.

### Mantener la app Android sincronizada con la web

La vista 3D embebida usa una copia del build de Vite dentro de
`<android>/app/src/main/assets/`. Para que **no se desincronice** al cambiar la web,
regenera y copia con un solo comando. Si los repos están lado a lado:

```bash
npm run build:android
```

Si están en otra ruta (caso típico en este equipo), pásala explícitamente:

```bash
npm run sync:android -- "C:/Users/HP/AndroidStudioProjects/Almacen3D2/app/src/main/assets"
# o
ANDROID_ASSETS_DIR="C:/Users/HP/AndroidStudioProjects/Almacen3D2/app/src/main/assets" npm run sync:android
```

### Configuración de la API en el móvil

Ya **no** hay ninguna IP fija en el código web. La URL del servidor la define la app
Android (en su pantalla **Configuración**) y la inyecta al WebView como `nativeApiBase`.
Usa la IP local de tu PC en la misma red Wi-Fi, por ejemplo
`http://192.168.1.50/almacenDigital/api/` (en el emulador, `http://10.0.2.2/almacenDigital/api/`).

## Uso

Productos:

- Buscar por SKU o nombre.
- Crear producto con SKU, nombre, categoría, estante y dimensiones.
- Editar dimensiones y ubicación.
- Abrir ruta guiada hacia el producto.

Estantes y ruta:

- Editar desde web.
- Mover o rotar en modo edición.
- Cambiar tamaño o pisos.
- Guardar la entrada del almacén desde el panel de gestión.
- Definir pasillos en JSON para que la ruta guiada se comporte más como un mapa interior.

Cámara:

- Mouse para rotar y hacer zoom.
- `W`, `A`, `S`, `D` para desplazamiento horizontal.

## Pruebas

```bash
npm test
npm run test:integration
```

Las pruebas de integración requieren Apache y MySQL activos.

## Respaldos

Antes de cambios grandes:

```powershell
C:\xampp\mysql\bin\mysqldump.exe -u root almacensekai > backup.sql
```

En este proyecto se generó un respaldo antes de normalizar dimensiones:

```text
backup_antes_dimensiones_20260513_094243.sql
```
