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
    db_ensure_schema($pdo);
} catch (PDOException $e) {
    api_log_error($e, "db_connect");
    http_response_code(500);
    echo json_encode(["error" => "No se pudo conectar a la base de datos.", "code" => "DB_CONNECT_ERROR"]);
    exit;
}

//
// ───────────────────────────── GET ─────────────────────────────
//
if ($_SERVER["REQUEST_METHOD"] === "GET") {
    try {
        $rows = $pdo->query("
            SELECT
                p.sku,
                p.shelf_id,
                p.name,
                COALESCE(cat.nombre, p.category, 'Sin categoria') AS category,
                cat.id AS category_id,
                COALESCE(m.nombre, 'Sin marca') AS brand,
                m.id AS brand_id,
                p.local_x,
                p.local_y,
                p.local_z,
                d.width,
                d.height,
                d.depth
            FROM productos p
            INNER JOIN producto_dimensiones d ON d.id = p.dimension_id
            LEFT JOIN categorias cat ON cat.id = p.categoria_id
            LEFT JOIN marcas m ON m.id = p.marca_id
            ORDER BY p.sku
        ")->fetchAll(PDO::FETCH_ASSOC);
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
                "category" => $row["category"] ?? "Sin categoria",
                "categoryId" => isset($row["category_id"]) ? (int)$row["category_id"] : null,
                "brand" => $row["brand"] ?? "Sin marca",
                "brandId" => isset($row["brand_id"]) ? (int)$row["brand_id"] : null
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

    $category = valid_string($body["category"] ?? "Sin categoria", 150) ?? "Sin categoria";
    $brand = valid_string($body["brand"] ?? ($body["marca"] ?? "Sin marca"), 150) ?? "Sin marca";

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

    try {
        $pdo->beginTransaction();

        $categoryId = upsertCatalogValue($pdo, "categorias", $category);
        $brandId = upsertCatalogValue($pdo, "marcas", $brand);

        $existingStmt = $pdo->prepare("
            SELECT
                p.sku,
                p.shelf_id,
                p.name,
                COALESCE(cat.nombre, p.category, 'Sin categoria') AS category,
                COALESCE(m.nombre, 'Sin marca') AS brand,
                p.dimension_id,
                p.local_x,
                p.local_y,
                p.local_z,
                d.width,
                d.height,
                d.depth
            FROM productos p
            LEFT JOIN producto_dimensiones d ON d.id = p.dimension_id
            LEFT JOIN categorias cat ON cat.id = p.categoria_id
            LEFT JOIN marcas m ON m.id = p.marca_id
            WHERE p.sku = :sku
        ");
        $existingStmt->execute([":sku" => $sku]);
        $previous = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        $dimensionId = $previous["dimension_id"] ?? null;

        if ($dimensionId) {
            $dimensionStmt = $pdo->prepare("
                UPDATE producto_dimensiones
                SET width = :width, height = :height, depth = :depth
                WHERE id = :id
            ");
            $dimensionStmt->execute([
                ":id" => $dimensionId,
                ":width" => $width,
                ":height" => $height,
                ":depth" => $depth,
            ]);
        } else {
            $dimensionStmt = $pdo->prepare("
                INSERT INTO producto_dimensiones (producto_sku, width, height, depth)
                VALUES (:producto_sku, :width, :height, :depth)
            ");
            $dimensionStmt->execute([
                ":producto_sku" => $sku,
                ":width" => $width,
                ":height" => $height,
                ":depth" => $depth,
            ]);
            $dimensionId = (int)$pdo->lastInsertId();
        }

        $stmt = $pdo->prepare("
            INSERT INTO productos
            (sku, shelf_id, name, category, categoria_id, marca_id, dimension_id, local_x, local_y, local_z)
            VALUES
            (:sku, :shelf_id, :name, :category, :categoria_id, :marca_id, :dimension_id, :local_x, :local_y, :local_z)
            ON DUPLICATE KEY UPDATE
                shelf_id = VALUES(shelf_id),
                name = VALUES(name),
                category = VALUES(category),
                categoria_id = VALUES(categoria_id),
                marca_id = VALUES(marca_id),
                dimension_id = VALUES(dimension_id),
                local_x = VALUES(local_x),
                local_y = VALUES(local_y),
                local_z = VALUES(local_z)
        ");
        $stmt->execute([
            ":sku"      => $sku,
            ":shelf_id" => $shelfId,
            ":name"     => $name,
            ":category" => $category,
            ":categoria_id" => $categoryId,
            ":marca_id" => $brandId,
            ":dimension_id" => $dimensionId,
            ":local_x"  => $lx,
            ":local_y"  => $ly,
            ":local_z"  => $lz,
        ]);

        $action = getProductHistoryAction($previous, $shelfId, $name, $category, $brand, $width, $height, $depth, $lx, $ly, $lz);
        insertProductHistory($pdo, $sku, $action, $previous, [
            "shelf_id" => $shelfId,
            "name" => $name,
            "category" => $category,
            "brand" => $brand,
            "width" => $width,
            "height" => $height,
            "depth" => $depth,
            "local_x" => $lx,
            "local_y" => $ly,
            "local_z" => $lz
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
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
        $pdo->beginTransaction();
        $previousStmt = $pdo->prepare("
            SELECT
                p.sku,
                p.shelf_id,
                p.name,
                COALESCE(cat.nombre, p.category, 'Sin categoria') AS category,
                COALESCE(m.nombre, 'Sin marca') AS brand,
                p.local_x,
                p.local_y,
                p.local_z,
                d.width,
                d.height,
                d.depth
            FROM productos p
            LEFT JOIN producto_dimensiones d ON d.id = p.dimension_id
            LEFT JOIN categorias cat ON cat.id = p.categoria_id
            LEFT JOIN marcas m ON m.id = p.marca_id
            WHERE p.sku = :sku
        ");
        $previousStmt->execute([":sku" => $sku]);
        $previous = $previousStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $stmt = $pdo->prepare("
            DELETE p, d
            FROM productos p
            LEFT JOIN producto_dimensiones d ON d.id = p.dimension_id
            WHERE p.sku = :sku
        ");
        $stmt->execute([":sku" => $sku]);
        if ($previous) {
            insertProductHistory($pdo, $sku, "eliminado", $previous, null);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        api_log_error($e, "productos:DELETE sku={$sku}");
        http_response_code(500);
        echo json_encode(["error" => "No se pudo eliminar el producto.", "code" => "PRODUCT_DELETE_ERROR"]);
        exit;
    }

    echo json_encode(["ok" => true]);
}

function getProductHistoryAction(?array $previous, string $shelfId, string $name, string $category, string $brand, float $width, float $height, float $depth, float $lx, float $ly, float $lz): string
{
    if (!$previous) return "creado";

    $moved = $previous["shelf_id"] !== $shelfId
        || abs((float)$previous["local_x"] - $lx) > 0.0001
        || abs((float)$previous["local_y"] - $ly) > 0.0001
        || abs((float)$previous["local_z"] - $lz) > 0.0001;

    return $moved ? "movido" : "editado";
}

function insertProductHistory(PDO $pdo, string $sku, string $action, ?array $previous, ?array $next): void
{
    $summary = buildProductHistorySummary($sku, $action, $previous, $next);
    $details = json_encode([
        "before" => $previous,
        "after" => $next
    ], JSON_UNESCAPED_UNICODE);

    $stmt = $pdo->prepare("
        INSERT INTO producto_historial
        (producto_sku, accion, shelf_id_anterior, shelf_id_nuevo, local_x_anterior, local_y_anterior, local_z_anterior,
         local_x_nuevo, local_y_nuevo, local_z_nuevo, resumen, detalles)
        VALUES
        (:sku, :accion, :shelf_old, :shelf_new, :x_old, :y_old, :z_old, :x_new, :y_new, :z_new, :resumen, :detalles)
    ");
    $stmt->execute([
        ":sku" => $sku,
        ":accion" => $action,
        ":shelf_old" => $previous["shelf_id"] ?? null,
        ":shelf_new" => $next["shelf_id"] ?? null,
        ":x_old" => isset($previous["local_x"]) ? (float)$previous["local_x"] : null,
        ":y_old" => isset($previous["local_y"]) ? (float)$previous["local_y"] : null,
        ":z_old" => isset($previous["local_z"]) ? (float)$previous["local_z"] : null,
        ":x_new" => isset($next["local_x"]) ? (float)$next["local_x"] : null,
        ":y_new" => isset($next["local_y"]) ? (float)$next["local_y"] : null,
        ":z_new" => isset($next["local_z"]) ? (float)$next["local_z"] : null,
        ":resumen" => $summary,
        ":detalles" => $details
    ]);
}

function buildProductHistorySummary(string $sku, string $action, ?array $previous, ?array $next): string
{
    if ($action === "creado") {
        return "Producto {$sku} creado en " . ($next["shelf_id"] ?? "estante desconocido") . ".";
    }
    if ($action === "movido") {
        return "Producto {$sku} movido de " . ($previous["shelf_id"] ?? "sin estante") . " a " . ($next["shelf_id"] ?? "sin estante") . ".";
    }
    if ($action === "eliminado") {
        return "Producto {$sku} eliminado de " . ($previous["shelf_id"] ?? "estante desconocido") . ".";
    }
    return "Producto {$sku} editado.";
}

function upsertCatalogValue(PDO $pdo, string $table, string $name): int
{
    $cleanName = trim($name) !== "" ? trim($name) : ($table === "marcas" ? "Sin marca" : "Sin categoria");
    $slug = strtolower(str_replace(" ", "-", $cleanName));

    $stmt = $pdo->prepare("INSERT INTO `{$table}` (nombre, slug) VALUES (:nombre, :slug) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)");
    $stmt->execute([":nombre" => $cleanName, ":slug" => $slug]);

    $select = $pdo->prepare("SELECT id FROM `{$table}` WHERE nombre = :nombre");
    $select->execute([":nombre" => $cleanName]);
    return (int)$select->fetchColumn();
}
