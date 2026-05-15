<?php

declare(strict_types=1);

require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("GET, POST, OPTIONS");

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

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    try {
        $rows = $pdo->query("SELECT * FROM estantes ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
        $configRows = $pdo->query("SELECT config_key, config_value FROM almacen_config")->fetchAll(PDO::FETCH_KEY_PAIR);
    } catch (Throwable $e) {
        api_log_error($e, "config:GET");
        http_response_code(500);
        echo json_encode(["error" => "No se pudieron leer los estantes.", "code" => "SHELF_READ_ERROR"]);
        exit;
    }

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

        if (!empty($row["section_labels"])) {
            $decoded = json_decode($row["section_labels"], true);
            if (is_array($decoded) && count($decoded) > 0) {
                $shelf["sectionLabels"] = array_values(array_filter(
                    array_map(fn($label) => trim((string)$label), $decoded),
                    fn($label) => $label !== ""
                ));
            }
        }

        return $shelf;
    }, $rows);

    $entrance = isset($configRows["entrance"]) ? json_decode((string)$configRows["entrance"], true) : null;
    $aisles = isset($configRows["aisles"]) ? json_decode((string)$configRows["aisles"], true) : null;

    echo json_encode([
        "shelves" => $shelves,
        "entrance" => is_array($entrance) ? $entrance : default_warehouse_entrance(),
        "aisles" => is_array($aisles) ? $aisles : default_warehouse_aisles()
    ]);

} elseif ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true);

    if (!isset($body["shelves"]) || !is_array($body["shelves"])) {
        http_response_code(400);
        echo json_encode(["error" => "Formato invalido"]);
        exit;
    }

    // Validar cada estante antes de tocar la BD
    foreach ($body["shelves"] as $i => $shelf) {
        $errs = [];
        if (valid_string($shelf["id"] ?? null) === null)       $errs[] = "id";
        if (valid_string($shelf["label"] ?? null) === null)    $errs[] = "label";
        if (valid_positive_float($shelf["width"]  ?? null) === null) $errs[] = "width";
        if (valid_positive_float($shelf["height"] ?? null) === null) $errs[] = "height";
        if (valid_positive_float($shelf["depth"]  ?? null) === null) $errs[] = "depth";
        if (!isset($shelf["position"]["x"], $shelf["position"]["y"], $shelf["position"]["z"])
            || !is_numeric($shelf["position"]["x"])
            || !is_numeric($shelf["position"]["y"])
            || !is_numeric($shelf["position"]["z"])) {
            $errs[] = "position";
        }
        if (!empty($errs)) {
            http_response_code(422);
            echo json_encode(["error" => "Estante [{$i}] tiene campos invalidos: " . implode(", ", $errs)]);
            exit;
        }
    }

    $entrance = normalize_warehouse_entrance($body["entrance"] ?? null);
    $aisles = normalize_warehouse_aisles($body["aisles"] ?? []);

    // IDs recibidos en el payload
    $incomingIds = array_map(fn($s) => trim((string)$s["id"]), $body["shelves"]);

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
            (id, label, sections, board_offsets, section_labels, width, height, depth, pos_x, pos_y, pos_z, rotation_y)
        VALUES
            (:id, :label, :sections, :board_offsets, :section_labels, :width, :height, :depth, :pos_x, :pos_y, :pos_z, :rotation_y)
        ON DUPLICATE KEY UPDATE
            label         = VALUES(label),
            sections      = VALUES(sections),
            board_offsets = VALUES(board_offsets),
            section_labels = VALUES(section_labels),
            width         = VALUES(width),
            height        = VALUES(height),
            depth         = VALUES(depth),
            pos_x         = VALUES(pos_x),
            pos_y         = VALUES(pos_y),
            pos_z         = VALUES(pos_z),
            rotation_y    = VALUES(rotation_y)");

    try {
        foreach ($body["shelves"] as $shelf) {
            $boardOffsets = null;
            if (isset($shelf["boardOffsets"]) && is_array($shelf["boardOffsets"]) && count($shelf["boardOffsets"]) > 0) {
                $boardOffsets = json_encode($shelf["boardOffsets"]);
            }
            $sectionLabels = null;
            if (isset($shelf["sectionLabels"]) && is_array($shelf["sectionLabels"]) && count($shelf["sectionLabels"]) > 0) {
                $sectionLabels = json_encode(array_values(array_map(
                    fn($label) => trim((string)$label),
                    $shelf["sectionLabels"]
                )), JSON_UNESCAPED_UNICODE);
            }

            $stmt->execute([
                ":id"           => $shelf["id"],
                ":label"        => $shelf["label"],
                ":sections"     => (int)($shelf["sections"] ?? 1),
                ":board_offsets"=> $boardOffsets,
                ":section_labels"=> $sectionLabels,
                ":width"        => $shelf["width"],
                ":height"       => $shelf["height"],
                ":depth"        => $shelf["depth"],
                ":pos_x"        => $shelf["position"]["x"],
                ":pos_y"        => $shelf["position"]["y"],
                ":pos_z"        => $shelf["position"]["z"],
                ":rotation_y"   => $shelf["rotationY"] ?? 0
            ]);
        }

        upsert_config_value($pdo, "entrance", $entrance);
        upsert_config_value($pdo, "aisles", $aisles);
    } catch (Throwable $e) {
        api_log_error($e, "config:POST:upsert");
        http_response_code(500);
        echo json_encode(["error" => "No se pudieron guardar los estantes.", "code" => "SHELF_SAVE_ERROR"]);
        exit;
    }

    echo json_encode(["ok" => true]);
}

