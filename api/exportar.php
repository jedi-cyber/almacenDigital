<?php

declare(strict_types=1);

require_once __DIR__ . "/database.php";

cors_headers("GET, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}
if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    api_fail(405, "Metodo no permitido.", "METHOD_NOT_ALLOWED");
}

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);
    $session = require_api_session($pdo);
    require_api_permission($session, "report:read");
} catch (Throwable $e) {
    api_log_error($e, "exportar:db_connect");
    api_fail(500, "No se pudo preparar la exportacion.", "EXPORT_DB_ERROR");
}

$type = strtolower(trim((string)($_GET["type"] ?? "inventory-csv")));

if ($type === "inventory-csv" || $type === "inventory-excel") {
    export_inventory_csv($pdo);
}

if ($type === "inventory-pdf") {
    export_inventory_printable_html($pdo);
}

if ($type === "config-backup") {
    export_config_backup($pdo);
}

api_fail(422, "Tipo de exportacion no soportado.", "INVALID_EXPORT_TYPE");

function inventory_rows(PDO $pdo): array
{
    return $pdo->query(
	        "SELECT
	            p.sku,
	            p.numero_serie,
	            p.name,
            p.shelf_id,
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
         ORDER BY p.shelf_id, p.sku"
    )->fetchAll(PDO::FETCH_ASSOC);
}

function export_inventory_csv(PDO $pdo): void
{
    $filename = "inventario-almacen-" . date("Ymd-His") . ".csv";
    header("Content-Type: text/csv; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"{$filename}\"");
    $out = fopen("php://output", "w");
    fwrite($out, "\xEF\xBB\xBF");
	    fputcsv($out, ["Numero de serie", "Producto", "Estante", "Categoria", "Marca", "X", "Y", "Z", "Ancho", "Alto", "Profundidad"]);
    foreach (inventory_rows($pdo) as $row) {
	        fputcsv($out, [
	            $row["numero_serie"],
	            $row["name"],
            $row["shelf_id"],
            $row["category"],
            $row["brand"],
            $row["local_x"],
            $row["local_y"],
            $row["local_z"],
            $row["width"],
            $row["height"],
            $row["depth"],
        ]);
    }
    fclose($out);
    exit;
}

function export_inventory_printable_html(PDO $pdo): void
{
    $rows = inventory_rows($pdo);
    header("Content-Type: text/html; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"inventario-almacen-" . date("Ymd-His") . ".html\"");
    echo "<!doctype html><meta charset=\"utf-8\"><title>Inventario</title>";
    echo "<style>body{font-family:Arial,sans-serif;margin:24px;color:#172033}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#e2e8f0}@media print{button{display:none}}</style>";
    echo "<button onclick=\"window.print()\">Guardar como PDF</button>";
    echo "<h1>Inventario del almacén</h1><p>Generado: " . htmlspecialchars(date("Y-m-d H:i:s"), ENT_QUOTES, "UTF-8") . "</p>";
	    echo "<table><thead><tr><th>Numero de serie</th><th>Producto</th><th>Estante</th><th>Categoria</th><th>Marca</th><th>Posicion</th><th>Medidas</th></tr></thead><tbody>";
    foreach ($rows as $row) {
	        echo "<tr>";
	        echo "<td>" . htmlspecialchars((string)($row["numero_serie"] ?? ""), ENT_QUOTES, "UTF-8") . "</td>";
	        echo "<td>" . htmlspecialchars((string)$row["name"], ENT_QUOTES, "UTF-8") . "</td>";
        echo "<td>" . htmlspecialchars((string)$row["shelf_id"], ENT_QUOTES, "UTF-8") . "</td>";
        echo "<td>" . htmlspecialchars((string)$row["category"], ENT_QUOTES, "UTF-8") . "</td>";
        echo "<td>" . htmlspecialchars((string)$row["brand"], ENT_QUOTES, "UTF-8") . "</td>";
        echo "<td>X {$row["local_x"]}, Y {$row["local_y"]}, Z {$row["local_z"]}</td>";
        echo "<td>{$row["width"]} x {$row["height"]} x {$row["depth"]} m</td>";
        echo "</tr>";
    }
    echo "</tbody></table>";
    exit;
}

function export_config_backup(PDO $pdo): void
{
    $shelves = $pdo->query("SELECT * FROM estantes ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    $config = $pdo->query("SELECT config_key, config_value FROM almacen_config")->fetchAll(PDO::FETCH_KEY_PAIR);
    header("Content-Type: application/json; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"respaldo-almacen-" . date("Ymd-His") . ".json\"");
    echo json_encode([
        "generatedAt" => date("c"),
        "shelves" => $shelves,
        "config" => array_map(fn($value) => json_decode((string)$value, true), $config),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
