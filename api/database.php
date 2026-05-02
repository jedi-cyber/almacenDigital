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
    header("Access-Control-Allow-Headers: Content-Type");
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

function db_run_migrations(PDO $pdo): array
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS migrations (
            id VARCHAR(191) NOT NULL PRIMARY KEY,
            batch INT NOT NULL,
            migrated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $lockName = "almacen_digital_migrations";
    $lockAcquired = (int)$pdo->query("SELECT GET_LOCK('{$lockName}', 10)")->fetchColumn();
    if ($lockAcquired !== 1) {
        throw new RuntimeException("No se pudo obtener el bloqueo de migraciones.");
    }

    try {
        return db_run_migrations_locked($pdo);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('{$lockName}')");
    }
}

function db_run_migrations_locked(PDO $pdo): array
{
    $migrationFiles = glob(__DIR__ . "/migrations/*.php") ?: [];
    sort($migrationFiles);

    $executed = $pdo->query("SELECT id FROM migrations")->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $executedMap = array_fill_keys($executed, true);
    $batch = (int)$pdo->query("SELECT COALESCE(MAX(batch), 0) + 1 FROM migrations")->fetchColumn();
    $applied = [];

    foreach ($migrationFiles as $migrationFile) {
        $migration = require $migrationFile;
        if (!is_array($migration) || !isset($migration["id"], $migration["up"]) || !is_callable($migration["up"])) {
            throw new RuntimeException("Migracion invalida: " . basename($migrationFile));
        }

        $migrationId = (string)$migration["id"];
        if (isset($executedMap[$migrationId])) {
            continue;
        }

        $pdo->beginTransaction();
        try {
            $migration["up"]($pdo);
            $stmt = $pdo->prepare("INSERT INTO migrations (id, batch) VALUES (:id, :batch)");
            $stmt->execute([
                ":id" => $migrationId,
                ":batch" => $batch
            ]);
            $pdo->commit();
            $applied[] = $migrationId;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    return $applied;
}
