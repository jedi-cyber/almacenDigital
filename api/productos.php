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
    $session = require_api_session($pdo);
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
    require_api_permission($session, "product:read");
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
                p.image_url,
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
                "brandId" => isset($row["brand_id"]) ? (int)$row["brand_id"] : null,
                "imageUrl" => $row["image_url"] ?? null
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
    require_api_permission($session, "product:write");
    $body = json_decode(file_get_contents("php://input"), true);

    if (!is_array($body)) {
        api_fail(400, "JSON invalido.", "INVALID_JSON");
    }

    $sku     = valid_product_sku($body["sku"] ?? null);
    $shelfId = valid_shelf_id($body["shelfId"] ?? null);
    $name    = valid_string($body["name"]    ?? ($body["sku"] ?? null), 255) ?? $sku;

    $width   = valid_float_range($body["width"]  ?? null, 0.01, 3.0);
    $height  = valid_float_range($body["height"] ?? null, 0.01, 3.0);
    $depth   = valid_float_range($body["depth"]  ?? null, 0.01, 3.0);

    $category = valid_catalog_name($body["category"] ?? null, "Sin categoria");
    $brand = valid_catalog_name($body["brand"] ?? ($body["marca"] ?? null), "Sin marca");
    $imageUrl = valid_optional_url($body["imageUrl"] ?? ($body["image_url"] ?? null), 500);
    if (($body["imageUrl"] ?? ($body["image_url"] ?? null)) !== null && $imageUrl === null) {
        api_fail(422, "URL de imagen invalida.", "INVALID_IMAGE_URL");
    }

    $localPosition = is_array($body["localPosition"] ?? null) ? $body["localPosition"] : [];
    $lx = valid_float_range($localPosition["x"] ?? null, -20.0, 20.0);
    $ly = valid_float_range($localPosition["y"] ?? null, 0.0, 10.0);
    $lz = valid_float_range($localPosition["z"] ?? null, -20.0, 20.0);

    $missing = array_keys(array_filter(
        compact("sku", "shelfId", "width", "height", "depth"),
        fn($v) => $v === null
    ));
    if ($lx === null) $missing[] = "localPosition.x";
    if ($ly === null) $missing[] = "localPosition.y";
    if ($lz === null) $missing[] = "localPosition.z";

    if (!empty($missing)) {
        api_fail(422, "Campos invalidos o faltantes: " . implode(", ", $missing), "INVALID_FIELDS");
    }

    $shelfStmt = $pdo->prepare("SELECT width, height, depth FROM estantes WHERE id = :id LIMIT 1");
    $shelfStmt->execute([":id" => $shelfId]);
    $shelf = $shelfStmt->fetch(PDO::FETCH_ASSOC);
    if (!$shelf) {
        api_fail(422, "El estante indicado no existe.", "INVALID_SHELF");
    }
    if ($width > (float)$shelf["width"] || $height > (float)$shelf["height"] || $depth > (float)$shelf["depth"]) {
        api_fail(422, "El producto supera las medidas del estante.", "PRODUCT_TOO_LARGE");
    }
    if ($lx + $width > (float)$shelf["width"] + 0.0001 || $ly + $height > (float)$shelf["height"] + 0.0001 || $lz + $depth > (float)$shelf["depth"] + 0.0001) {
        api_fail(422, "La posicion del producto queda fuera del estante.", "PRODUCT_OUT_OF_SHELF");
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
                p.image_url,
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
            (sku, shelf_id, name, category, categoria_id, marca_id, dimension_id, image_url, local_x, local_y, local_z)
            VALUES
            (:sku, :shelf_id, :name, :category, :categoria_id, :marca_id, :dimension_id, :image_url, :local_x, :local_y, :local_z)
            ON DUPLICATE KEY UPDATE
                shelf_id = VALUES(shelf_id),
                name = VALUES(name),
                category = VALUES(category),
                categoria_id = VALUES(categoria_id),
                marca_id = VALUES(marca_id),
                dimension_id = VALUES(dimension_id),
                image_url = VALUES(image_url),
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
            ":image_url" => $imageUrl,
            ":local_x"  => $lx,
            ":local_y"  => $ly,
            ":local_z"  => $lz,
        ]);

        $action = getProductHistoryAction($previous, $shelfId, $name, $category, $brand, $width, $height, $depth, $lx, $ly, $lz);
        insertProductHistory($pdo, $session, $sku, $action, $previous, [
            "shelf_id" => $shelfId,
            "name" => $name,
            "category" => $category,
            "brand" => $brand,
            "image_url" => $imageUrl,
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
    require_api_permission($session, "product:delete");
    $sku = valid_product_sku($_GET["sku"] ?? null);

    if ($sku === null) {
        api_fail(400, "El parametro 'sku' es requerido o invalido.", "INVALID_SKU");
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
                p.image_url,
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
            insertProductHistory($pdo, $session, $sku, "eliminado", $previous, null);
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

function insertProductHistory(PDO $pdo, array $session, string $sku, string $action, ?array $previous, ?array $next): void
{
    $summary = buildProductHistorySummary($sku, $action, $previous, $next);
    $user = $session["user"] ?? [];
    $details = json_encode([
        "before" => $previous,
        "after" => $next,
        "actor" => [
            "id" => $user["id"] ?? null,
            "name" => $user["name"] ?? null,
            "email" => $user["email"] ?? null,
            "role" => $user["role"] ?? null,
        ],
    ], JSON_UNESCAPED_UNICODE);

    $stmt = $pdo->prepare("
        INSERT INTO producto_historial
        (producto_sku, accion, shelf_id_anterior, shelf_id_nuevo, local_x_anterior, local_y_anterior, local_z_anterior,
         local_x_nuevo, local_y_nuevo, local_z_nuevo, resumen, detalles, usuario_id, usuario_nombre, usuario_email, usuario_rol)
        VALUES
        (:sku, :accion, :shelf_old, :shelf_new, :x_old, :y_old, :z_old, :x_new, :y_new, :z_new, :resumen, :detalles,
         :usuario_id, :usuario_nombre, :usuario_email, :usuario_rol)
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
        ":detalles" => $details,
        ":usuario_id" => isset($user["id"]) ? (int)$user["id"] : null,
        ":usuario_nombre" => $user["name"] ?? null,
        ":usuario_email" => $user["email"] ?? null,
        ":usuario_rol" => $user["role"] ?? null
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

function valid_optional_url(mixed $v, int $maxLen = 500): ?string
{
    if (!is_string($v)) {
        return null;
    }
    $s = trim($v);
    if ($s === "") {
        return null;
    }
    if (strlen($s) > $maxLen) {
        return null;
    }
    if (preg_match('/^\s*javascript:/i', $s)) {
        return null;
    }
    return filter_var($s, FILTER_VALIDATE_URL) || str_starts_with($s, "/") || str_starts_with($s, "./") || str_starts_with($s, "image/")
        ? $s
        : null;
}
