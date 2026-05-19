<?php
require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("GET, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    echo json_encode(["error" => "Metodo no permitido.", "code" => "METHOD_NOT_ALLOWED"]);
    exit;
}

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);
    require_api_session($pdo);

    $categorias = $pdo->query("SELECT id, nombre, slug FROM categorias ORDER BY nombre")->fetchAll(PDO::FETCH_ASSOC);
    $marcas = $pdo->query("SELECT id, nombre, slug FROM marcas ORDER BY nombre")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "categories" => array_map(fn($row) => [
            "id" => (int)$row["id"],
            "name" => $row["nombre"],
            "slug" => $row["slug"],
        ], $categorias),
        "brands" => array_map(fn($row) => [
            "id" => (int)$row["id"],
            "name" => $row["nombre"],
            "slug" => $row["slug"],
        ], $marcas),
    ]);
} catch (Throwable $e) {
    api_log_error($e, "catalogos:GET");
    http_response_code(500);
    echo json_encode(["error" => "No se pudieron leer los catalogos.", "code" => "CATALOG_READ_ERROR"]);
}
