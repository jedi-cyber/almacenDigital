<?php

declare(strict_types=1);

function db_load_env(): void
{
    $envFile = dirname(__DIR__) . "/.env";
    if (!is_file($envFile)) {
        return;
    }
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), "#") || !str_contains($line, "=")) {
            continue;
        }
        [$key, $value] = explode("=", $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($key !== "" && !array_key_exists($key, $_ENV)) {
            $_ENV[$key] = $value;
            putenv("{$key}={$value}");
        }
    }
}

db_load_env();

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function api_log_error(Throwable $e, string $context = ""): void
{
    $logDir = __DIR__ . "/logs";
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }

    $ts     = date("Y-m-d H:i:s");
    $method = $_SERVER["REQUEST_METHOD"] ?? "CLI";
    $uri    = $_SERVER["REQUEST_URI"]    ?? "-";
    $type   = get_class($e);
    $msg    = $e->getMessage();
    $loc    = $e->getFile() . ":" . $e->getLine();
    $ctx    = $context !== "" ? " [{$context}]" : "";

    $entry = "[{$ts}] {$method} {$uri}{$ctx} | {$type}: {$msg} @ {$loc}" . PHP_EOL;

    file_put_contents($logDir . "/error.log", $entry, FILE_APPEND | LOCK_EX);
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function cors_headers(string $methods = "GET, POST, OPTIONS"): void
{
    $allowed = $_ENV["ALLOWED_ORIGIN"] ?? "*";
    $origin  = $_SERVER["HTTP_ORIGIN"] ?? "";
    $allowedOrigins = array_filter(array_map("trim", explode(",", $allowed)));

    if ($allowed === "*") {
        header("Access-Control-Allow-Origin: *");
    } elseif ($origin !== "" && in_array($origin, $allowedOrigins, true)) {
        header("Access-Control-Allow-Origin: {$origin}");
        header("Vary: Origin");
    }
    // Si el origen no coincide no se envía el header y el navegador bloqueará la petición.

    header("Access-Control-Allow-Methods: {$methods}");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
}

