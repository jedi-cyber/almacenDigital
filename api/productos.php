<?php
require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("GET, POST, DELETE, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    $pdo = db_connect(true);
    db_run_migrations($pdo);
} catch (PDOException $e) {
    api_log_error($e, "db_connect");
    http_response_code(500);
    echo json_encode(["error" => "No se pudo conectar a la base de datos.", "code" => "DB_CONNECT_ERROR"]);
    exit;
} catch (Throwable $e) {
    api_log_error($e, "migrations");
    http_response_code(500);
    echo json_encode(["error" => "Error al inicializar la base de datos.", "code" => "MIGRATION_ERROR"]);
    exit;
}

//
// ───────────────────────────── GET ─────────────────────────────
//
if ($_SERVER["REQUEST_METHOD"] === "GET") {
    try {
        $rows = $pdo->query("SELECT * FROM productos")->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        api_log_error($e, "productos:GET");
        http_response_code(500);
        echo json_encode(["error" => "No se pudieron leer los productos.", "code" => "PRODUCT_READ_ERROR"]);
        exit;
    }

    $products = array_map(function ($row) {
        return [
            "shelfId" => $row["shelf_id"],
            "item" => [
                "sku"    => $row["sku"],
                "name"   => $row["name"],
                "width"  => (float)$row["width"],
                "height" => (float)$row["height"],
                "depth"  => (float)$row["depth"],
                "category" => $row["category"] ?? "Sin categoría" // 🔥 AÑADIDO
            ],
            "localPosition" => [
                "x" => (float)$row["local_x"],
                "y" => (float)$row["local_y"],
                "z" => (float)$row["local_z"]
            ]
        ];
    }, $rows);

    echo json_encode(["products" => $products]);
}

//
// ───────────────────────────── POST ─────────────────────────────
//
elseif ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true);

    $sku     = valid_string($body["sku"]     ?? null, 64);
    $shelfId = valid_string($body["shelfId"] ?? null, 64);
    $name    = valid_string($body["name"]    ?? ($body["sku"] ?? null), 255) ?? $sku;

    $width   = valid_positive_float($body["width"]  ?? null);
    $height  = valid_positive_float($body["height"] ?? null);
    $depth   = valid_positive_float($body["depth"]  ?? null);

    $category = valid_string($body["category"] ?? "Sin categoría", 100); // 🔥 NUEVO

    $lx = isset($body["localPosition"]["x"]) && is_numeric($body["localPosition"]["x"]) ? (float)$body["localPosition"]["x"] : null;
    $ly = isset($body["localPosition"]["y"]) && is_numeric($body["localPosition"]["y"]) ? (float)$body["localPosition"]["y"] : null;
    $lz = isset($body["localPosition"]["z"]) && is_numeric($body["localPosition"]["z"]) ? (float)$body["localPosition"]["z"] : null;

    $missing = array_keys(array_filter(
        compact("sku", "shelfId", "width", "height", "depth"),
        fn($v) => $v === null
    ));
    if ($lx === null) $missing[] = "localPosition.x";
    if ($ly === null) $missing[] = "localPosition.y";
    if ($lz === null) $missing[] = "localPosition.z";

    if (!empty($missing)) {
        http_response_code(422);
        echo json_encode([
            "error" => "Campos invalidos o faltantes: " . implode(", ", $missing),
            "code" => "INVALID_FIELDS"
        ]);
        exit;
    }

    $stmt = $pdo->prepare("
        INSERT INTO productos
        (sku, shelf_id, name, width, height, depth, category, local_x, local_y, local_z)
        VALUES
        (:sku, :shelf_id, :name, :width, :height, :depth, :category, :local_x, :local_y, :local_z)
        ON DUPLICATE KEY UPDATE
            shelf_id = VALUES(shelf_id),
            name     = VALUES(name),
            width    = VALUES(width),
            height   = VALUES(height),
            depth    = VALUES(depth),
            category = VALUES(category), -- 🔥 IMPORTANTE
            local_x  = VALUES(local_x),
            local_y  = VALUES(local_y),
            local_z  = VALUES(local_z)
    ");

    try {
        $stmt->execute([
            ":sku"      => $sku,
            ":shelf_id" => $shelfId,
            ":name"     => $name,
            ":width"    => $width,
            ":height"   => $height,
            ":depth"    => $depth,
            ":category" => $category, // 🔥
            ":local_x"  => $lx,
            ":local_y"  => $ly,
            ":local_z"  => $lz,
        ]);
    } catch (Throwable $e) {
        api_log_error($e, "productos:POST:upsert sku={$sku}");
        http_response_code(500);
        echo json_encode(["error" => "No se pudo guardar el producto.", "code" => "PRODUCT_SAVE_ERROR"]);
        exit;
    }

    echo json_encode(["ok" => true]);
}

//
// ───────────────────────────── DELETE ─────────────────────────────
//
elseif ($_SERVER["REQUEST_METHOD"] === "DELETE") {
    $sku = $_GET["sku"] ?? "";

    if ($sku === "") {
        http_response_code(400);
        echo json_encode(["error" => "El parametro 'sku' es requerido.", "code" => "MISSING_SKU"]);
        exit;
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM productos WHERE sku = :sku");
        $stmt->execute([":sku" => $sku]);
    } catch (Throwable $e) {
        api_log_error($e, "productos:DELETE sku={$sku}");
        http_response_code(500);
        echo json_encode(["error" => "No se pudo eliminar el producto.", "code" => "PRODUCT_DELETE_ERROR"]);
        exit;
    }

    echo json_encode(["ok" => true]);
}