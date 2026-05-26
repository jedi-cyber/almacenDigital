# Base de datos (almacensekai)

Esta carpeta alimenta el contenedor MariaDB definido en `docker-compose.yml`.

Todo archivo `*.sql` o `*.sh` colocado en `db/init/` se ejecuta **una sola vez**, en
orden alfabético, la primera vez que arranca el volumen de la base de datos.

## Cargar tu dump

Los dumps de base de datos están en `.gitignore` a propósito: contienen credenciales
(hashes de contraseñas) y tokens de sesión, por lo que **no** se versionan.

1. Exporta tu base con phpMyAdmin / mysqldump (es un dump de **MariaDB**).
2. Cópialo a esta carpeta, por ejemplo:

   ```
   db/init/01_almacensekai.sql
   ```

3. Arranca todo:

   ```bash
   docker compose up --build -d
   ```

Para recargar desde cero (borra los datos):

```bash
docker compose down -v && docker compose up --build -d
```

## Notas

- La app web y la app Android comparten esta misma base mediante la API PHP.
- No incluyas filas de la tabla `sesiones` en el dump: son datos de ejecución.
