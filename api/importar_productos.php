<?php
declare(strict_types=1);

require_once __DIR__ . "/database.php";

header("Content-Type: text/html; charset=utf-8");

$standardWidth = 0.24;
$standardHeight = 0.18;
$standardDepth = 0.22;

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);

    if (!db_table_exists($pdo, "catalogo_productos")) {
        throw new RuntimeException("No existe catalogo_productos. Importa primero productos_sinTamano.sql.");
    }

    $pdo->beginTransaction();

    $pdo->exec(
        "INSERT INTO categorias (nombre, slug)
         SELECT DISTINCT
            TRIM(COALESCE(NULLIF(categoria, ''), 'Sin categoria')),
            LOWER(REPLACE(TRIM(COALESCE(NULLIF(categoria, ''), 'Sin categoria')), ' ', '-'))
         FROM catalogo_productos
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)"
    );

    $pdo->exec(
        "INSERT INTO marcas (nombre, slug)
         SELECT DISTINCT
            TRIM(COALESCE(NULLIF(marca, ''), 'Sin marca')),
            LOWER(REPLACE(TRIM(COALESCE(NULLIF(marca, ''), 'Sin marca')), ' ', '-'))
         FROM catalogo_productos
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)"
    );

    $dimensionStmt = $pdo->prepare(
        "INSERT INTO producto_dimensiones (producto_sku, width, height, depth)
         SELECT sku, :width, :height, :depth
         FROM catalogo_productos
         ON DUPLICATE KEY UPDATE
            width = VALUES(width),
            height = VALUES(height),
            depth = VALUES(depth)"
    );
    $dimensionStmt->execute([
        ":width" => $standardWidth,
        ":height" => $standardHeight,
        ":depth" => $standardDepth,
    ]);

    $pdo->exec(
        "INSERT INTO productos (sku, shelf_id, name, category, categoria_id, marca_id, dimension_id, local_x, local_y, local_z)
         SELECT
            ranked.sku,
            CASE MOD(ranked.rn - 1, 5)
                WHEN 0 THEN 'S01'
                WHEN 1 THEN 'S02'
                WHEN 2 THEN 'S03'
                WHEN 3 THEN 'S04'
                ELSE 'S05'
            END AS shelf_id,
            ranked.name,
            cat.nombre AS category,
            cat.id AS categoria_id,
            marca.id AS marca_id,
            dimensions.id AS dimension_id,
            MOD(FLOOR((ranked.rn - 1) / 5), 11) * 0.26 AS local_x,
            MOD(FLOOR(FLOOR((ranked.rn - 1) / 5) / 66), 4) * 0.75 AS local_y,
            MOD(FLOOR(FLOOR((ranked.rn - 1) / 5) / 11), 6) * 0.24 AS local_z
         FROM (
            SELECT
                catalogo_productos.*,
                (@row_number := @row_number + 1) AS rn
            FROM catalogo_productos
            CROSS JOIN (SELECT @row_number := 0) vars
            ORDER BY CAST(catalogo_productos.sku AS UNSIGNED), catalogo_productos.sku
         ) ranked
         INNER JOIN categorias cat ON cat.nombre = TRIM(COALESCE(NULLIF(ranked.categoria, ''), 'Sin categoria'))
         INNER JOIN marcas marca ON marca.nombre = TRIM(COALESCE(NULLIF(ranked.marca, ''), 'Sin marca'))
         INNER JOIN producto_dimensiones dimensions ON dimensions.producto_sku = ranked.sku
         ON DUPLICATE KEY UPDATE
            shelf_id = VALUES(shelf_id),
            name = VALUES(name),
            category = VALUES(category),
            categoria_id = VALUES(categoria_id),
            marca_id = VALUES(marca_id),
            dimension_id = VALUES(dimension_id),
            local_x = VALUES(local_x),
            local_y = VALUES(local_y),
            local_z = VALUES(local_z)"
    );

    $pdo->commit();

    $counts = [
        "catalogo" => (int)$pdo->query("SELECT COUNT(*) FROM catalogo_productos")->fetchColumn(),
        "productos" => (int)$pdo->query("SELECT COUNT(*) FROM productos")->fetchColumn(),
        "categorias" => (int)$pdo->query("SELECT COUNT(*) FROM categorias")->fetchColumn(),
        "marcas" => (int)$pdo->query("SELECT COUNT(*) FROM marcas")->fetchColumn(),
        "dimensiones" => (int)$pdo->query("SELECT COUNT(*) FROM producto_dimensiones")->fetchColumn(),
    ];
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    api_log_error($e, "importar_productos");
    http_response_code(500);
    echo "<pre>Error: " . htmlspecialchars($e->getMessage(), ENT_QUOTES, "UTF-8") . "</pre>";
    exit;
}
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Importación de productos</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 2rem; color: #18212f; }
        main { max-width: 680px; }
        code { background: #eef2f6; padding: .15rem .35rem; border-radius: 4px; }
        li { margin: .4rem 0; }
    </style>
</head>
<body>
<main>
    <h1>Importación completada</h1>
    <p>Se importó el catálogo usando dimensiones estándar <code><?= $standardWidth ?> x <?= $standardHeight ?> x <?= $standardDepth ?></code>.</p>
    <ul>
        <li>Catálogo: <?= $counts["catalogo"] ?></li>
        <li>Productos ubicados: <?= $counts["productos"] ?></li>
        <li>Dimensiones: <?= $counts["dimensiones"] ?></li>
        <li>Categorías: <?= $counts["categorias"] ?></li>
        <li>Marcas: <?= $counts["marcas"] ?></li>
    </ul>
</main>
</body>
</html>
