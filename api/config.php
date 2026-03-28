<?php

declare(strict_types=1);

require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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
    $rows = $pdo->query("SELECT * FROM estantes ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);

    $shelves = array_map(function ($row) {
        $shelf = [
            "id"       => $row["id"],
            "label"    => $row["label"],
            "sections" => (int)($row["sections"] ?? 1),
            "width"    => (float)$row["width"],
            "height"   => (float)$row["height"],
            "depth"    => (float)$row["depth"],
            "position" => [
                "x" => (float)$row["pos_x"],
                "y" => (float)$row["pos_y"],
                "z" => (float)$row["pos_z"]
            ],
            "rotationY" => (float)$row["rotation_y"]
        ];

        if (!empty($row["board_offsets"])) {
            $decoded = json_decode($row["board_offsets"], true);
            if (is_array($decoded) && count($decoded) > 0) {
                $shelf["boardOffsets"] = $decoded;
            }
        }

        return $shelf;
    }, $rows);

    echo json_encode(["shelves" => $shelves]);

} elseif ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true);

    if (!isset($body["shelves"]) || !is_array($body["shelves"])) {
        http_response_code(400);
        echo json_encode(["error" => "Formato invalido"]);
        exit;
    }

    // IDs recibidos en el payload
    $incomingIds = array_map(fn($s) => $s["id"], $body["shelves"]);

    // Eliminar de la BD los estantes que ya no están en el payload
    $existingIds = $pdo->query("SELECT id FROM estantes")->fetchAll(PDO::FETCH_COLUMN);
    $toDelete = array_diff($existingIds, $incomingIds);
    if (count($toDelete) > 0) {
        $placeholders = implode(",", array_fill(0, count($toDelete), "?"));
        $del = $pdo->prepare("DELETE FROM estantes WHERE id IN ($placeholders)");
        $del->execute(array_values($toDelete));
    }

    // Upsert de los estantes recibidos
    $stmt = $pdo->prepare("INSERT INTO estantes
            (id, label, sections, board_offsets, width, height, depth, pos_x, pos_y, pos_z, rotation_y)
        VALUES
            (:id, :label, :sections, :board_offsets, :width, :height, :depth, :pos_x, :pos_y, :pos_z, :rotation_y)
        ON DUPLICATE KEY UPDATE
            label         = VALUES(label),
            sections      = VALUES(sections),
            board_offsets = VALUES(board_offsets),
            width         = VALUES(width),
            height        = VALUES(height),
            depth         = VALUES(depth),
            pos_x         = VALUES(pos_x),
            pos_y         = VALUES(pos_y),
            pos_z         = VALUES(pos_z),
            rotation_y    = VALUES(rotation_y)");

    foreach ($body["shelves"] as $shelf) {
        $boardOffsets = null;
        if (isset($shelf["boardOffsets"]) && is_array($shelf["boardOffsets"]) && count($shelf["boardOffsets"]) > 0) {
            $boardOffsets = json_encode($shelf["boardOffsets"]);
        }

        $stmt->execute([
            ":id"           => $shelf["id"],
            ":label"        => $shelf["label"],
            ":sections"     => (int)($shelf["sections"] ?? 1),
            ":board_offsets"=> $boardOffsets,
            ":width"        => $shelf["width"],
            ":height"       => $shelf["height"],
            ":depth"        => $shelf["depth"],
            ":pos_x"        => $shelf["position"]["x"],
            ":pos_y"        => $shelf["position"]["y"],
            ":pos_z"        => $shelf["position"]["z"],
            ":rotation_y"   => $shelf["rotationY"] ?? 0
        ]);
    }

    echo json_encode(["ok" => true]);
}
