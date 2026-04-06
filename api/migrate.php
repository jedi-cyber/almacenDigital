<?php

declare(strict_types=1);

require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");

try {
    $pdo = db_connect(true);
    $applied = db_run_migrations($pdo);

    echo json_encode([
        "ok" => true,
        "applied" => $applied,
        "message" => count($applied) > 0
            ? "Migraciones ejecutadas correctamente."
            : "La base de datos ya estaba al dia."
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "error" => $exception->getMessage()
    ]);
}