function get_bearer_token(): ?string
{
    $header = $_SERVER["HTTP_AUTHORIZATION"]
        ?? $_SERVER["REDIRECT_HTTP_AUTHORIZATION"]
        ?? "";

    if ($header === "" && function_exists("getallheaders")) {
        $headers = getallheaders();
        $header = $headers["Authorization"] ?? $headers["authorization"] ?? "";
    }

    if (preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function require_api_session(PDO $pdo): array
{
    $token = get_bearer_token();
    if (!$token) {
        http_response_code(401);
        echo json_encode(["error" => "Sesion requerida.", "code" => "AUTH_REQUIRED"]);
        exit;
    }

    $stmt = $pdo->prepare(
        "SELECT
            s.expires_at,
            u.id,
            u.nombre,
            u.email,
            u.rol
         FROM sesiones s
         INNER JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = :token_hash
            AND s.expires_at > NOW()
            AND u.activo = 1
         LIMIT 1"
    );
    $stmt->execute([":token_hash" => hash("sha256", $token)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(401);
        echo json_encode(["error" => "Sesion invalida o expirada.", "code" => "INVALID_SESSION"]);
        exit;
    }

    $update = $pdo->prepare("UPDATE sesiones SET last_seen_at = NOW() WHERE token_hash = :token_hash");
    $update->execute([":token_hash" => hash("sha256", $token)]);

	    return [
	        "token" => $token,
	        "expiresAt" => $row["expires_at"],
	        "user" => [
	            "id" => (int)$row["id"],
	            "name" => $row["nombre"],
	            "email" => $row["email"],
	            "role" => $row["rol"],
	        ],
	    ];
	}

function normalize_user_role(string $role): string
{
    $clean = strtolower(trim($role));
    return match ($clean) {
        "admin", "administrador" => "admin",
        "operador", "operator" => "operador",
        "consulta", "consultor", "viewer", "solo consulta" => "consulta",
        default => $clean,
    };
}

function canonical_user_role(string $role): ?string
{
    return match (normalize_user_role($role)) {
        "admin" => "Admin",
        "operador" => "Operador",
        "consulta" => "Consulta",
        default => null,
    };
}

function session_can(array $session, string $permission): bool
{
    $role = normalize_user_role((string)($session["user"]["role"] ?? ""));
    $permissions = [
        "admin" => ["product:read", "product:write", "product:delete", "shelf:write", "report:read", "image:upload", "user:manage"],
        "operador" => ["product:read", "product:write", "image:upload"],
        "consulta" => ["product:read", "report:read"],
    ];
    return in_array($permission, $permissions[$role] ?? [], true);
}

function require_api_permission(array $session, string $permission): void
{
    if (session_can($session, $permission)) {
        return;
    }
    http_response_code(403);
    echo json_encode(["error" => "No tienes permisos para realizar esta accion.", "code" => "FORBIDDEN"]);
    exit;
}

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

/**
 * Devuelve el float si el valor es numérico y mayor que cero, o null en caso contrario.
 */
function valid_positive_float(mixed $v): ?float
{
    if (!is_numeric($v)) {
        return null;
    }
    $f = (float)$v;
    return $f > 0 ? $f : null;
}

/**
 * Devuelve el string recortado si no está vacío y no supera $maxLen, o null.
 */
function valid_string(mixed $v, int $maxLen = 255): ?string
{
    if (!is_string($v)) {
        return null;
    }
    $s = trim($v);
	    return ($s !== "" && strlen($s) <= $maxLen) ? $s : null;
	}

function valid_pattern_string(mixed $v, int $maxLen, string $pattern): ?string
{
    $s = valid_string($v, $maxLen);
    if ($s === null || !preg_match($pattern, $s)) {
        return null;
    }
    return $s;
}

function valid_float_range(mixed $v, float $min, float $max): ?float
{
    if (!is_numeric($v)) {
        return null;
    }
    $f = (float)$v;
    return ($f >= $min && $f <= $max) ? $f : null;
}

function valid_product_sku(mixed $v): ?string
{
    return valid_pattern_string($v, 64, '/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/');
}

function valid_shelf_id(mixed $v): ?string
{
    return valid_pattern_string($v, 64, '/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/');
}

function valid_catalog_name(mixed $v, string $fallback): string
{
    $name = valid_string($v, 150) ?? $fallback;
    $name = preg_replace('/\s+/', ' ', $name) ?? $fallback;
    return trim($name) !== "" ? trim($name) : $fallback;
}

function api_fail(int $status, string $message, string $code): void
{
    http_response_code($status);
    echo json_encode(["error" => $message, "code" => $code], JSON_UNESCAPED_UNICODE);
    exit;
}

function db_connect(bool $ensureDatabase = true): PDO
{
    $host    = $_ENV["DB_HOST"]    ?? "localhost";
    $dbName  = $_ENV["DB_NAME"]    ?? "almacensekai";
    $user    = $_ENV["DB_USER"]    ?? "root";
    $password = $_ENV["DB_PASSWORD"] ?? "";
    $charset = $_ENV["DB_CHARSET"] ?? "utf8mb4";

    if ($ensureDatabase) {
        $serverPdo = new PDO("mysql:host={$host};charset={$charset}", $user, $password);
        $serverPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $serverPdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET {$charset} COLLATE {$charset}_unicode_ci");
    }

    $pdo = new PDO("mysql:host={$host};dbname={$dbName};charset={$charset}", $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $pdo;
}

function db_ensure_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS estantes (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
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
            rotation_y FLOAT NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS almacen_config (
            config_key VARCHAR(100) NOT NULL PRIMARY KEY,
            config_value JSON NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS usuarios (
            id INT NOT NULL AUTO_INCREMENT,
            nombre VARCHAR(120) NOT NULL,
            email VARCHAR(180) NOT NULL,
            rol VARCHAR(80) NOT NULL DEFAULT 'Administrador',
            password_hash VARCHAR(255) NOT NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS sesiones (
            id BIGINT NOT NULL AUTO_INCREMENT,
            usuario_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            ip_address VARCHAR(45) NULL,
            user_agent VARCHAR(255) NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP NULL DEFAULT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_sesiones_token_hash (token_hash),
            KEY idx_sesiones_usuario_id (usuario_id),
            KEY idx_sesiones_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS producto_dimensiones (
            id INT NOT NULL AUTO_INCREMENT,
            producto_sku VARCHAR(100) NOT NULL,
            width FLOAT NOT NULL,
            height FLOAT NOT NULL,
            depth FLOAT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_producto_dimensiones_sku (producto_sku)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS categorias (
            id INT NOT NULL AUTO_INCREMENT,
            nombre VARCHAR(150) NOT NULL,
            slug VARCHAR(180) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_categorias_nombre (nombre),
            KEY idx_categorias_slug (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS marcas (
            id INT NOT NULL AUTO_INCREMENT,
            nombre VARCHAR(150) NOT NULL,
            slug VARCHAR(180) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_marcas_nombre (nombre),
            KEY idx_marcas_slug (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
	        "CREATE TABLE IF NOT EXISTS productos (
	            sku VARCHAR(100) NOT NULL PRIMARY KEY,
	            numero_serie VARCHAR(120) NULL,
	            shelf_id VARCHAR(100) NOT NULL,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(150) NOT NULL DEFAULT 'Sin categoria',
            categoria_id INT NULL,
            marca_id INT NULL,
            dimension_id INT NULL,
            image_url VARCHAR(500) NULL,
            local_x FLOAT NOT NULL DEFAULT 0,
            local_y FLOAT NOT NULL DEFAULT 0,
            local_z FLOAT NOT NULL DEFAULT 0,
	            INDEX idx_productos_numero_serie (numero_serie),
	            INDEX idx_productos_categoria_id (categoria_id),
            INDEX idx_productos_marca_id (marca_id),
            INDEX idx_productos_dimension_id (dimension_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS producto_historial (
            id BIGINT NOT NULL AUTO_INCREMENT,
            producto_sku VARCHAR(100) NOT NULL,
            accion ENUM('creado','editado','movido','eliminado') NOT NULL,
            shelf_id_anterior VARCHAR(100) NULL,
            shelf_id_nuevo VARCHAR(100) NULL,
            local_x_anterior FLOAT NULL,
            local_y_anterior FLOAT NULL,
            local_z_anterior FLOAT NULL,
            local_x_nuevo FLOAT NULL,
            local_y_nuevo FLOAT NULL,
            local_z_nuevo FLOAT NULL,
	            resumen VARCHAR(255) NOT NULL,
	            detalles JSON NULL,
	            usuario_id INT NULL,
	            usuario_nombre VARCHAR(120) NULL,
	            usuario_email VARCHAR(180) NULL,
	            usuario_rol VARCHAR(80) NULL,
	            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	            PRIMARY KEY (id),
	            KEY idx_producto_historial_sku (producto_sku),
	            KEY idx_producto_historial_accion (accion),
	            KEY idx_producto_historial_usuario_id (usuario_id),
	            KEY idx_producto_historial_created_at (created_at)
	        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
	    );

	    db_add_column_if_missing($pdo, "productos", "category", "VARCHAR(150) NOT NULL DEFAULT 'Sin categoria'");
	    db_add_column_if_missing($pdo, "productos", "numero_serie", "VARCHAR(120) NULL");
    db_add_column_if_missing($pdo, "productos", "categoria_id", "INT NULL");
    db_add_column_if_missing($pdo, "productos", "marca_id", "INT NULL");
    db_add_column_if_missing($pdo, "productos", "dimension_id", "INT NULL");
    db_add_column_if_missing($pdo, "productos", "image_url", "VARCHAR(500) NULL");
	    db_add_column_if_missing($pdo, "usuarios", "password_hash", "VARCHAR(255) NULL");
	    db_add_column_if_missing($pdo, "producto_historial", "usuario_id", "INT NULL");
	    db_add_column_if_missing($pdo, "producto_historial", "usuario_nombre", "VARCHAR(120) NULL");
	    db_add_column_if_missing($pdo, "producto_historial", "usuario_email", "VARCHAR(180) NULL");
	    db_add_column_if_missing($pdo, "producto_historial", "usuario_rol", "VARCHAR(80) NULL");
	    db_seed_default_user($pdo);
    $pdo->exec("ALTER TABLE usuarios MODIFY COLUMN password_hash VARCHAR(255) NOT NULL");
	    $pdo->exec("ALTER TABLE productos MODIFY COLUMN name VARCHAR(255) NOT NULL");
	    db_add_index_if_missing($pdo, "productos", "idx_productos_numero_serie", "numero_serie");
	    db_add_unique_index_if_missing($pdo, "productos", "idx_productos_numero_serie", "numero_serie");
    db_add_index_if_missing($pdo, "productos", "idx_productos_categoria_id", "categoria_id");
    db_add_index_if_missing($pdo, "productos", "idx_productos_marca_id", "marca_id");
	    db_add_index_if_missing($pdo, "productos", "idx_productos_dimension_id", "dimension_id");
	    db_add_index_if_missing($pdo, "producto_historial", "idx_producto_historial_usuario_id", "usuario_id");
    db_seed_product_catalogs($pdo);
    db_migrate_inline_product_dimensions($pdo);
    db_seed_default_shelves($pdo);
}

function db_add_column_if_missing(PDO $pdo, string $table, string $column, string $definition): void
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `{$table}` LIKE :column");
    $stmt->execute([":column" => $column]);
    if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
    }
}

function db_drop_column_if_exists(PDO $pdo, string $table, string $column): void
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `{$table}` LIKE :column");
    $stmt->execute([":column" => $column]);
    if ($stmt->fetch(PDO::FETCH_ASSOC)) {
        $pdo->exec("ALTER TABLE `{$table}` DROP COLUMN `{$column}`");
    }
}

function db_add_index_if_missing(PDO $pdo, string $table, string $index, string $column): void
{
    $stmt = $pdo->prepare("SHOW INDEX FROM `{$table}` WHERE Key_name = :index_name");
    $stmt->execute([":index_name" => $index]);
    if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
        $pdo->exec("ALTER TABLE `{$table}` ADD INDEX `{$index}` (`{$column}`)");
    }
}

/**
 * Add a UNIQUE index on `$column` if not already present. Detects duplicate values
 * first; if any exist, the unique key is NOT added and a warning is written to the
 * PHP error log so the operator can clean the data manually. NULL values are allowed
 * to repeat (MySQL/MariaDB treat NULL as distinct in unique indexes).
 */
function db_add_unique_index_if_missing(PDO $pdo, string $table, string $index, string $column): void
{
    $check = $pdo->prepare("SHOW INDEX FROM `{$table}` WHERE Key_name = :index_name");
    $check->execute([":index_name" => $index]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);
    if ($existing && (int)($existing["Non_unique"] ?? 1) === 0) {
        return;
    }

    $dupStmt = $pdo->query(
        "SELECT `{$column}` AS value, COUNT(*) AS total
         FROM `{$table}`
         WHERE `{$column}` IS NOT NULL AND `{$column}` <> ''
         GROUP BY `{$column}` HAVING total > 1 LIMIT 5"
    );
    $duplicates = $dupStmt ? $dupStmt->fetchAll(PDO::FETCH_ASSOC) : [];
    if (!empty($duplicates)) {
        $sample = array_map(fn($row) => $row["value"], $duplicates);
        error_log(
            "[almacen] No se puede crear UNIQUE `{$index}` en `{$table}`.`{$column}`: " .
            "existen duplicados (muestra: " . implode(", ", $sample) . "). " .
            "Corrige los datos y vuelve a ejecutar migrate.php."
        );
        return;
    }

    if ($existing) {
        $pdo->exec("ALTER TABLE `{$table}` DROP INDEX `{$index}`");
    }
    $pdo->exec("ALTER TABLE `{$table}` ADD UNIQUE INDEX `{$index}` (`{$column}`)");
}

function db_migrate_inline_product_dimensions(PDO $pdo): void
{
    $hasWidth = db_column_exists($pdo, "productos", "width");
    $hasHeight = db_column_exists($pdo, "productos", "height");
    $hasDepth = db_column_exists($pdo, "productos", "depth");

    if ($hasWidth && $hasHeight && $hasDepth) {
        $pdo->exec(
            "INSERT INTO producto_dimensiones (producto_sku, width, height, depth)
             SELECT
                sku,
                COALESCE(NULLIF(width, 0), 0.24),
                COALESCE(NULLIF(height, 0), 0.18),
                COALESCE(NULLIF(depth, 0), 0.22)
             FROM productos
             ON DUPLICATE KEY UPDATE
                width = VALUES(width),
                height = VALUES(height),
                depth = VALUES(depth)"
        );
    } else {
        $pdo->exec(
            "INSERT INTO producto_dimensiones (producto_sku, width, height, depth)
             SELECT sku, 0.24, 0.18, 0.22
             FROM productos
             WHERE dimension_id IS NULL
             ON DUPLICATE KEY UPDATE
                producto_sku = VALUES(producto_sku)"
        );
    }

    $pdo->exec(
        "UPDATE productos p
         INNER JOIN producto_dimensiones d ON d.producto_sku = p.sku
         SET p.dimension_id = d.id
         WHERE p.dimension_id IS NULL"
    );

    db_drop_column_if_exists($pdo, "productos", "width");
    db_drop_column_if_exists($pdo, "productos", "height");
    db_drop_column_if_exists($pdo, "productos", "depth");
}

function db_column_exists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `{$table}` LIKE :column");
    $stmt->execute([":column" => $column]);
    return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
}

function db_seed_product_catalogs(PDO $pdo): void
{
    db_insert_catalog_value($pdo, "categorias", "Sin categoria");
    db_insert_catalog_value($pdo, "marcas", "Sin marca");

    if (db_table_exists($pdo, "catalogo_productos")) {
        $pdo->exec(
            "INSERT INTO categorias (nombre, slug)
             SELECT DISTINCT
                TRIM(COALESCE(NULLIF(categoria, ''), 'Sin categoria')) AS nombre,
                LOWER(REPLACE(TRIM(COALESCE(NULLIF(categoria, ''), 'Sin categoria')), ' ', '-')) AS slug
             FROM catalogo_productos
             ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)"
        );

        $pdo->exec(
            "INSERT INTO marcas (nombre, slug)
             SELECT DISTINCT
                TRIM(COALESCE(NULLIF(marca, ''), 'Sin marca')) AS nombre,
                LOWER(REPLACE(TRIM(COALESCE(NULLIF(marca, ''), 'Sin marca')), ' ', '-')) AS slug
             FROM catalogo_productos
             ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)"
        );

        $pdo->exec(
            "UPDATE productos p
             INNER JOIN catalogo_productos c ON c.sku = p.sku
             INNER JOIN categorias cat ON cat.nombre = TRIM(COALESCE(NULLIF(c.categoria, ''), 'Sin categoria'))
             LEFT JOIN marcas m ON m.nombre = TRIM(COALESCE(NULLIF(c.marca, ''), 'Sin marca'))
             SET
                p.categoria_id = cat.id,
                p.marca_id = m.id,
                p.category = cat.nombre
             WHERE p.categoria_id IS NULL OR p.marca_id IS NULL"
        );
    }

    $pdo->exec(
        "UPDATE productos p
         INNER JOIN categorias cat ON cat.nombre = p.category
         SET p.categoria_id = cat.id
         WHERE p.categoria_id IS NULL"
    );

    $pdo->exec(
        "UPDATE productos p
         INNER JOIN marcas m ON m.nombre = 'Sin marca'
         SET p.marca_id = m.id
         WHERE p.marca_id IS NULL"
    );
}

function db_insert_catalog_value(PDO $pdo, string $table, string $name): int
{
    $slug = strtolower(str_replace(" ", "-", trim($name)));
    $stmt = $pdo->prepare("INSERT INTO `{$table}` (nombre, slug) VALUES (:nombre, :slug) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)");
    $stmt->execute([":nombre" => $name, ":slug" => $slug]);

    $select = $pdo->prepare("SELECT id FROM `{$table}` WHERE nombre = :nombre");
    $select->execute([":nombre" => $name]);
    return (int)$select->fetchColumn();
}

function db_table_exists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare("SHOW TABLES LIKE :table_name");
    $stmt->execute([":table_name" => $table]);
    return (bool)$stmt->fetchColumn();
}

function db_seed_default_shelves(PDO $pdo): void
{
    $count = (int)$pdo->query("SELECT COUNT(*) FROM estantes")->fetchColumn();
    if ($count > 0) {
        return;
    }

    $shelves = [
        ["S01", "Estante 1", 4, "[\"Piso 1\",\"Piso 2\",\"Piso 3\",\"Piso 4\"]", 5, 3, 1.5, 0.181258, 1.5, -1.35038, 0],
        ["S02", "Estante 2", 4, "[\"Piso 1\",\"Piso 2\",\"Piso 3\",\"Piso 4\"]", 9.3, 3, 1.5, -2.33224, 1.5, 4.36018, 0],
        ["S03", "Estante 3", 4, "[\"Piso 1\",\"Piso 2\",\"Piso 3\",\"Piso 4\"]", 10.5, 3, 1.5, -7.69119, 1.5, -1.79926, 1.5708],
        ["S04", "Estante 4", 4, "[\"Piso 1\",\"Piso 2\",\"Piso 3\",\"Piso 4\"]", 5, 3, 1.5, -3.19786, 1.5, -4.67629, 1.5708],
        ["S05", "Estante 5", 4, "[\"Piso 1\",\"Piso 2\",\"Piso 3\",\"Piso 4\"]", 3, 3, 1.5, -5.4773, 1.5, -7.88806, 0],
    ];

    $stmt = $pdo->prepare(
        "INSERT INTO estantes
            (id, label, sections, section_labels, width, height, depth, pos_x, pos_y, pos_z, rotation_y)
         VALUES
            (:id, :label, :sections, :section_labels, :width, :height, :depth, :pos_x, :pos_y, :pos_z, :rotation_y)"
    );

    foreach ($shelves as $shelf) {
        $stmt->execute([
            ":id" => $shelf[0],
            ":label" => $shelf[1],
            ":sections" => $shelf[2],
            ":section_labels" => $shelf[3],
            ":width" => $shelf[4],
            ":height" => $shelf[5],
            ":depth" => $shelf[6],
            ":pos_x" => $shelf[7],
            ":pos_y" => $shelf[8],
            ":pos_z" => $shelf[9],
            ":rotation_y" => $shelf[10],
        ]);
    }
}

function db_seed_default_user(PDO $pdo): void
{
    $count = (int)$pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
    if ($count > 0) {
        return;
    }

    $defaultPasswordHash = password_hash("admin123", PASSWORD_DEFAULT);
    $stmt = $pdo->prepare(
        "INSERT INTO usuarios (nombre, email, rol, password_hash, activo)
         VALUES (:nombre, :email, :rol, :password_hash, 1)
         ON DUPLICATE KEY UPDATE
            password_hash = COALESCE(NULLIF(password_hash, ''), VALUES(password_hash)),
            activo = 1"
    );
    $stmt->execute([
        ":nombre" => "Admin Almacén",
        ":email" => "admin@almacen.local",
        ":rol" => "Admin",
        ":password_hash" => $defaultPasswordHash,
    ]);
}
