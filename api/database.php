<?php

declare(strict_types=1);

function db_connect(bool $ensureDatabase = true): PDO
{
    $host = "localhost";
    $dbName = "almacensekai";
    $user = "root";
    $password = "";
    $charset = "utf8mb4";

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
            $pdo->rollBack();
            throw $exception;
        }
    }

    return $applied;
}
