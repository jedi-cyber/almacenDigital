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

    $limit = isset($_GET["limit"]) && is_numeric($_GET["limit"])
        ? max(1, min(200, (int)$_GET["limit"]))
        : 50;
    $sku = trim((string)($_GET["sku"] ?? ""));

    $sql = "
        SELECT
            id,
            producto_sku,
            accion,
            shelf_id_anterior,
            shelf_id_nuevo,
            local_x_anterior,
            local_y_anterior,
            local_z_anterior,
            local_x_nuevo,
            local_y_nuevo,
            local_z_nuevo,
            resumen,
            created_at
        FROM producto_historial
    ";
    $params = [];
    if ($sku !== "") {
        $sql .= " WHERE producto_sku = :sku";
        $params[":sku"] = $sku;
    }
    $sql .= " ORDER BY created_at DESC, id DESC LIMIT {$limit}";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $history = array_map(function ($row) {
        return [
            "id" => (int)$row["id"],
            "sku" => $row["producto_sku"],
            "action" => $row["accion"],
            "summary" => $row["resumen"],
            "from" => [
                "shelfId" => $row["shelf_id_anterior"],
                "localPosition" => [
                    "x" => isset($row["local_x_anterior"]) ? (float)$row["local_x_anterior"] : null,
                    "y" => isset($row["local_y_anterior"]) ? (float)$row["local_y_anterior"] : null,
                    "z" => isset($row["local_z_anterior"]) ? (float)$row["local_z_anterior"] : null
                ]
            ],
            "to" => [
                "shelfId" => $row["shelf_id_nuevo"],
                "localPosition" => [
                    "x" => isset($row["local_x_nuevo"]) ? (float)$row["local_x_nuevo"] : null,
                    "y" => isset($row["local_y_nuevo"]) ? (float)$row["local_y_nuevo"] : null,
                    "z" => isset($row["local_z_nuevo"]) ? (float)$row["local_z_nuevo"] : null
                ]
            ],
            "createdAt" => $row["created_at"]
        ];
    }, $rows);

    echo json_encode(["history" => $history], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    api_log_error($e, "historial:GET");
    http_response_code(500);
    echo json_encode(["error" => "No se pudo leer el historial.", "code" => "HISTORY_READ_ERROR"]);
}
