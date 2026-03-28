<?php

declare(strict_types=1);

return [
    "id" => "202603270001_create_estantes_table",
    "up" => function (PDO $pdo): void {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS estantes (
                id VARCHAR(20) NOT NULL PRIMARY KEY,
                label VARCHAR(100) NOT NULL,
                sections INT NOT NULL DEFAULT 1,
                width FLOAT NOT NULL,
                height FLOAT NOT NULL,
                depth FLOAT NOT NULL,
                pos_x FLOAT NOT NULL DEFAULT 0,
                pos_y FLOAT NOT NULL DEFAULT 0,
                pos_z FLOAT NOT NULL DEFAULT 0,
                rotation_y FLOAT NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }
];
