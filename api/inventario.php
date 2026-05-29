<?php
require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("GET, POST, OPTIONS");

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

$method = $_SERVER["REQUEST_METHOD"];
$action = $_GET["action"] ?? "";

//
// ───────────────────────────── GET ─────────────────────────────
//

if ($method === "GET") {

    // GET ?action=categorias → lista todas las categorías
    if ($action === "categorias") {
        try {
            $rows = $pdo->query(
                "SELECT id, nombre, tipo_caja, medida_caja, productos_x_caja,
                        total_productos, cajas_necesarias
                 FROM categorias
                 ORDER BY nombre ASC"
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            api_log_error($e, "inventario:GET:categorias");
            http_response_code(500);
            echo json_encode(["error" => "No se pudieron leer las categorías.", "code" => "CATEGORIAS_READ_ERROR"]);
            exit;
        }

        echo json_encode(["categorias" => $rows]);
        exit;
    }

    // GET ?action=cajas&shelf_id=X → cajas de un estante específico
    if ($action === "cajas") {
        $shelfId = valid_string($_GET["shelf_id"] ?? null, 20);

        if ($shelfId === null) {
            http_response_code(422);
            echo json_encode(["error" => "El parámetro 'shelf_id' es requerido.", "code" => "MISSING_SHELF_ID"]);
            exit;
        }

        try {
            $stmt = $pdo->prepare(
                "SELECT ci.id, ci.codigo_caja, ci.shelf_id,
                        ci.unidades_actual, ci.unidades_max,
                        ci.pos_x, ci.pos_y, ci.pos_z,
                        ci.estado, ci.created_at,
                        c.nombre   AS categoria_nombre,
                        c.tipo_caja,
                        c.medida_caja
                 FROM cajas_inventario ci
                 JOIN categorias c ON c.id = ci.categoria_id
                 WHERE ci.shelf_id = :shelf_id
                 ORDER BY ci.created_at ASC"
            );
            $stmt->execute([":shelf_id" => $shelfId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            api_log_error($e, "inventario:GET:cajas shelf={$shelfId}");
            http_response_code(500);
            echo json_encode(["error" => "No se pudieron leer las cajas.", "code" => "CAJAS_READ_ERROR"]);
            exit;
        }

        echo json_encode(["cajas" => $rows]);
        exit;
    }

    // GET ?action=escanear&sku=X → identifica producto y devuelve su categoría + caja sugerida
    if ($action === "escanear") {
        $sku = valid_string($_GET["sku"] ?? null, 100);

        if ($sku === null) {
            http_response_code(422);
            echo json_encode(["error" => "El parámetro 'sku' es requerido.", "code" => "MISSING_SKU"]);
            exit;
        }

        try {
            // Buscar producto en tabla productos
            $stmt = $pdo->prepare(
                "SELECT p.sku, p.name, p.shelf_id, p.stock, p.ean,
                        c.id   AS categoria_id,
                        c.nombre AS categoria_nombre,
                        c.tipo_caja,
                        c.medida_caja,
                        c.productos_x_caja
                 FROM productos p
                 LEFT JOIN categorias c ON UPPER(TRIM(c.nombre)) = UPPER(TRIM(p.category))
                 WHERE LOWER(TRIM(p.sku)) = LOWER(TRIM(:sku))
                    OR p.ean = :ean"
            );
            $stmt->execute([":sku" => $sku, ":ean" => $sku]);
            $producto = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            api_log_error($e, "inventario:GET:escanear sku={$sku}");
            http_response_code(500);
            echo json_encode(["error" => "Error al buscar el producto.", "code" => "SCAN_READ_ERROR"]);
            exit;
        }

        if (!$producto) {
            http_response_code(404);
            echo json_encode(["error" => "Producto no encontrado.", "code" => "PRODUCT_NOT_FOUND", "sku" => $sku]);
            exit;
        }

        echo json_encode([
            "producto" => [
                "sku"              => $producto["sku"],
                "ean"              => $producto["ean"] ?? null,
                "nombre"           => $producto["name"],
                "stock"            => (int)($producto["stock"] ?? 0),
                "categoria_id"     => $producto["categoria_id"],
                "categoria_nombre" => $producto["categoria_nombre"] ?? "Sin categoría",
                "tipo_caja"        => $producto["tipo_caja"] ?? null,
                "medida_caja"      => $producto["medida_caja"] ?? null,
                "productos_x_caja" => $producto["productos_x_caja"] ?? null,
            ]
        ]);
        exit;
    }

    // GET ?action=resumen → resumen general de ocupación por estante
    if ($action === "resumen") {
        try {
            $rows = $pdo->query(
                "SELECT ci.shelf_id,
                        COUNT(ci.id)                          AS total_cajas,
                        SUM(ci.unidades_actual)               AS total_unidades,
                        SUM(ci.unidades_max)                  AS capacidad_total,
                        ROUND(
                            SUM(ci.unidades_actual) / NULLIF(SUM(ci.unidades_max), 0) * 100
                        , 1)                                  AS ocupacion_pct,
                        SUM(ci.estado = 'LLENA')              AS cajas_llenas,
                        SUM(ci.estado = 'ACTIVA')             AS cajas_activas,
                        SUM(ci.estado = 'VACIA')              AS cajas_vacias
                 FROM cajas_inventario ci
                 GROUP BY ci.shelf_id
                 ORDER BY ci.shelf_id ASC"
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            api_log_error($e, "inventario:GET:resumen");
            http_response_code(500);
            echo json_encode(["error" => "No se pudo generar el resumen.", "code" => "RESUMEN_READ_ERROR"]);
            exit;
        }

        echo json_encode(["resumen" => $rows]);
        exit;
    }

// GET ?action=stock&sku=X → devuelve stock actual de un producto
if ($action === "stock") {
    $sku = valid_string($_GET["sku"] ?? null, 100);

    if ($sku === null) {
        http_response_code(422);
        echo json_encode(["error" => "El parámetro 'sku' es requerido.", "code" => "MISSING_SKU"]);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            "SELECT sku, name, stock, shelf_id
             FROM productos
             WHERE sku = :sku"
        );
        $stmt->execute([":sku" => $sku]);
        $producto = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        api_log_error($e, "inventario:GET:stock sku={$sku}");
        http_response_code(500);
        echo json_encode(["error" => "Error al consultar el stock.", "code" => "STOCK_READ_ERROR"]);
        exit;
    }

    if (!$producto) {
        http_response_code(404);
        echo json_encode(["error" => "Producto no encontrado.", "code" => "PRODUCT_NOT_FOUND"]);
        exit;
    }

    echo json_encode(["producto" => $producto]);
    exit;
}



    http_response_code(400);
    echo json_encode(["error" => "Acción no reconocida.", "code" => "UNKNOWN_ACTION"]);
    exit;

    // Generar SKU automático basado en EAN
    $sku = "EAN-" . $ean;

    try {
        $pdo->beginTransaction();

        // Insertar producto nuevo
        $stmt = $pdo->prepare(
            "INSERT INTO productos (sku, ean, name, shelf_id, width, height, depth, stock)
             VALUES (:sku, :ean, :name, :shelf_id, 10, 10, 10, :stock)
             ON DUPLICATE KEY UPDATE
                ean = :ean2, stock = stock + :stock2"
        );
        $stmt->execute([
            ":sku"      => $sku,
            ":ean"      => $ean,
            ":name"     => $nombre,
            ":shelf_id" => $shelfId,
            ":stock"    => $unidades,
            ":ean2"     => $ean,
            ":stock2"   => $unidades,
        ]);

        $pdo->commit();

    } catch (Throwable $e) {
        $pdo->rollBack();
        api_log_error($e, "inventario:POST:registrar_producto_nuevo ean={$ean}");
        http_response_code(500);
        echo json_encode(["error" => "No se pudo registrar el producto.", "code" => "PRODUCTO_SAVE_ERROR"]);
        exit;
    }

    echo json_encode([
        "ok"    => true,
        "sku"   => $sku,
        "ean"   => $ean,
        "nombre"=> $nombre,
        "stock" => $unidades,
    ]);
    exit;
}

//
// ───────────────────────────── POST ─────────────────────────────
//

elseif ($method === "POST") {

    $body = json_decode(file_get_contents("php://input"), true);
    $action = valid_string($body["action"] ?? null, 50);

    // POST action=registrar_caja → registra una nueva caja en un estante
    if ($action === "registrar_caja") {
        $codigoCaja  = valid_string($body["codigo_caja"]  ?? null, 100);
        $categoriaId = isset($body["categoria_id"]) && is_numeric($body["categoria_id"])
                        ? (int)$body["categoria_id"] : null;
        $shelfId     = valid_string($body["shelf_id"]     ?? null, 20);
        $unidades    = isset($body["unidades"]) && is_numeric($body["unidades"])
                        ? (int)$body["unidades"] : null;

        $missing = [];
        if ($codigoCaja  === null) $missing[] = "codigo_caja";
        if ($categoriaId === null) $missing[] = "categoria_id";
        if ($shelfId     === null) $missing[] = "shelf_id";
        if ($unidades    === null) $missing[] = "unidades";

        if (!empty($missing)) {
            http_response_code(422);
            echo json_encode([
                "error" => "Campos inválidos o faltantes: " . implode(", ", $missing),
                "code"  => "INVALID_FIELDS"
            ]);
            exit;
        }

        // Verificar que la categoría existe y obtener unidades_max
        try {
            $stmt = $pdo->prepare("SELECT id, productos_x_caja FROM categorias WHERE id = :id");
            $stmt->execute([":id" => $categoriaId]);
            $categoria = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            api_log_error($e, "inventario:POST:registrar_caja:categoria");
            http_response_code(500);
            echo json_encode(["error" => "Error al verificar la categoría.", "code" => "CATEGORIA_READ_ERROR"]);
            exit;
        }

        if (!$categoria) {
            http_response_code(404);
            echo json_encode(["error" => "Categoría no encontrada.", "code" => "CATEGORIA_NOT_FOUND"]);
            exit;
        }

        $unidadesMax = (int)$categoria["productos_x_caja"];

        // Validar que las unidades no superen la capacidad de la caja
        if ($unidades > $unidadesMax) {
            http_response_code(422);
            echo json_encode([
                "error"        => "Las unidades ({$unidades}) superan la capacidad máxima de la caja ({$unidadesMax}).",
                "code"         => "UNITS_EXCEED_CAPACITY",
                "unidades_max" => $unidadesMax
            ]);
            exit;
        }

        $estado = $unidades >= $unidadesMax ? "LLENA" : ($unidades === 0 ? "VACIA" : "ACTIVA");

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare(
                "INSERT INTO cajas_inventario
                    (codigo_caja, categoria_id, shelf_id, unidades_actual, unidades_max, estado)
                 VALUES
                    (:codigo_caja, :categoria_id, :shelf_id, :unidades_actual, :unidades_max, :estado)"
            );
            $stmt->execute([
                ":codigo_caja"    => $codigoCaja,
                ":categoria_id"   => $categoriaId,
                ":shelf_id"       => $shelfId,
                ":unidades_actual"=> $unidades,
                ":unidades_max"   => $unidadesMax,
                ":estado"         => $estado,
            ]);
            $cajaId = (int)$pdo->lastInsertId();

            // Actualizar stock — buscar por SKU o por EAN
            $stmt = $pdo->prepare(
                "UPDATE productos SET stock = stock + :unidades
                 WHERE sku = :sku OR ean = :ean"
            );
            $stmt->execute([":unidades" => $unidades, ":sku" => $codigoCaja, ":ean" => $codigoCaja]);

            // Resolver SKU real (puede venir EAN como codigo_caja)
            $stmtSku = $pdo->prepare(
                "SELECT sku FROM productos WHERE sku = :sku OR ean = :ean LIMIT 1"
            );
            $stmtSku->execute([":sku" => $codigoCaja, ":ean" => $codigoCaja]);
            $skuReal = $stmtSku->fetchColumn() ?: $codigoCaja;

            // Registrar movimiento de ENTRADA
            $stmt = $pdo->prepare(
                "INSERT INTO movimientos_inventario (caja_id, producto_sku, unidades, tipo)
                 VALUES (:caja_id, :sku, :unidades, 'ENTRADA')"
            );
            $stmt->execute([
                ":caja_id"  => $cajaId,
                ":sku"      => $skuReal,
                ":unidades" => $unidades,
            ]);

            $pdo->commit();

        } catch (Throwable $e) {
            $pdo->rollBack();
            api_log_error($e, "inventario:POST:registrar_caja sku={$codigoCaja}");
            if ($e->getCode() === "23000") {
                http_response_code(409);
                echo json_encode(["error" => "El código de caja ya existe.", "code" => "CAJA_DUPLICATE"]);
            } else {
                http_response_code(500);
                echo json_encode(["error" => "No se pudo registrar la caja.", "code" => "CAJA_SAVE_ERROR"]);
            }
            exit;
        }

        echo json_encode([
            "ok"           => true,
            "caja_id"      => $cajaId,
            "estado"       => $estado,
            "unidades_max" => $unidadesMax,
        ]);
        exit;
    }

    // POST action=actualizar_posicion → actualiza pos 3D de una caja en el estante
    if ($action === "actualizar_posicion") {
        $cajaId = isset($body["caja_id"]) && is_numeric($body["caja_id"])
                    ? (int)$body["caja_id"] : null;
        $px = isset($body["pos_x"]) && is_numeric($body["pos_x"]) ? (float)$body["pos_x"] : null;
        $py = isset($body["pos_y"]) && is_numeric($body["pos_y"]) ? (float)$body["pos_y"] : null;
        $pz = isset($body["pos_z"]) && is_numeric($body["pos_z"]) ? (float)$body["pos_z"] : null;

        $missing = [];
        if ($cajaId === null) $missing[] = "caja_id";
        if ($px === null)     $missing[] = "pos_x";
        if ($py === null)     $missing[] = "pos_y";
        if ($pz === null)     $missing[] = "pos_z";

        if (!empty($missing)) {
            http_response_code(422);
            echo json_encode([
                "error" => "Campos inválidos o faltantes: " . implode(", ", $missing),
                "code"  => "INVALID_FIELDS"
            ]);
            exit;
        }

        try {
            $stmt = $pdo->prepare(
                "UPDATE cajas_inventario SET pos_x = :px, pos_y = :py, pos_z = :pz
                 WHERE id = :id"
            );
            $stmt->execute([":px" => $px, ":py" => $py, ":pz" => $pz, ":id" => $cajaId]);
        } catch (Throwable $e) {
            api_log_error($e, "inventario:POST:actualizar_posicion caja={$cajaId}");
            http_response_code(500);
            echo json_encode(["error" => "No se pudo actualizar la posición.", "code" => "POSITION_UPDATE_ERROR"]);
            exit;
        }

        echo json_encode(["ok" => true]);
        exit;
    }

// POST action=registrar_movimiento → actualiza stock y guarda movimiento
if ($action === "registrar_movimiento") {
    $sku      = valid_string($body["sku"]      ?? null, 100);
    $cajaId   = isset($body["caja_id"]) && is_numeric($body["caja_id"])
                    ? (int)$body["caja_id"] : null;
    $unidades = isset($body["unidades"]) && is_numeric($body["unidades"])
                    ? (int)$body["unidades"] : null;
    $tipo     = valid_string($body["tipo"]     ?? null, 10);

    $missing = [];
    if ($sku      === null)                          $missing[] = "sku";
    if ($unidades === null || $unidades <= 0)        $missing[] = "unidades";
    if (!in_array($tipo, ["ENTRADA", "SALIDA"]))     $missing[] = "tipo (ENTRADA o SALIDA)";
    // caja_id es opcional — 0 significa movimiento directo sin caja física
    if ($cajaId === null) $cajaId = 0;

    if (!empty($missing)) {
        http_response_code(422);
        echo json_encode([
            "error" => "Campos inválidos o faltantes: " . implode(", ", $missing),
            "code"  => "INVALID_FIELDS"
        ]);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // 1. Verificar que el producto existe y obtener stock actual
        $stmt = $pdo->prepare("SELECT sku, stock FROM productos WHERE sku = :sku FOR UPDATE");
        $stmt->execute([":sku" => $sku]);
        $producto = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$producto) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(["error" => "Producto no encontrado.", "code" => "PRODUCT_NOT_FOUND"]);
            exit;
        }

        // 2. Validar que haya stock suficiente en SALIDA
        if ($tipo === "SALIDA" && $producto["stock"] < $unidades) {
            $pdo->rollBack();
            http_response_code(422);
            echo json_encode([
                "error"         => "Stock insuficiente.",
                "code"          => "INSUFFICIENT_STOCK",
                "stock_actual"  => $producto["stock"],
                "pedido"        => $unidades
            ]);
            exit;
        }

        // 3. Actualizar stock
        $delta = $tipo === "ENTRADA" ? $unidades : -$unidades;
        $stmt = $pdo->prepare(
            "UPDATE productos SET stock = stock + :delta WHERE sku = :sku"
        );
        $stmt->execute([":delta" => $delta, ":sku" => $sku]);

        // 4. Registrar movimiento (caja_id=0 si es movimiento directo)
        if ($cajaId > 0) {
            $stmt = $pdo->prepare(
                "INSERT INTO movimientos_inventario (caja_id, producto_sku, unidades, tipo)
                 VALUES (:caja_id, :sku, :unidades, :tipo)"
            );
            $stmt->execute([
                ":caja_id"  => $cajaId,
                ":sku"      => $sku,
                ":unidades" => $unidades,
                ":tipo"     => $tipo,
            ]);
        }

        $pdo->commit();

    } catch (Throwable $e) {
        $pdo->rollBack();
        api_log_error($e, "inventario:POST:registrar_movimiento sku={$sku}");
        http_response_code(500);
        echo json_encode(["error" => "No se pudo registrar el movimiento.", "code" => "MOVIMIENTO_SAVE_ERROR"]);
        exit;
    }

    echo json_encode([
        "ok"           => true,
        "sku"          => $sku,
        "tipo"         => $tipo,
        "unidades"     => $unidades,
        "stock_nuevo"  => $producto["stock"] + $delta,
    ]);
    exit;
}

    // POST action=registrar_producto_nuevo → registra producto desconocido escaneado
    if ($action === "registrar_producto_nuevo") {
        $ean      = valid_string($body["ean"]      ?? null, 20);
        $nombre   = valid_string($body["nombre"]   ?? null, 200);
        $shelfId  = valid_string($body["shelf_id"] ?? null, 100);
        $unidades = isset($body["unidades"]) && is_numeric($body["unidades"])
                        ? (int)$body["unidades"] : 1;

        $missing = [];
        if ($ean     === null) $missing[] = "ean";
        if ($nombre  === null) $missing[] = "nombre";
        if ($shelfId === null) $missing[] = "shelf_id";

        if (!empty($missing)) {
            http_response_code(422);
            echo json_encode(["error" => "Campos faltantes: " . implode(", ", $missing), "code" => "INVALID_FIELDS"]);
            exit;
        }

        $sku = "EAN-" . $ean;

        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare(
                "INSERT INTO productos (sku, ean, name, shelf_id, width, height, depth, stock)
                 VALUES (:sku, :ean, :name, :shelf_id, 10, 10, 10, :stock)
                 ON DUPLICATE KEY UPDATE ean = :ean2, stock = stock + :stock2"
            );
            $stmt->execute([
                ":sku" => $sku, ":ean" => $ean, ":name" => $nombre,
                ":shelf_id" => $shelfId, ":stock" => $unidades,
                ":ean2" => $ean, ":stock2" => $unidades,
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            api_log_error($e, "inventario:POST:registrar_producto_nuevo ean={$ean}");
            http_response_code(500);
            echo json_encode(["error" => "No se pudo registrar el producto.", "code" => "PRODUCTO_SAVE_ERROR"]);
            exit;
        }

        echo json_encode(["ok" => true, "sku" => $sku, "ean" => $ean, "nombre" => $nombre, "stock" => $unidades]);
        exit;
    }

    http_response_code(400);
    echo json_encode(["error" => "Acción no reconocida.", "code" => "UNKNOWN_ACTION"]);
    exit;
}