function default_warehouse_entrance(): array
{
    return [
        "label" => "Entrada principal",
        "position" => ["x" => 5.6, "y" => 0.04, "z" => 1.7]
    ];
}

function default_warehouse_aisles(): array
{
    return [
        [
            "id" => "P01",
            "label" => "Pasillo principal",
            "from" => ["x" => 5.6, "y" => 0.055, "z" => 1.7],
            "to" => ["x" => -4.8, "y" => 0.055, "z" => 1.7],
            "width" => 1.4
        ],
        [
            "id" => "P02",
            "label" => "Pasillo posterior",
            "from" => ["x" => -4.8, "y" => 0.055, "z" => 1.7],
            "to" => ["x" => -4.8, "y" => 0.055, "z" => -3.4],
            "width" => 1.2
        ]
    ];
}

function normalize_warehouse_entrance(mixed $entrance): array
{
    if (!is_array($entrance) || !isset($entrance["position"]) || !is_array($entrance["position"])) {
        return default_warehouse_entrance();
    }

    $position = $entrance["position"];
    if (!isset($position["x"], $position["z"]) || !is_numeric($position["x"]) || !is_numeric($position["z"])) {
        return default_warehouse_entrance();
    }

    return [
        "label" => valid_string($entrance["label"] ?? "Entrada principal", 100) ?? "Entrada principal",
        "position" => [
            "x" => (float)$position["x"],
            "y" => isset($position["y"]) && is_numeric($position["y"]) ? (float)$position["y"] : 0.04,
            "z" => (float)$position["z"]
        ]
    ];
}

function normalize_warehouse_aisles(mixed $aisles): array
{
    if (!is_array($aisles)) {
        return default_warehouse_aisles();
    }

    $normalized = [];
    foreach ($aisles as $index => $aisle) {
        if (!is_array($aisle) || !isset($aisle["from"], $aisle["to"]) || !is_array($aisle["from"]) || !is_array($aisle["to"])) {
            continue;
        }
        $from = $aisle["from"];
        $to = $aisle["to"];
        if (!isset($from["x"], $from["z"], $to["x"], $to["z"]) || !is_numeric($from["x"]) || !is_numeric($from["z"]) || !is_numeric($to["x"]) || !is_numeric($to["z"])) {
            continue;
        }
        $normalized[] = [
            "id" => valid_string($aisle["id"] ?? "P" . ($index + 1), 40) ?? "P" . ($index + 1),
            "label" => valid_string($aisle["label"] ?? "Pasillo " . ($index + 1), 100) ?? "Pasillo " . ($index + 1),
            "from" => [
                "x" => (float)$from["x"],
                "y" => isset($from["y"]) && is_numeric($from["y"]) ? (float)$from["y"] : 0.055,
                "z" => (float)$from["z"]
            ],
            "to" => [
                "x" => (float)$to["x"],
                "y" => isset($to["y"]) && is_numeric($to["y"]) ? (float)$to["y"] : 0.055,
                "z" => (float)$to["z"]
            ],
            "width" => isset($aisle["width"]) && is_numeric($aisle["width"]) ? max(0.4, (float)$aisle["width"]) : 1.2
        ];
    }

    return count($normalized) > 0 ? $normalized : default_warehouse_aisles();
}

function upsert_config_value(PDO $pdo, string $key, array $value): void
{
    $stmt = $pdo->prepare("INSERT INTO almacen_config (config_key, config_value)
        VALUES (:key_name, :value_json)
        ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)");
    $stmt->execute([
        ":key_name" => $key,
        ":value_json" => json_encode($value, JSON_UNESCAPED_UNICODE)
    ]);
}
