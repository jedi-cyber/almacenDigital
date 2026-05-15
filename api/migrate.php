<?php

declare(strict_types=1);

require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);

    echo json_encode([
        "ok" => true,
        "message" => "Esquema verificado correctamente. El proyecto ya no usa tabla migrations."
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "error" => $exception->getMessage()
    ]);
}
