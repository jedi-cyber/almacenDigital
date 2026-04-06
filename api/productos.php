<?php
require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    $pdo = db_connect(true);
    db_run_migrations($pdo);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Conexion fallida: " . $e->getMessage()]);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["error" => "Migracion fallida: " . $e->getMessage()]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $rows = $pdo->query("SELECT * FROM productos")->fetchAll(PDO::FETCH_ASSOC);

    $products = array_map(function ($row) {
        return [
            "shelfId" => $row["shelf_id"],
            "item" => [
                "sku"    => $row["sku"],
                "name"   => $row["name"],
                "width"  => (float)$row["width"],
                "height" => (float)$row["height"],
                "depth"  => (float)$row["depth"]
            ],
            "localPosition" => [
                "x" => (float)$row["local_x"],
                "y" => (float)$row["local_y"],
                "z" => (float)$row["local_z"]
            ]
        ];
    }, $rows);

    echo json_encode(["products" => $products]);

} elseif ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true);

    if (!isset($body["sku"], $body["shelfId"])) {
        http_response_code(400);
        echo json_encode(["error" => "Faltan campos obligatorios"]);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO productos
            (sku, shelf_id, name, width, height, depth, local_x, local_y, local_z)
        VALUES
            (:sku, :shelf_id, :name, :width, :height, :depth, :local_x, :local_y, :local_z)
        ON DUPLICATE KEY UPDATE
            shelf_id = VALUES(shelf_id),
            name     = VALUES(name),
            width    = VALUES(width),
            height   = VALUES(height),
            depth    = VALUES(depth),
            local_x  = VALUES(local_x),
            local_y  = VALUES(local_y),
            local_z  = VALUES(local_z)");

    $stmt->execute([
        ":sku"     => $body["sku"],
        ":shelf_id"=> $body["shelfId"],
        ":name"    => $body["name"] ?? $body["sku"],
        ":width"   => $body["width"],
        ":height"  => $body["height"],
        ":depth"   => $body["depth"],
        ":local_x" => $body["localPosition"]["x"],
        ":local_y" => $body["localPosition"]["y"],
        ":local_z" => $body["localPosition"]["z"]
    ]);

    echo json_encode(["ok" => true]);

} elseif ($_SERVER["REQUEST_METHOD"] === "DELETE") {
    $sku = $_GET["sku"] ?? "";
    if ($sku === "") {
        http_response_code(400);
        echo json_encode(["error" => "SKU requerido"]);
        exit;
    }

    $stmt = $pdo->prepare("DELETE FROM productos WHERE sku = :sku");
    $stmt->execute([":sku" => $sku]);
    echo json_encode(["ok" => true]);
}
