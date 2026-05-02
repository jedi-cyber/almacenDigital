<?php

declare(strict_types=1);

return [
    "id" => "202605020007_seed_default_warehouse",
    "up" => function (PDO $pdo): void {
        $shelfCount = (int)$pdo->query("SELECT COUNT(*) FROM estantes")->fetchColumn();

        if ($shelfCount === 0) {
            $shelves = [
                [
                    "id" => "S01",
                    "label" => "Estante 1",
                    "sections" => 2,
                    "width" => 2,
                    "height" => 2,
                    "depth" => 0.8,
                    "pos_x" => 0.5,
                    "pos_y" => 1,
                    "pos_z" => 0.8,
                    "rotation_y" => 0,
                ],
                [
                    "id" => "S02",
                    "label" => "Estante 2",
                    "sections" => 4,
                    "width" => 5.2,
                    "height" => 2,
                    "depth" => 0.8,
                    "pos_x" => -1.3,
                    "pos_y" => 1,
                    "pos_z" => 2.6,
                    "rotation_y" => 0,
                ],
                [
                    "id" => "S03",
                    "label" => "Estante 3",
                    "sections" => 4,
                    "width" => 5.6,
                    "height" => 2.1,
                    "depth" => 0.8,
                    "pos_x" => -4.3,
                    "pos_y" => 1.05,
                    "pos_z" => -0.6,
                    "rotation_y" => 1.5707963267948966,
                ],
                [
                    "id" => "S04",
                    "label" => "Estante 4",
                    "sections" => 3,
                    "width" => 3,
                    "height" => 2.2,
                    "depth" => 0.8,
                    "pos_x" => -1,
                    "pos_y" => 1.1,
                    "pos_z" => -1,
                    "rotation_y" => 1.5707963267948966,
                ],
                [
                    "id" => "S05",
                    "label" => "Estante 5",
                    "sections" => 2,
                    "width" => 2.2,
                    "height" => 2,
                    "depth" => 0.8,
                    "pos_x" => -2.5,
                    "pos_y" => 1,
                    "pos_z" => -3,
                    "rotation_y" => 0,
                ],
            ];

            $stmt = $pdo->prepare(
                "INSERT INTO estantes
                    (id, label, sections, width, height, depth, pos_x, pos_y, pos_z, rotation_y)
                VALUES
                    (:id, :label, :sections, :width, :height, :depth, :pos_x, :pos_y, :pos_z, :rotation_y)"
            );

            foreach ($shelves as $shelf) {
                $stmt->execute($shelf);
            }
        }

        $productCount = (int)$pdo->query("SELECT COUNT(*) FROM productos")->fetchColumn();

        if ($productCount === 0) {
            $products = [
                [
                    "sku" => "DEMO-001",
                    "shelf_id" => "S01",
                    "name" => "Caja de tornillos",
                    "width" => 0.45,
                    "height" => 0.35,
                    "depth" => 0.35,
                    "local_x" => 0,
                    "local_y" => 0,
                    "local_z" => 0,
                ],
                [
                    "sku" => "DEMO-002",
                    "shelf_id" => "S01",
                    "name" => "Taladro compacto",
                    "width" => 0.6,
                    "height" => 0.45,
                    "depth" => 0.4,
                    "local_x" => 0.5,
                    "local_y" => 0,
                    "local_z" => 0,
                ],
                [
                    "sku" => "DEMO-003",
                    "shelf_id" => "S02",
                    "name" => "Cables organizadores",
                    "width" => 0.75,
                    "height" => 0.35,
                    "depth" => 0.35,
                    "local_x" => 0,
                    "local_y" => 0,
                    "local_z" => 0,
                ],
                [
                    "sku" => "DEMO-004",
                    "shelf_id" => "S03",
                    "name" => "Kit de sensores",
                    "width" => 0.5,
                    "height" => 0.4,
                    "depth" => 0.4,
                    "local_x" => 0,
                    "local_y" => 0,
                    "local_z" => 0,
                ],
            ];

            $stmt = $pdo->prepare(
                "INSERT INTO productos
                    (sku, shelf_id, name, width, height, depth, local_x, local_y, local_z)
                VALUES
                    (:sku, :shelf_id, :name, :width, :height, :depth, :local_x, :local_y, :local_z)"
            );

            foreach ($products as $product) {
                $stmt->execute($product);
            }
        }
    }
];
